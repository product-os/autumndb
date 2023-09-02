import * as Bluebird from 'bluebird';
import * as fastEquals from 'fast-equals';
import * as _ from 'lodash';
import { strict as nativeAssert } from 'node:assert';
import { setTimeout } from 'node:timers/promises';
import { performance } from 'perf_hooks';
import { Pool, PoolClient } from 'pg';
import * as semver from 'semver';
import * as skhema from 'skhema';
import { setTimeout as delay } from 'timers/promises';
import type { Cache } from '../../cache';
import { Context, Database, Query, TransactionIsolation } from '../../context';
import * as errors from '../../errors';
import type { StreamOptions } from '../../kernel';
import type {
	Contract,
	ContractDefinition,
	JsonSchema,
	LinkContract,
	UserContract,
} from '../../types';
import * as cards from './cards';
import * as jsonschema2sql from './jsonschema2sql';
import * as links from './links';
import * as streams from './streams';
import type {
	BackendQueryOptions,
	SearchFieldDef,
	SelectObject,
} from './types';
import * as utils from './utils';
export type { StreamChange } from './streams';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: coreVersion } = require('../../../package.json');

export const INDEX_TABLE = 'jf_indexes';

// Removes version fields from database rows, as they are an
// abstraction over the `version` field on contracts
const removeVersionFields = (row?: any) => {
	if (row) {
		Reflect.deleteProperty(row, 'version_major');
		Reflect.deleteProperty(row, 'version_minor');
		Reflect.deleteProperty(row, 'version_patch');
		Reflect.deleteProperty(row, 'version_prerelease');
		Reflect.deleteProperty(row, 'version_build');
	}

	return row;
};

// List of Postgres error codes we can safely ignore during initial db setup.
// All error codes: https://www.postgresql.org/docs/12/errcodes-appendix.html
// 23505: unique violation error
// 42P07: duplicate table error
const INIT_IGNORE_CODES = ['23505', '42P07'];

/**
 * Check if a database error encountered on init is safe to ignore.
 * These errors can occur when multiple services starting at the same time
 * attempt to execute the same SQL simultaneously, resulting in duplicate key
 * or unique violation errors.
 * See: https://www.postgresql.org/docs/12/errcodes-appendix.html
 *
 * @function
 *
 * @param {String} code - Postgres error code
 * @returns {Boolean} flag denoting if error is OK to ignore or not
 *
 * @example
 * try {
 *   await this.getConnection().any(`CREATE DATABASE mydb`)
 * } catch (error) {
 *   if (!isIgnorableInitError(error.code)) {
 *     throw error
 *   }
 * }
 */
export const isIgnorableInitError = (code: string): boolean => {
	return _.includes(INIT_IGNORE_CODES, code);
};

/*
 * See https://github.com/product-os/jellyfish/issues/2401
 */
export const MAXIMUM_QUERY_LIMIT = 1000;

// Amount of time to wait before retrying connect
const DEFAULT_CONNECT_RETRY_DELAY = 2000;

export const compileSchema = (
	context: Context,
	table: string,
	select: SelectObject,
	schema: JsonSchema,
	options: BackendQueryOptions,
): { query: string; queryGenTime: number } => {
	const queryGenStart = performance.now();
	let query = null;
	try {
		query = jsonschema2sql.compile(context, table, select, schema, options);
	} catch (error: any) {
		if (error.name === 'InvalidSchema') {
			throw new errors.JellyfishInvalidSchema(error.message);
		}
		throw error;
	}
	const queryGenEnd = performance.now();
	const queryGenTime = queryGenEnd - queryGenStart;
	return {
		query,
		queryGenTime,
	};
};

export const runQuery = async (
	context: Context,
	schema: JsonSchema,
	query: Query,
	values?: any[],
) => {
	const queryStart = performance.now();
	const results = await context
		.query(query, values)
		.catch((error: { message: string }) => {
			context.assertUser(
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
					return `Query timeout: query: ${JSON.stringify(
						query,
					)} schema: ${JSON.stringify(schema)}`;
				},
			);
			context.assertUser(
				!error.message.startsWith('invalid regular expression:'),
				errors.JellyfishInvalidRegularExpression,
				() => {
					return `Invalid pattern in schema: ${JSON.stringify(schema)}`;
				},
			);
			context.error(
				`Error ${error.message} running query: ${JSON.stringify(
					query,
				)} schema: ${JSON.stringify(schema)}`,
			);
			throw error;
		});

	const queryEnd = performance.now();
	const queryTime = queryEnd - queryStart;

	const { elements, postProcessTime } = postProcessResults(results);

	return {
		elements,
		queryTime,
		postProcessTime,
	};
};

