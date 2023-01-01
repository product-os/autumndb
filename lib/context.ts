import * as assert from '@balena/jellyfish-assert';
import * as logger from '@balena/jellyfish-logger';
import * as _ from 'lodash';
import { randomUUID } from 'node:crypto';
import { Notification, PoolClient, QueryConfig, QueryResultRow } from 'pg';
import * as pgFormat from 'pg-format';
import * as errors from './errors';

const LOGGER = logger.getLogger('autumndb');

/**
 * Context object encapsulating the current execution context.
 */
export class Context {
	private connection: PoolClient | null = null;
	private serialization: { query: Promise<void> } = {
		query: Promise.resolve(),
	};
	private transactionData: {
		depth: number;
		isolation: TransactionIsolation;
	} | null = null;
	private queryBlockReason: string | null = null;

	/**
	 * Constructor.
	 */
	public constructor(
		private logContext: logger.LogContext,
		private database?: Database,
	) {}

	/**
	 * Build a `Context` from a `MixedContext`.
	 */
	public static fromMixed(
		mixedContext: MixedContext,
		database?: Database,
	): Context {
		if (mixedContext instanceof Context) {
			return mixedContext;
		}

		return new Context(mixedContext, database);
	}

	/**
	 * Get the wrapped log context.
	 */
	public getLogContext(): logger.LogContext {
		return this.logContext;
	}

	/**
	 * Log a debug message.
	 */
	public debug(message: string, data?: object) {
		LOGGER.debug(this.logContext, message, data);
	}

	/**
	 * Log an informational message.
	 */
	public info(message: string, data?: object) {
		LOGGER.info(this.logContext, message, data);
	}

	/**
	 * Log a warning message.
	 */
	public warn(message: string, data?: object) {
		LOGGER.warn(this.logContext, message, data);
	}

	/**
	 * Log an error message.
	 */
	public error(message: string, data?: object) {
		LOGGER.error(this.logContext, message, data);
	}

	/**
	 * Log an exception.
	 */
	public exception(message: string, data: Error) {
		LOGGER.exception(this.logContext, message, data);
	}

	/**
	 * Assert an expression.
	 */
	public assertInternal(
		expression: assert.AssertExpression,
		error: assert.AssertErrorConstructor,
		message: assert.AssertMessage,
	) {
		assert.INTERNAL(this.logContext, expression, error, message);
	}

	/**
	 * Assert an expression.
	 */
	public assertUser(
		expression: assert.AssertExpression,
		error: assert.AssertErrorConstructor,
		message: assert.AssertMessage,
	) {
		assert.USER(this.logContext, expression, error, message);
	}

	/**
	 * Get a connection to the database and run the give callback within its
	 * context. Reuses the same connection if called within
	 * `withDatabaseConnection` or `withTransaction` and the `forceNew: true`
	 * is specified. Otherwise retrieves a new connection.
	 */
	public async withDatabaseConnection<T>(
		cb: (context: Context) => Promise<T>,
		options?: { forceNew: true },
	): Promise<T> {
		this.assertUser(
			!this.queryBlockReason,
			errors.JellyfishTransactionError,
			this.queryBlockReason!,
		);

		let cbPromise: Promise<T>;
		let discardContext: Context | null = null;
		if (this.connection && !options?.forceNew) {
			cbPromise = cb(this);

			// Await for the promise chain to resolve and add `cbPromise` to
			// it. The next query with this connection will only start after
			// `cbPromise` resolves
			await this.serialization.query;
			this.serialization.query = this.serialization.query
				.then(() =>
					cbPromise.then(() => {
						/**/
					}),
				)
				.catch(() => {
					/**/
				});
		} else {
			const connection = await this.database!.getConnection();
			const context = this.cloneWithConnection(connection);
			discardContext = context;

			// Make sure we avoid a potential leak if `cb` throws before
			// returning the promise
			try {
				cbPromise = cb(context);

				// There is no need to serialize these cases
			} catch (error: unknown) {
				context.connection = null;
				await this.database!.releaseConnection(connection);

				throw saneError(error);
			}
		}

		try {
			const result = await cbPromise;
			return result;
		} catch (error: unknown) {
			throw saneError(error);
		} finally {
			if (discardContext) {
				// Unset `connection` before awaiting so
				const connection = discardContext.connection!;
				discardContext.connection = null;
				discardContext.queryBlockReason =
					'Cannot reuse a child context after its connection was released';
				await this.database!.releaseConnection(connection);
			}
		}
	}