const postProcessCard = (card: Contract) => {
	if ('links' in card) {
		const cardLinks = card.links!;
		for (const [linkType, linked] of Object.entries(cardLinks)) {
			if (linked.length === 0) {
				Reflect.deleteProperty(cardLinks, linkType);
			} else {
				cardLinks[linkType] = linked.map((linkedCard: any) => {
					return postProcessCard(linkedCard);
				});
			}
		}
	}
	return removeVersionFields(utils.convertDatesToISOString(card));
};

const postProcessResults = (results: Array<{ payload: any }>) => {
	const postProcessStart = performance.now();
	const elements = results.map((wrapper: { payload: any }) => {
		return postProcessCard(wrapper.payload);
	});
	const postProcessEnd = performance.now();
	const postProcessTime = postProcessEnd - postProcessStart;
	return {
		elements,
		postProcessTime,
	};
};

export interface PostgresBackendOptions {
	database: string;
	connectRetryDelay?: number;
	user: string;
	host?: string;
	password?: string;
	port?: string | number;
	idleTimeoutMillis?: number;
	statement_timeout?: number;
	query_timeout?: number;
	connectionTimeoutMillis?: number; // this is also used for waiting for a connection from the pool
	keepAlive?: boolean;
	max?: number; // pool size
	maxUses?: number;
}

const defaultPgOptions: Partial<PostgresBackendOptions> = {
	statement_timeout: 30 * 1000, // pg timeout : canceling statement due to statement timeout
	query_timeout: 30 * 1000, // this is a node-postgres parameter; throws Query read timeout
	idleTimeoutMillis: 60 * 1000,
	connectionTimeoutMillis: 30 * 1000,
	keepAlive: true,
	max: 10, // same as default https://github.com/brianc/node-postgres/blob/master/packages/pg-pool/index.js#L84
	maxUses: 200000,
};

/*
 * This class implements CRUD operations and streaming for contracts, backed by
 * Postgres.
 */
export class PostgresBackend implements Database {
	public pool: Pool | null = null;
	private options: PostgresBackendOptions;
	private databaseName: string;
	private connectRetryDelay: number;
	private streamClient: streams.Streamer | null = null;
	private hasInitializedOnce = false;

	/*
	 * The constructor takes:
	 *
	 * - A (probably shared) cache instance that this backend can
	 *   use and maintain to speed up queries.
	 * - A set of rich errors classes the instance can throw
	 * - Various connection options
	 */
	public constructor(
		private cache: Cache | null,
		options: PostgresBackendOptions,
	) {
		this.cache = cache;
		/*
		 * Omit the options that are empty strings; keep numbers as they are
		 */
		this.options = _.omitBy(
			options,
			(param) => _.isString(param) && _.isEmpty(param),
		) as any;
		/*
		 * The PostgreSQL database name that we will connect to.
		 * We don't hardcode it as we want to be able to target
		 * different databases for parallel automated testing
		 * purposes.
		 */
		this.databaseName = options.database.toLowerCase();
		// The amount of time in milliseconds to wait before performing subsequent connect/reconnect attempts.
		this.connectRetryDelay = _.isNumber(options.connectRetryDelay)
			? options.connectRetryDelay
			: DEFAULT_CONNECT_RETRY_DELAY;
	}

	/*
	 * This method connects the instance to the database. Clients
	 * need to call it before being able to use any other method.
	 * This logic would ideally be in the class constructor, but
	 * its async nature forces us to make it a separate method.
	 *
	 * This method is a bit messy because a Postgres connection is
	 * tied to a particular database. As we don't know if the
	 * database the user specified exists, then we need to:
	 *
	 * 1. Connect to the default "postgres" database
	 * 2. Use that connection to list the available databases
	 *    and potentially create the desired one
	 * 3. Disconnect, and create a new connection to the database
	 *    that we're actually interested in
	 */
	async connect(context: Context) {
		const ourContext = new Context(context.getLogContext(), this);
		let connected = false;
		while (connected === false) {
			try {
				await this.tryConnect(ourContext);
				connected = true;
			} catch (error: unknown) {
				context.warn(
					`Connection to database failed. Retrying in ${this.connectRetryDelay} milliseconds`,
					{ error },
				);
				await setTimeout(this.connectRetryDelay);
			}
		}
	}

	private async tryConnect(context: Context) {
		/*
		 * Drop any existing connection so we don't risk having any leaks.
		 */
		await this.disconnect(context);

		/*
		 * Connect to the default database. It should always be available.
		 */
		context.info('Connecting to database', {
			databaseName: this.databaseName,
		});
		this.pool = new Pool({
			...defaultPgOptions,
			...this.options,
			port: Number(this.options.port),
			database: 'postgres',
		});

		/*
		 * This is an arbitrary request just to make sure that the connection
		 * was made successfully. Retry connection on fail.
		 */
		const [{ version }] = (await this.pool.query('select version()')).rows;
		context.info('Connection to database successful!', { version });

		/*
		 * List all available databases so we know if we have to create the
		 * one that the client specified or not.
		 *
		 * Notice that the "pg_database" table may contain database templates,
		 * which we are of course not interested in. See:
		 * https://www.postgresql.org/docs/9.3/manage-ag-templatedbs.html
		 */
		context.debug('Listing databases');
		const databases = _.map(
			(
				await this.pool.query(`
					SELECT datname FROM pg_database
					WHERE datistemplate = false
				`)
			).rows,
			'datname',
		);

		/*
		 * Of course, we only want to create the database if it doesn't exist.
		 * Too bad that Postgres doesn't support an "IF NOT EXISTS" with
		 * "CREATE DATABASE" so we could avoid these checks.
		 */
		if (!databases.includes(this.databaseName)) {
			/*
			 * The owner of the database should be the user that the client
			 * specified.
			 */
			context.debug('Creating database', { databaseName: this.databaseName });
			try {
				await this.pool.query(`
					CREATE DATABASE ${this.databaseName}
					OWNER = ${this.options.user}
				`);
			} catch (error: any) {
				if (!isIgnorableInitError(error.code)) {
					throw error;
				}
			}
		}

		/*
		 * If the database is fresh, then the in-memory cache should be
		 * as well.
		 */
		await this.cache?.reset();

		/*
		 * At this point we either created the desired database, or confirmed
		 * that it exists, so lets disconnect from the default database and
		 * connect to the one we're interested in.
		 */
		await this.disconnect(context);
		const dbOptions = {
			...defaultPgOptions,
			...this.options,
			database: this.databaseName,
			port: Number(this.options.port),
		};
		context.info(
			'Connecting with dbOptions',
			_.omit(dbOptions, ['user', 'password']),
		);
		this.pool = new Pool(dbOptions);

		/*
		 * Add an error handler.
		 */
		this.pool.on('error', (err: Error) => {
			context.error('Backend connection pool error', err);
		});

		/*
		 * Initialize streams.
		 */
		this.streamClient = await streams.start(context, cards.TABLE);

		/*
		 * Everything from this point on is unecessary if we know that
		 * `connect` was called successfully at least once.
		 */
		if (this.hasInitializedOnce) {
			return;
		}

		await this.runDbMigrations(context);

		this.hasInitializedOnce = true;
	}

	/*
	 * This method first ensures that the migrations table exists, and then
	 * executes the provided callback in a transaction if the installed version
	 * of autumndb is newer than what is in the migrations table.
	 */
	private async executeIfDbSchemaIsOutdated(
		context: Context,
		migrationsCb: (context: Context) => Promise<any>,
	) {
		const migrationsTable = 'jf_db_migrations';
		const migrationsId = 0;

		// "IF NOT EXISTS" is unexpectedly not thread safe. This is only a problem on the first start and any real
		// errors will be caught by subsequent SQL statements.
		try {
			await context.runQuery(`
				CREATE TABLE IF NOT EXISTS ${migrationsTable} (
					id INTEGER PRIMARY KEY NOT NULL,
					version TEXT NOT NULL,
					updated_at TIMESTAMP WITH TIME ZONE
				)
			`);
		} catch (err: any) {
			context.warn('ignoring initial DB error', err);
		}
		await context.runQuery(
			`
			INSERT INTO ${migrationsTable} (id, version, updated_at)
			VALUES ($1, $2, now())
			ON CONFLICT (id) DO NOTHING
			`,
			[migrationsId, '0.0.0'],
		);
		await context.withTransaction(
			TransactionIsolation.Atomic,
			async (transactionContext: Context) => {
				const [{ version }] = await transactionContext.query(
					`
					SELECT id, version, updated_at
					FROM ${migrationsTable}
					WHERE id=$1
					FOR UPDATE
					`,
					[migrationsId],
				);

				// Checking for newer versions instead of just testing for inequality ensures that a restarting pod
				// that is running an old version will not interfere with a new version being rolled out.
				// We could do better than just checking for the version of course, but that is better left to a proper migration framework
				const willRunMigrations = semver.compare(version, coreVersion) === -1;
				transactionContext.info('Preparing DB migrations', {
					dbVersion: version,
					coreVersion,
					willRunMigrations,
				});
				if (!willRunMigrations) {
					transactionContext.info(
						'DB schema is up to date. No migrations will be run',
					);
					return;
				}
				await migrationsCb(transactionContext);
				await transactionContext.runQuery(
					`
					UPDATE ${migrationsTable}
					SET version=$1, updated_at=now()
					WHERE id=$2
					`,
					[coreVersion, migrationsId],
				);
			},
		);
		context.info('DB migrations finished');
	}