	/**
	 * Run the provided callback within the context of a new transaction. If
	 * already in a transaction, a savepoint is created.
	 */
	public async withTransaction<T>(
		isolation: TransactionIsolation,
		cb: (context: Context) => Promise<T>,
	): Promise<T> {
		this.assertUser(
			!this.transactionData || this.transactionData.isolation === isolation,
			errors.JellyfishInvalidTransactionNesting,
			'Cannot nest transactions with different isolation levels',
		);

		// Translate the `TransactionIsolation` command into the actual
		// statements PG accepts
		let pgIsolation: string;
		if (isolation === TransactionIsolation.Atomic) {
			pgIsolation = 'READ COMMITTED';
		} else if (isolation === TransactionIsolation.Snapshot) {
			pgIsolation = 'REPEATABLE READ';
		} else if (isolation === TransactionIsolation.Serialized) {
			pgIsolation = 'SERIALIZABLE';
		} else {
			this.assertInternal(
				false,
				errors.JellyfishInvalidTransactionIsolation,
				`Invalid transaction isolation: ${isolation}`,
			);
		}

		const parent = this;
		return this.withDatabaseConnection(
			async (maybeContext: Context): Promise<T> => {
				// Ensure the child context is a different instance from the
				// parent so we can modify them independently
				const context = maybeContext.clone();

				// Block queries for the parent context while the transaction
				// is running. Otherwise any queries will be mistakenly
				// included in the transaction since the connections is shared
				if (parent.connection) {
					parent.queryBlockReason =
						'Cannot use the parent Context while a transaction is running';
				}

				const connection = context.connection!;
				if (context.transactionData) {
					context.transactionData.depth++;
					await connection.query(
						`SAVEPOINT "${context.transactionData.depth}"`,
					);
				} else {
					context.transactionData = {
						depth: 0,
						isolation,
					};
					await connection.query(`BEGIN ISOLATION LEVEL ${pgIsolation}`);
				}

				try {
					const results = await cb(context);

					if (context.transactionData.depth === 0) {
						await connection.query('COMMIT');
					} else {
						await connection.query(
							`RELEASE SAVEPOINT "${context.transactionData.depth}"`,
						);
					}

					return results;
				} catch (error: unknown) {
					if (context.transactionData.depth === 0) {
						await connection.query('ROLLBACK');
					} else {
						await connection.query(
							`ROLLBACK TO "${context.transactionData.depth}"`,
						);
					}

					throw saneError(error);
				} finally {
					// The parent can now run queries normally but the child
					// context cannot be used for queries anymore if it escapes
					// the callback's scope
					if (parent.queryBlockReason) {
						parent.queryBlockReason = null;
					}
					context.database = undefined;
					context.connection = null;
					context.transactionData = null;
					context.queryBlockReason = 'Transaction has resolved';
				}
			},
		);
	}

	private clone(): Context {
		// Cannot use `_.clone` here as it also does a shallow clone of `this`'
		// property values.
		const clone = new Context(this.logContext, this.database);
		clone.connection = this.connection;

		// Deep clone composite states to make sure the clone isn't sharing
		// what should be independent states with the parent
		clone.transactionData = _.cloneDeep(this.transactionData);

		// This is a special case. The serialization data has to be shared
		// when there is a connection, because we need to serialize access to
		// it. On the other hand if there is no connection it cannot be shared
		// otherwise independent connections will be force into a single
		// serialization
		if (!this.connection) {
			clone.serialization = { query: Promise.resolve() };
		}

		// This method is private and is only useful to create derived
		// contexts. In none of those cases we need to clone
		// `queryBlockReason`

		return clone;
	}

	/**
	 * Clone `this` while replacing `this.connection` with the given
	 * `connection`.
	 */
	private cloneWithConnection(connection: PoolClient): Context {
		const clone = this.clone();
		clone.connection = connection;

		return clone;
	}

	/**
	 * Run a query and ignore its results.
	 */
	public async runQuery(query: Query, parameters?: any[]): Promise<void> {
		// `pg` doesn't provide this functionality so we just use `query` here
		await this.query(query, parameters);
	}

	/**
	 * Run a query and return its results.
	 */
	public async query<T extends QueryResultRow = any>(
		query: Query,
		parameters?: any[],
	): Promise<T[]> {
		try {
			return (
				await this.withDatabaseConnection((context: Context) => {
					let textOrConfig: any;
					if (query instanceof PgPreparedStatement) {
						textOrConfig = query.asQueryConfig(parameters);
					} else {
						textOrConfig = query;
					}

					try {
						return context.connection!.query<T>(textOrConfig, parameters);
					} catch (error: unknown) {
						context.error('Postgres error', { error, query, parameters });
						throw error;
					}
				})
			).rows;
		} catch (error: any) {
			console.error(error);
			this.assertUser(
				!error.message.startsWith('Query read timeout') &&
					!error.message.startsWith(
						'canceling statement due to statement timeout',
					) &&
					!error.message.startsWith(
						'canceling statement due to user request',
					) &&
					!error.message.includes('statement timeout'),
				errors.JellyfishDatabaseTimeoutError,
				() => {
					return `Query timeout: query: ${JSON.stringify(query)}`;
				},
			);
			this.assertUser(
				!error.message.startsWith('invalid regular expression:'),
				errors.JellyfishInvalidRegularExpression,
				() => {
					return `Invalid pattern in schema: ${JSON.stringify(query)}`;
				},
			);
			throw error;
		}
	}