	/*
	 * This method runs heavy setup operations after asserting
	 * that executing the operations are necessary. The operations
	 * are executed within a transaction ensuring that they are only
	 * executed once by a single instance.
	 */
	private async runDbMigrations(context: Context) {
		await this.executeIfDbSchemaIsOutdated(
			context,
			async (childContext: Context) => {
				try {
					await cards.setup(childContext, this);
				} catch (error: any) {
					if (!isIgnorableInitError(error.code)) {
						throw error;
					}
				}

				try {
					await links.setup(childContext, this, this.databaseName, {
						cards: cards.TABLE,
					});
				} catch (error: any) {
					if (!isIgnorableInitError(error.code)) {
						throw error;
					}
				}

				try {
					await streams.setupTrigger(
						childContext,
						cards.TABLE,
						cards.TRIGGER_COLUMNS,
					);
				} catch (error: any) {
					if (!isIgnorableInitError(error.code)) {
						throw error;
					}
				}
			},
		);
		this.hasInitializedOnce = true;
	}

	/*
	 * This method takes care of gracefully disconnecting from
	 * Postgres, and its mainly used during automated testing.
	 */
	async disconnect(context: Context) {
		await this.streamClient?.disconnect();
		this.streamClient = null;

		/*
		 * Close the main connection pool.
		 */
		if (this.pool) {
			// Allow a small grace period for ongoing transactions to finish before ending the pool.
			// This is a hack and should be replaced with determinstic approach to draining the pool.
			await delay(50);
			context.debug('Disconnecting from database', {
				databaseName: this.databaseName,
			});
			await this.pool.end();
			this.pool = null;
		}
	}

	/*
	 * Drop the database tables.
	 */
	async drop(context: Context) {
		if (!this.pool) {
			return;
		}

		context.debug('Dropping database tables', {
			databaseName: this.databaseName,
		});

		await context.query(`DROP TABLE ${cards.TABLE}, ${links.TABLE} CASCADE`);
	}

	/*
	 * Reset the database state.
	 */
	async reset(context: Context) {
		context.debug('Resetting database', { databaseName: this.databaseName });

		await context.runQuery(`TRUNCATE ${links.TABLE}, ${cards.TABLE}`);
	}

	/*
	 * Insert a card to the database, and throw an error
	 * if a card with the same id or slug already exists.
	 */
	async insertElement<T extends Contract = Contract>(
		context: Context,
		object: Omit<Contract, 'id'> & Partial<Pick<Contract, 'id'>>,
	): Promise<T> {
		return this.upsertObject<T>(context, object, {
			replace: false,
		});
	}

	/*
	 * Insert a card to the database, or replace it
	 * if a card with the same id or slug already exists.
	 */
	async upsertElement<T extends Contract = Contract>(
		context: Context,
		object: Omit<Contract, 'id'> & Partial<Pick<Contract, 'id'>>,
		options: {
			replace?: boolean;
		} = {},
	): Promise<T> {
		return this.upsertObject(
			context,
			object,
			Object.assign({}, options, {
				replace: true,
			}),
		);
	}

	private async upsertObject<T extends Contract = Contract>(
		context: Context,
		object: Omit<Contract, 'id'> & Partial<Pick<Contract, 'id'>>,
		options: {
			replace?: boolean;
		} = {},
	): Promise<T> {
		const insertedObject = await cards.upsert<T>(context, object, {
			replace: options.replace,
		});
		await this.cache?.set(cards.TABLE, insertedObject);
		const baseType = insertedObject.type.split('@')[0];
		if (baseType === 'link') {
			await links.upsert(context, insertedObject as any as LinkContract);

			// TODO: Check if we still need to materialize links here
			// We only "materialize" links in this way because we haven't
			// come up with a better way to traverse links while streaming.
			// Ideally we should leverage the database, using joins, rather
			// than doing all this client side.
			const { fromCard, toCard } = await Bluebird.props({
				fromCard: this.getElementById(
					context,
					(insertedObject as any).data.from.id ||
						(insertedObject as any).data.from,
				),
				toCard: this.getElementById(
					context,
					(insertedObject as any).data.to.id || insertedObject.data.to,
				),
			});

			// The reversed array is used so that links are parsed in both directions
			await Bluebird.map(
				[
					[fromCard, toCard],
					[toCard, fromCard],
				],
				async (linkCards) => {
					if (!linkCards[0] || !linkCards[1]) {
						return;
					}

					const linkedAt = _.clone(linkCards[0].linked_at);
					const updatedCard = insertedObject.active
						? links.addLink(
								insertedObject as any as LinkContract,
								linkCards[0],
								linkCards[1],
						  )
						: links.removeLink(
								insertedObject as any as LinkContract,
								linkCards[0],
						  );

					if (!fastEquals.deepEqual(linkedAt, updatedCard.linked_at)) {
						await cards.materializeLink(context, updatedCard);
						await this.cache?.unset(updatedCard);
					}
				},
			);
		}
		// If a type was inserted, any indexed fields declared on the type card should be
		// created
		if (baseType === 'type') {
			if (insertedObject.data.indexed_fields) {
				for (const fields of (insertedObject as any).data.indexed_fields) {
					await this.createTypeIndex(context, fields, insertedObject);
				}
			}
			// Find full-text search fields for type cards and create search indexes
			const fullTextSearchFields = cards.parseFullTextSearchFields(
				context,
				(insertedObject as any).data.schema,
			);
			if (fullTextSearchFields.length) {
				await this.createFullTextSearchIndex(
					context,
					`${insertedObject.slug}@${insertedObject.version}`,
					fullTextSearchFields,
				);
			}
		}
		// Upserting `user` contracts causes two other contracts to be upserted and
		// two links to be added while we are migrating to a new permission system.
		// See:
		// https://jel.ly.fish/improvement-jip-remove-field-level-permissions-8d561c94-2d33-4026-829c-272600018558
		if (baseType === 'user') {
			const userContract = insertedObject as any as UserContract;

			let settings = {};
			if ('profile' in userContract.data) {
				settings = _.omitBy(
					_.pick(userContract.data.profile, [
						'type',
						'homeView',
						'activeLoop',
						'sendCommand',
						'disableNotificationSound',
						'starredViews',
						'viewSettings',
					]),
					_.isNil,
				);
			}
			const personalSettingsContract = await this.upsertObject(
				context,
				{
					slug: 'user-settings-' + userContract.slug,
					version: userContract.version,
					type: 'user-settings@1.0.0',
					active: userContract.active,
					created_at: userContract.created_at,
					markers: userContract.markers,
					tags: [],
					data: {
						actorId: userContract.id,
						...settings,
					},
					requires: [],
					capabilities: [],
				},
				options,
			);
			await this.upsertObject(
				context,
				{
					slug: 'link-' + userContract.id + '-' + personalSettingsContract.id,
					version: '1.0.0',
					type: 'link@1.0.0',
					name: 'has attachment',
					active: userContract.active,
					created_at: userContract.created_at,
					markers: userContract.markers,
					tags: [],
					data: {
						from: {
							id: userContract.id,
							type: 'user@1.0.0',
						},
						to: {
							id: personalSettingsContract.id,
							type: 'user-settings@1.0.0',
						},
						inverseName: 'is attached to',
					},
					requires: [],
					capabilities: [],
				},
				options,
			);

			if (userContract.data.hash && userContract.data.hash.charAt(0) === '$') {
				const authenticationContract = await this.upsertObject(
					context,
					{
						slug: 'authentication-password-' + userContract.slug,
						version: userContract.version,
						type: 'authentication-password@1.0.0',
						active: userContract.active,
						created_at: userContract.created_at,
						markers: userContract.markers,
						tags: [],
						data: {
							actorId: userContract.id,
							hash: userContract.data.hash,
						},
						requires: [],
						capabilities: [],
					},
					options,
				);
				await this.upsertObject(
					context,
					{
						slug: 'link-' + userContract.id + '-' + authenticationContract.id,
						version: '1.0.0',
						type: 'link@1.0.0',
						name: 'is authenticated with',
						active: userContract.active,
						created_at: userContract.created_at,
						markers: userContract.markers,
						tags: [],
						data: {
							from: {
								id: userContract.id,
								type: 'user@1.0.0',
							},
							to: {
								id: authenticationContract.id,
								type: 'authentication-password@1.0.0',
							},
							inverseName: 'authenticates',
						},
						requires: [],
						capabilities: [],
					},
					options,
				);
			}

			if (
				userContract.data.oauth &&
				Object.keys(userContract.data.oauth).length > 1
			) {
				const authenticationContract = await this.upsertObject(
					context,
					{
						slug: 'authentication-oauth-' + userContract.slug,
						version: userContract.version,
						type: 'authentication-oauth@1.0.0',
						active: userContract.active,
						created_at: userContract.created_at,
						markers: userContract.markers,
						tags: [],
						data: {
							actorId: userContract.id,
							oauth: userContract.data.oauth,
						},
						requires: [],
						capabilities: [],
					},
					options,
				);
				await this.upsertObject(
					context,
					{
						slug: 'link-' + userContract.id + '-' + authenticationContract.id,
						version: '1.0.0',
						type: 'link@1.0.0',
						name: 'is authenticated with',
						active: userContract.active,
						created_at: userContract.created_at,
						markers: userContract.markers,
						tags: [],
						data: {
							from: {
								id: userContract.id,
								type: 'user@1.0.0',
							},
							to: {
								id: authenticationContract.id,
								type: 'authentication-oauth@1.0.0',
							},
							inverseName: 'authenticates',
						},
						requires: [],
						capabilities: [],
					},
					options,
				);
			}
		}
		return insertedObject;
	}