	/**
	 * Run a query and return either zero or a single result. Throws if the
	 * query returns more than one result.
	 */
	public async queryZeroOrOne<T = any>(
		query: Query,
		parameters?: any[],
	): Promise<T | null> {
		const results = await this.query(query, parameters);
		this.assertUser(
			results.length <= 1,
			errors.JellyfishBadResultSetSize,
			`Expected no more than one result, got ${results.length}`,
		);

		return results[0] || null;
	}

	/**
	 * Run a query and return a single result. Throws if the query returns
	 * either zero or more than one result.
	 */
	public async queryOne<T = any>(query: Query, parameters?: any[]): Promise<T> {
		const results = await this.query(query, parameters);
		this.assertUser(
			results.length === 1,
			errors.JellyfishBadResultSetSize,
			`Expected a single result, got ${results.length}`,
		);

		return results[0];
	}

	/**
	 * Create a new prepared statement that can be used with `runQuery` and the
	 * `query*` methods.
	 */
	public static prepareQuery(query: string): PreparedStatement {
		return new PgPreparedStatement(query);
	}

	/**
	 * Listen for `NOTIFY`s on the given channel.
	 *
	 * This method reserves one connection from the pool for notifications.
	 * This connection is unusable to normal queries as it must be kept outside
	 * the usual lifecycle.
	 *
	 * TODO: actually have one global connection per database for
	 * notifications.
	 */
	public async listenForDatabaseNotifications(
		channel: string,
		listener: (notification: Notification) => void,
		end: () => Promise<void>,
	): Promise<DatabaseNotificationHandler> {
		const connection = await this.database!.getConnection();
		const formattedChannel = pgFormat.ident(channel);
		try {
			connection.on('notification', listener);
			await connection.query(`LISTEN ${formattedChannel}`);
		} catch (err: unknown) {
			connection.off('notification', listener);
			throw err;
		}

		const options = { drop: true };
		const endListener = () => {
			options.drop = false;
			end();
		};
		connection.on('end', endListener);

		return new DatabaseNotificationHandler(async () => {
			if (!options.drop) {
				return;
			}

			connection.off('end', endListener);
			connection.off('notification', listener);

			try {
				await connection.query(`UNLISTEN ${formattedChannel}`);
			} catch {
				// We don't care if `UNLISTEN` fails for any reason
			}

			await this.database!.releaseConnection(connection);
		});
	}
}

/**
 * Union type useful when a function can accept either a `Context` object or
 * a raw `LogContext`.
 */
export type MixedContext = Context | logger.LogContext;

/**
 * Interface for databases that can be used with a `Context`.
 */
export interface Database {
	getConnection(): Promise<PoolClient>;
	releaseConnection(connection: PoolClient): Promise<void>;
}

/**
 * A query. This might be in the form of a literal SQL string or a prepared
 * statement.
 */
export type Query = string | PreparedStatement;

/**
 * Isolation mode for transactions.
 */
export enum TransactionIsolation {
	/**
	 * The transaction is atomic but any updates commited to the database while
	 * the transaction is running will also be seen from inside the
	 * transaction.
	 */
	Atomic,

	/**
	 * Like `Atomic` but the transaction only sees the snapshot of the database
	 * from when the transaction was started even if other transactions commit.
	 */
	Snapshot,

	/**
	 * Like `Snapshot`, but on commit the transaction will fail with a
	 * serialization error if a concurrent update to the database would've
	 * changed the result of one or more operations in the transaction.
	 */
	Serialized,
}

/**
 * A prepared statement. There are no meaningful operations that can be done by
 * other modules so this is interface is empty and only useful for type
 * checking.
 */
// tslint:disable-next-line:no-empty-interface
export interface PreparedStatement {}

class PgPreparedStatement implements PreparedStatement {
	private name: string = randomUUID();

	public constructor(private query: string) {}

	public asQueryConfig(parameters?: any[]): QueryConfig {
		return {
			name: this.name,
			text: this.query,
			values: parameters,
		};
	}
}

/**
 * Handler for database `NOTIFY` listeners.
 */
export class DatabaseNotificationHandler {
	private release: (() => Promise<void>) | null;

	/**
	 * Builds a new `DatabaseNotificationHandler` with the given release
	 * function.
	 */
	public constructor(release: () => Promise<void>) {
		this.release = release;
	}

	/**
	 * End this listener and return the connection to the pool.
	 */
	public async end() {
		if (!this.release) {
			return;
		}

		await this.release();
		this.release = null;
	}
}

/**
 * Ensure the error has a sane stacktrace.
 */
const saneError = (err: unknown): Error => {
	if (err instanceof Error) {
		err.stack += `\nCaller trace:\n${new Error().stack}`;
		return err;
	} else {
		return new Error(`${err}`);
	}
};