	/**
	 * Create an index unless the index already exists.
	 *
	 * @function
	 *
	 * @param {Object} context - execution context
	 * @param {String} tableName - table name
	 * @param {String} indexName - index name
	 * @param {String} version - type version, core version if not type-based index
	 * @param {String} predicate - index create statement predicate
	 * @param {String} typeSlug - type slug (optional)
	 * @param {Boolean} unique - declare index as UNIQUE (optional)
	 *
	 * @example
	 * await backend.createIndex(context, 'cards', 'example_idx', '1.0.0', 'USING btree (updated_at)');
	 */
	async createIndex(
		context: Context,
		tableName: string,
		indexName: string,
		version: string,
		predicate: string,
		typeSlug: string = '',
		unique: boolean = false,
	) {
		// "IF NOT EXISTS" is (unexpectedly) not thread safe. This is only a problem on the very first start and any "real"
		// error will be catched by the subsequent SQL statements.
		try {
			await context.query(`
				CREATE TABLE IF NOT EXISTS ${INDEX_TABLE} (
					index_name TEXT PRIMARY KEY NOT NULL,
					table_name TEXT NOT NULL,
					sql TEXT NOT NULL,
					type_slug TEXT NOT NULL DEFAULT '',
					version TEXT NOT NULL,
					updated_at TIMESTAMP WITH TIME ZONE NOT NULL
				)
			`);
		} catch (err: any) {
			context.warn('ignoring initial DB error', err);
		}

		await context.withTransaction(
			TransactionIsolation.Atomic,
			async (transactionContext: Context) => {
				// Lock index table to make other index creation executions wait.
				await transactionContext.runQuery(
					`LOCK TABLE ${INDEX_TABLE} IN EXCLUSIVE MODE`,
				);

				// Remove timeouts for this transaction only
				await transactionContext.runQuery('SET LOCAL statement_timeout=0');

				// Get current index state
				const [state] = await transactionContext.query(
					`
					SELECT sql,version
					FROM ${INDEX_TABLE}
					WHERE index_name=$1
					`,
					[indexName],
				);

				const uniqueFlag = unique ? 'UNIQUE ' : '';
				const createIndexStatement = `
				CREATE ${uniqueFlag}INDEX IF NOT EXISTS "${indexName}"
				ON ${tableName} ${predicate}
				`;

				if (!state) {
					// Create index if it doesn't already exist.
					transactionContext.info('Creating index', {
						tableName,
						indexName,
					});

					// Create index.
					await transactionContext.runQuery(createIndexStatement);

					// Update record in indexes table.
					await transactionContext.query(
						`
						INSERT INTO ${INDEX_TABLE}(
							index_name,
							table_name,
							sql,
							type_slug,
							version,
							updated_at
						)
						VALUES ($1, $2, $3, $4, $5, now())
						`,
						[
							indexName,
							tableName,
							createIndexStatement,
							typeSlug.split('@')[0],
							version,
						],
					);
				} else if (
					createIndexStatement !== state.sql &&
					semver.compare(state.version, version) === -1
				) {
					// TODO: Add index recreate logic once type-based index version
					// story is figured out.
					// https://jel.ly.fish/thread-fc77a33f-1ece-488c-9a3e-4ac501241d7a
					// https://jel.ly.fish/199e3575-d679-4d15-bae5-b94edf076581

					// Output log to track how often this happens.
					transactionContext.info('Should recreate index', {
						tableName,
						indexName,
						typeSlug,
						version,
						createIndexStatement,
					});
				}
			},
		);
	}

	/*
	 * Get a card from the database by id and table.
	 */
	async getElementById(context: Context, id: string) {
		/*
		 * Lets first check the in-memory cache so we can avoid
		 * making a full-blown query to the database.
		 */
		if (this.cache) {
			const cacheResult = await this.cache.getById(cards.TABLE, id);
			if (cacheResult.hit) {
				return cacheResult.element;
			}
		}

		/*
		 * Make a database request if we didn't have luck with
		 * the cache.
		 */
		const result = await cards.getById(context, id);
		if (this.cache) {
			if (result) {
				/*
				 * If we found the element, then update the cache
				 * so we can fetch it from there next time.
				 */
				await this.cache.set(cards.TABLE, result);
			} else {
				/*
				 * If we didn't, then let the cache know that this
				 * id doesn't exist on that table, so that we can
				 * also avoid another query in vain in the future.
				 */
				await this.cache.setMissingId(cards.TABLE, id);
			}
		}
		return result || null;
	}

	/*
	 * Get a card from the database by slug and table.
	 */
	async getElementBySlug(
		context: Context,
		slug: string,
		options: {
			skipCache?: boolean;
			lock?: boolean;
		} = {},
	) {
		const [base, version] = slug.split('@');
		context.assertInternal(
			version && version !== 'latest',
			errors.JellyfishInvalidVersion,
			`Missing version suffix in slug: ${slug}`,
		);

		/*
		 * Lets first check the in-memory cache so we can avoid
		 * making a full-blown query to the database.
		 */
		if (this.cache && !options.skipCache && !options.lock) {
			const cacheResult = await this.cache.getBySlug(
				cards.TABLE,
				base,
				version,
			);
			if (cacheResult.hit) {
				return cacheResult.element;
			}
		}

		/*
		 * Make a database request if we didn't have luck with
		 * the cache.
		 */
		const result = await cards.getBySlug(context, slug, options);
		if (this.cache) {
			if (result) {
				/*
				 * If we found the element, then update the cache
				 * so we can fetch it from there next time.
				 */
				await this.cache.set(cards.TABLE, result);
			} else {
				/*
				 * If we didn't, then let the cache know that this
				 * id doesn't exist on that table, so that we can
				 * also avoid another query in vain in the future.
				 */
				await this.cache.setMissingSlug(cards.TABLE, base, version);
			}
		}
		return result || null;
	}

	/*
	 * Get a set of cards by id from a single table in one shot.
	 */
	async getElementsById(context: Context, ids: string[]) {
		/*
		 * There is no point making a query if the set of ids
		 * is empty.
		 */
		if (ids.length === 0) {
			return [];
		}

		/*
		 * Consider that some of the ids the client is requesting
		 * might be on the in-memory cache but some might not.
		 * We want to use the in-memory cache as much as can, so
		 * we have to do some acrobatics to figure out what are
		 * the elements that we will require from the cache and
		 * which ones we will request the database from.
		 */
		const cached = [];
		const uncached = this.cache ? [] : ids;
		const uncachedSet = this.cache ? new Set() : new Set(ids);

		/*
		 * First lets find out which of the ids are in the
		 * in-memory cache.
		 */
		if (this.cache) {
			for (const id of ids) {
				const cacheResult = await this.cache.getById(cards.TABLE, id);
				if (cacheResult.hit) {
					/*
					 * If the cache knows about the id and it indeed exists,
					 * then save it so we return it right away.
					 *
					 * Notice that we don't do anything if the cache knows
					 * that such id is not in the database, as we don't want
					 * to query for it in vain, and we would ignore it from
					 * the resulting array anyways.
					 */
					if (cacheResult.element) {
						cached.push(cacheResult.element);
					}
				} else {
					/*
					 * Put the id in the uncached bucket if the
					 * in-memory cache doesn't know about it
					 */
					uncached.push(id);
					uncachedSet.add(id);
				}
			}
		}

		/*
		 * This means all the requested ids were in the in-memory
		 * cache, so we can just return them.
		 */
		if (uncached.length === 0) {
			return cached;
		}

		/*
		 * There are at least some elements that we must request,
		 * so lets ask the database for them.
		 */

		const elements = await cards.getManyById(context, uncached);
		if (this.cache) {
			/*
			 * Store the ones we found in the in-memory cache.
			 */
			for (const element of elements) {
				await this.cache.set(cards.TABLE, element);
				uncachedSet.delete(element.id);
			}
			/*
			 * Let the in-memory cache know about the ids that
			 * we know for sure don't exist in the requested
			 * table.
			 */
			for (const id of uncachedSet) {
				await this.cache.setMissingId(cards.TABLE, id);
			}
		}
		return elements.concat(cached);
	}
	/*
	 * Query the database using JSON Schema.
	 * We do this in two different ways:
	 *
	 * - Pass the JSON Schema to our JSON Schema to SQL translator
	 *
	 * - Try to be clever and analyze simple schemas to infer what
	 *   they are about and construct more customised queries for
	 *   them for performance reasons
	 */
	async query(
		context: Context,
		select: SelectObject,
		schema: JsonSchema,
		options: Partial<BackendQueryOptions> = {},
	) {
		// Apply a maximum for safety reasons
		if (typeof options.limit === 'undefined') {
			options.limit = MAXIMUM_QUERY_LIMIT;
		}
		const isValidLimit =
			_.isNumber(options.limit) &&
			Number.isInteger(options.limit) &&
			options.limit >= 0 &&
			options.limit <= MAXIMUM_QUERY_LIMIT;

		context.assertUser(
			isValidLimit,
			errors.JellyfishInvalidLimit,
			`Query limit must be a finite integer less than ${MAXIMUM_QUERY_LIMIT}: ${options.limit}`,
		);

		const results = await this.queryTable(
			context,
			cards.TABLE,
			select,
			schema,
			options as BackendQueryOptions,
		);

		return results;
	}

	private async queryTable(
		context: Context,
		table: string,
		select: SelectObject,
		schema: JsonSchema,
		options: BackendQueryOptions,
	) {
		const mode = options.profile ? 'info' : 'debug';

		context[mode]('Querying from table', {
			table,
			databaseName: this.databaseName,
			limit: options.limit,
			skip: options.skip,
			sortBy: options.sortBy,
			profile: options.profile,
		});

		if (options.limit <= 0) {
			return [];
		}

		const { query, queryGenTime } = compileSchema(
			context,
			table,
			select,
			schema,
			options,
		);

		const { elements, queryTime, postProcessTime } = await runQuery(
			context,
			schema,
			query,
		);

		context[mode]('Query database response', {
			table,
			databaseName: this.databaseName,
			count: elements.length,
			preProcessingTime: queryGenTime,
			queryTime,
			postProcessingTime: postProcessTime,
		});

		return elements;
	}

	/*
	 * Stream changes to the database that match a certain JSON Schema.
	 *
	 * This method returns an event emitter instance that emits the
	 * following events:
	 *
	 * - data: When there is a change
	 * - error: When there is an error
	 * - closed: When the connection is closed after calling `.close()`
	 *
	 * The "data" event has an object payload with the following properties:
	 *
	 * - before: The past state of the card (might be null)
	 * - after: The present state of the card
	 * - type: The type of change, which can be "insert" or "update"
	 *
	 * The event emitter has a `.close()` method that clients should
	 * use to gracefully close the stream once its not needed anymore.
	 *
	 * In order to implement this feature, we will tap into the master
	 * stream and resolve links and JSON Schema filtering client side.
	 */
	async stream(
		select: SelectObject,
		schema: JsonSchema,
		options: StreamOptions = {},
	): Promise<streams.Stream> {
		nativeAssert(!!this.streamClient, 'Stream client must be initialized');
		/*
		 * We first make sure that the schema is valid.
		 */
		skhema.validate(schema as any, null, {
			schemaOnly: true,
		});

		return this.streamClient.attach(select, schema, options);
	}

	/*
	 * Returns a free form object with information about
	 * this backend instance.
	 */
	async getStatus() {
		nativeAssert(!!this.streamClient, 'Stream client must be initialized');

		return {
			streams: {
				attachedCount: this.streamClient.getAttachedStreamCount(),
			},
		};
	}

	/*
	 * Creates a partial index on "fields" constrained by the provided "type"
	 */
	async createTypeIndex(
		context: Context,
		fields: string[],
		schema: ContractDefinition<any>,
	) {
		await cards.createTypeIndex(context, this, fields, schema);
	}

	/*
	 * Creates a partial index on fields denoted as being targets for full-text searches
	 */
	async createFullTextSearchIndex(
		context: Context,
		type: string,
		fields: SearchFieldDef[],
	) {
		await cards.createFullTextSearchIndex(context, this, type, fields);
	}

	/**
	 * Retrieve a new connection from the pool.
	 */
	public async getConnection(): Promise<PoolClient> {
		return this.pool!.connect();
	}

	/**
	 * Release the given connection back to the pool.
	 */
	public async releaseConnection(connection: PoolClient) {
		connection.release();
	}
}
