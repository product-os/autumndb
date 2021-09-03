/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */
import * as _ from 'lodash';
import { performance } from 'perf_hooks';
import * as Bluebird from 'bluebird';
import * as skhema from 'skhema';
import { getLogger } from '@balena/jellyfish-logger';
import * as assert from '@balena/jellyfish-assert';
import metrics = require('@balena/jellyfish-metrics');
import { v4 as uuidv4 } from 'uuid';
import * as jsonschema2sql from './jsonschema2sql';
import * as links from './links';
import * as cards from './cards';
import * as streams from './streams';
import * as utils from './utils';
import * as markers from './markers';
import pgp from './pg-promise';
import { core, JSONSchema } from '@balena/jellyfish-types';
import {
	Context,
	Contract,
	LinkContract,
} from '@balena/jellyfish-types/build/core';
import {
	BackendQueryOptions,
	DatabaseBackend,
	DatabaseConnection,
	Queryable,
	SearchFieldDef,
	SelectObject,
	SqlQueryOptions,
} from './types';
import { Cache } from './../../cache';
import { TypedError } from 'typed-error';
import { strict as nativeAssert } from 'assert';
import type pgPromise = require('pg-promise');
import { AsyncLocalStorage } from 'async_hooks';

const logger = getLogger('jellyfish-core');

const currentTransaction = new AsyncLocalStorage<Queryable>();

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

// a random number that's used as an advisory lock in pg to ensure only one
// JF instance is trying to run DB migrations
// TODO: replace with proper migration concept
const BOOTSTRAPPING_LOCK = 608976328976780;

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
const MAXIMUM_QUERY_LIMIT = 1000;

// Amount of time to wait before retrying connect
const DEFAULT_CONNECT_RETRY_DELAY = 2000;

const userBelongsToOrgOptimizationIsApplicable = (schema: JSONSchema) => {
	return (
		schema.type === 'object' &&
		schema.properties &&
		schema.properties.type &&
		(schema.properties.type as any).const === 'org@1.0.0' &&
		schema.properties.slug &&
		!(schema.properties.slug as any).const! &&
		Object.keys(schema.properties).length === 2 &&
		schema.$$links &&
		schema.$$links['has member'] &&
		schema.$$links['has member'].properties &&
		schema.$$links['has member'].properties.type &&
		(schema.$$links['has member'].properties.type as any).const ===
			'user@1.0.0' &&
		schema.$$links['has member'].properties.slug &&
		(schema.$$links['has member'].properties.slug as any).const
	);
};

const compileSchema = (
	table: string,
	select: SelectObject,
	schema: JSONSchema,
	options: SqlQueryOptions,
	errors: { [key: string]: typeof TypedError },
): { query: string; queryGenTime: number } => {
	const queryGenStart = performance.now();
	let query = null;
	try {
		query = jsonschema2sql.compile(table, select, schema, options);
	} catch (error: any) {
		if (error.name === 'InvalidSchema') {
			throw new errors.JellyfishInvalidSchema(error.message);
		}
		throw error;
	}
	const queryGenEnd = performance.now();
	const queryGenTime = queryGenEnd - queryGenStart;
	metrics.markSqlGenTime(queryGenTime);
	return {
		query,
		queryGenTime,
	};
};

const runQuery = async (
	context: Context,
	schema: JSONSchema,
	query: string | pgPromise.PreparedStatement,
	backend: DatabaseBackend,
	values?: any[],
) => {
	const queryStart = performance.now();
	const results = await backend
		.any(query, values)
		.catch((error: { message: string }) => {
			assert.USER(
				context,
				!error.message.includes('statement timeout'),
				backend.errors.JellyfishDatabaseTimeoutError,
				() => {
					return `Schema query timeout: ${JSON.stringify(schema)}`;
				},
			);
			assert.USER(
				context,
				!error.message.startsWith('invalid regular expression:'),
				backend.errors.JellyfishInvalidRegularExpression,
				() => {
					return `Invalid pattern in schema: ${JSON.stringify(schema)}`;
				},
			);
			throw error;
		});

	const queryEnd = performance.now();
	const queryTime = queryEnd - queryStart;
	metrics.markQueryTime(queryTime);

	return {
		results,
		queryTime,
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

const queryTable = async (
	context: Context,
	backend: DatabaseBackend,
	table: string,
	select: SelectObject,
	schema: JSONSchema,
	options: BackendQueryOptions,
) => {
	const mode = options.profile ? 'info' : 'debug';

	logger[mode](context, 'Querying from table', {
		table,
		database: backend.database,
		limit: options.limit,
		skip: options.skip,
		sortBy: options.sortBy,
		profile: options.profile,
	});

	if (options.limit <= 0) {
		return [];
	}

	const { query, queryGenTime } = compileSchema(
		table,
		select,
		schema,
		options,
		backend.errors,
	);

	const { results, queryTime } = await runQuery(
		context,
		schema,
		query,
		backend,
	);

	const { elements, postProcessTime } = postProcessResults(results);

	logger[mode](context, 'Query database response', {
		table,
		database: backend.database,
		count: elements.length,
		preProcessingTime: queryGenTime,
		queryTime,
		postProcessingTime: postProcessTime,
	});

	return elements;
};

const upsertObject = async <T extends Contract = Contract>(
	context: Context,
	backend: DatabaseBackend,
	object: Omit<Contract, 'id'> & Partial<Pick<Contract, 'id'>>,
	options: {
		replace?: boolean;
	} = {},
): Promise<T> => {
	const insertedObject = await cards.upsert<T>(
		context,
		backend.errors,
		backend,
		object,
		{
			replace: options.replace,
		},
	);
	if (backend.cache) {
		await backend.cache.set(cards.TABLE, insertedObject);
	}
	const baseType = insertedObject.type.split('@')[0];
	if (baseType === 'link') {
		await links.upsert(context, backend, insertedObject as any as LinkContract);

		// TODO: Check if we still need to materialize links here
		// We only "materialize" links in this way because we haven't
		// come up with a better way to traverse links while streaming.
		// Ideally we should leverage the database, using joins, rather
		// than doing all this client side.
		const { fromCard, toCard } = await Bluebird.props({
			fromCard: backend.getElementById(
				context,
				(insertedObject as any).data.from.id ||
					(insertedObject as any).data.from,
			),
			toCard: backend.getElementById(
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

				await cards.materializeLink(
					context,
					backend.errors,
					backend,
					updatedCard,
				);
				if (backend.cache) {
					await backend.cache.unset(updatedCard);
				}
			},
		);
	}
	/*
	 * Only update the markers view if needed, for performance reasons.
	 */
	if (
		baseType === 'link' &&
		(((insertedObject as any).data.from.type.split('@')[0] === 'org' &&
			(insertedObject as any).data.to.type.split('@')[0] === 'user') ||
			((insertedObject as any).data.to.type.split('@')[0] === 'org' &&
				(insertedObject as any).data.from.type.split('@')[0] === 'user'))
	) {
		logger.info(context, 'Triggering markers refresh', {
			type: insertedObject.type,
			slug: insertedObject.slug,
			database: backend.database,
		});
		await markers.refresh(context, backend, {
			source: cards.TABLE,
			trigger: insertedObject,
		});
	}
	// If a type was inserted, any indexed fields declared on the type card should be
	// created
	if (baseType === 'type') {
		if (insertedObject.data.indexed_fields) {
			for (const fields of (insertedObject as any).data.indexed_fields) {
				await backend.createTypeIndex(context, fields, insertedObject);
			}
		}
		// Find full-text search fields for type cards and create search indexes
		const fullTextSearchFields = cards.parseFullTextSearchFields(
			context,
			(insertedObject as any).data.schema,
			backend.errors,
		);
		if (fullTextSearchFields.length) {
			await backend.createFullTextSearchIndex(
				context,
				insertedObject.slug,
				fullTextSearchFields,
			);
		}
	}
	return insertedObject;
};

interface PostgresBackendOptions {
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
	maxUses?: number; // recycle connection after
}

const defaultPgOptions: Partial<PostgresBackendOptions> = {
	// statement_timeout: undefined,
	// query_timeout: undefined,
	idleTimeoutMillis: 60 * 1000,
	connectionTimeoutMillis: 30 * 1000,
	keepAlive: true,
	max: 10, // same as default https://github.com/brianc/node-postgres/blob/master/packages/pg-pool/index.js#L84
	// maxUses: 5000,
};

/*
 * This class implements various low-level methods to interact
 * with cards on PostgreSQL, such as:
 *
 * - Getting cards by their primary keys
 * - Querying a database with JSON Schema
 * - Maintaining and traversing link relationships
 * - Streaming from a database using JSON Schema
 *
 * Notice that at this point we don't have any concepts of
 * permissions. The layers above this class will apply permissions
 * to queries and delegate the fully expanded queries to this
 * class.
 */
export class PostgresBackend implements Queryable {
	private connection?: DatabaseConnection | null;
	options: PostgresBackendOptions;
	database: string;
	connectRetryDelay: number;
	streamClient?: streams.Streamer;

	/*
	 * The constructor takes:
	 *
	 * - A (probably shared) cache instance that this backend can
	 *   use and maintain to speed up queries.
	 * - A set of rich errors classes the instance can throw
	 * - Various connection options
	 */
	constructor(
		public cache: Cache | null,
		public errors: { [key: string]: typeof TypedError },
		options: PostgresBackendOptions,
	) {
		this.cache = cache;
		this.errors = errors;
		/*
		 * Omit the options that are falsy, like empty strings.
		 */
		this.options = _.omitBy(options, _.isEmpty) as any;
		/*
		 * The PostgreSQL database name that we will connect to.
		 * We don't hardcode it as we want to be able to target
		 * different databases for parallel automated testing
		 * purposes.
		 */
		this.database = options.database.toLowerCase();
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
	async connect(context: Context): Promise<true> {
		/*
		 * Drop any existing connection so we don't risk having any leaks.
		 */
		await this.disconnect(context);

		/*
		 * Lets connect to the default database, that should always be
		 * available.
		 */
		logger.info(context, 'Connecting to database', {
			database: this.database,
		});
		this.connection = pgp({
			...defaultPgOptions,
			...this.options,
			port: Number(this.options.port),
			database: 'postgres',
		});

		/*
		 * This is an arbitrary request just to make sure that the
		 * connection was made successfully. Retry connection on fail.
		 */
		try {
			const { version } = await this.connection.query('select version()');
			logger.info(context, 'Connection to database successful!', {
				version,
			});
		} catch (error) {
			logger.warn(context, 'Connection to database failed', {
				error,
			});
			await Bluebird.delay(this.connectRetryDelay);
			return this.connect(context);
		}

		/*
		 * List all available databases so we know if we have to
		 * create the one that the client specified or not.
		 *
		 * Notice that the "pg_database" table may contain database
		 * templates, which we are of course not interested in.
		 * See: https://www.postgresql.org/docs/9.3/manage-ag-templatedbs.html
		 */
		logger.debug(context, 'Listing databases');
		const databases = _.map(
			await this.connection.any(`
			SELECT datname FROM pg_database
			WHERE datistemplate = false;`),
			'datname',
		);

		/*
		 * Of course, we only want to create the database if it doesn't
		 * exist. Too bad that Postgres doesn't support an "IF NOT EXISTS"
		 * modified on "CREATE DATABASE" so we could avoid these checks.
		 */
		if (!databases.includes(this.database)) {
			logger.debug(context, 'Creating database', {
				database: this.database,
			});

			/*
			 * The owner of the database should be the user that the client
			 * specified.
			 *
			 * TODO(jviotti): There is a possible issue where the database
			 * exists, but it was created with another user as an owner. In such
			 * case we would see that the database exists, we would not create
			 * it again, but then we might fail to do the operations we need
			 * because it doesn't belong to us.
			 */
			try {
				await this.connection.any(`
					CREATE DATABASE ${this.database} OWNER = ${this.options.user};`);
			} catch (error: any) {
				if (!isIgnorableInitError(error.code)) {
					throw error;
				}
			}

			/*
			 * If the database is fresh, then the in-memory cache should be
			 * as well.
			 */
			if (this.cache) {
				await this.cache.reset();
			}
		}

		/*
		 * At this point we either created the desired database, or
		 * confirmed that it exists, so lets disconnect from the
		 * default database and connect to the one we're interested in.
		 */
		await this.disconnect(context);
		this.connection = pgp({
			...defaultPgOptions,
			...this.options,
			port: Number(this.options.port),
		});

		this.connection.$pool.on('error', (error: { code: any; message: any }) => {
			logger.warn(context, 'Backend connection pool error', {
				code: error.code,
				message: error.message,
			});
		});

		await this.withTransaction(async () => {
			this.any(`SELECT pg_advisory_xact_lock(${BOOTSTRAPPING_LOCK});`);

			try {
				await cards.setup(context, this, this.database);
			} catch (error: any) {
				if (!isIgnorableInitError(error.code)) {
					throw error;
				}
			}

			try {
				await links.setup(context, this, this.database, {
					cards: cards.TABLE,
				});
			} catch (error: any) {
				if (!isIgnorableInitError(error.code)) {
					throw error;
				}
			}

			try {
				await markers.setup(context, this, {
					source: cards.TABLE,
					links: links.TABLE,
				});
			} catch (error: any) {
				if (!isIgnorableInitError(error.code)) {
					throw error;
				}
			}

			try {
				await streams.setupTrigger(this, cards.TABLE, cards.TRIGGER_COLUMNS);
			} catch (error: any) {
				if (!isIgnorableInitError(error.code)) {
					throw error;
				}
			}
		});

		this.streamClient = await streams.start(
			context,
			this,
			this.connection,
			cards.TABLE,
			cards.TRIGGER_COLUMNS,
		);

		return true;
	}

	/*
	 * This method takes care of gracefully disconnecting from
	 * Postgres, and its mainly used during automated testing.
	 */
	async disconnect(context: Context) {
		await this.streamClient?.close();

		/*
		 * Close the main connection pool.
		 */
		if (this.connection) {
			logger.debug(context, 'Disconnecting from database', {
				database: this.database,
			});
			await this.connection.$pool.end();
			// TS-TODO: Why is $destroy not a method on the type definition?
			await (this.connection as any).$destroy();
			this.connection = null;
		}
	}

	/*
	 * Drop the database tables.
	 */
	async drop(context: Context) {
		if (!this.connection) {
			return;
		}

		logger.debug(context, 'Dropping database tables', {
			database: this.database,
		});

		await this.any(`DROP TABLE ${cards.TABLE}, ${links.TABLE} CASCADE`);
	}

	/*
	 * Reset the database state.
	 */
	async reset(context: Context) {
		logger.debug(context, 'Resetting database', {
			database: this.database,
		});

		await this.any(`
			DELETE FROM ${links.TABLE};
			DELETE FROM ${cards.TABLE};
		`);
	}

	/*
	 * Insert a card to the database, and throw an error
	 * if a card with the same id or slug already exists.
	 */
	async insertElement<T extends Contract = Contract>(
		context: Context,
		object: Omit<Contract, 'id'> & Partial<Pick<Contract, 'id'>>,
	) {
		return upsertObject<T>(context, this, object, {
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
		return upsertObject(
			context,
			this,
			object,
			Object.assign({}, options, {
				replace: true,
			}),
		);
	}

	/*
	 * Execute a provided callback within a transaction.
	 */
	async withTransaction(
		callback: () => Promise<any>,
		options: {
			tag?: string;
			mode?: pgPromise.TransactionMode;
		} = {},
	) {
		options.tag = `transaction_${uuidv4()}`;
		nativeAssert(!!this.connection, 'Database connection required!');
		return this.connection.tx(
			options,
			async (transaction: pgPromise.ITask<{}>) => {
				return await currentTransaction.run(
					transaction,
					async () => await callback(),
				);
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
		const result = await cards.getById(context, this, id);
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
		assert.INTERNAL(
			context,
			version && version !== 'latest',
			this.errors.JellyfishInvalidVersion,
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
		const result = await cards.getBySlug(context, this, slug, options);
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

		const elements = await cards.getManyById(context, this, uncached);
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
		schema: JSONSchema,
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

		assert.USER(
			context,
			isValidLimit,
			this.errors.JellyfishInvalidLimit,
			`Query limit must be a finite integer less than ${MAXIMUM_QUERY_LIMIT}: ${options.limit}`,
		);

		/*
		 * These optimization detection conditionals are very weak
		 * and very easy to miss even if expressing the same query
		 * with a slightly different schema. Hopefully we invest
		 * more time to make this detection way smarter.
		 */
		// Optimize queries for orgs that a user belongs to
		if (userBelongsToOrgOptimizationIsApplicable(schema)) {
			return markers.getUserMarkers(
				context,
				this,
				{
					slug: (schema.$$links!['has member'].properties!.slug as any).const,
				},
				{
					source: cards.TABLE,
				},
			);
		}

		const results = await queryTable(
			context,
			this,
			cards.TABLE,
			select,
			schema,
			options as BackendQueryOptions,
		);

		// Mark card read metric.
		_.forEach(results, (result) => {
			metrics.markCardReadFromDatabase(result);
		});
		return results;
	}

	prepareQueryForStream(
		context: Context,
		name: string,
		select: SelectObject,
		schema: JSONSchema,
		options: SqlQueryOptions,
	) {
		if (userBelongsToOrgOptimizationIsApplicable(schema)) {
			return async (id: any) => {
				return markers.getUserMarkers(
					context,
					this,
					{
						id,
						slug: (schema.$$links!['has member'].properties!.slug as any).const,
					},
					{
						source: cards.TABLE,
					},
				);
			};
		}

		const { query, queryGenTime } = compileSchema(
			cards.TABLE,
			select,
			schema,
			{
				limit: 1,
				extraFilter: `${cards.TABLE}.id = $1`,
				...options,
			},
			this.errors,
		);

		const preparedQuery = new pgp.PreparedStatement({
			name,
			text: query,
		});

		logger.debug(context, 'Prepared stream query for table', {
			table: cards.TABLE,
			database: this.database,
			preProcessingTime: queryGenTime,
		});

		return async (id: any) => {
			const { results, queryTime } = await runQuery(
				context,
				schema,
				preparedQuery,
				this,
				[id],
			);

			const { elements, postProcessTime } = postProcessResults(results);

			logger.debug(context, 'Prepared query database response', {
				table: cards.TABLE,
				database: this.database,
				count: elements.length,
				queryTime,
				postProcessingTime: postProcessTime,
			});

			return elements;
		};
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
		context: Context,
		select: SelectObject,
		schema: JSONSchema,
		options: SqlQueryOptions = {},
	): Promise<streams.Stream> {
		nativeAssert(!!this.streamClient, 'Stream client must be initialized');
		/*
		 * We first make sure that the schema is valid.
		 */
		skhema.validate(schema as any, null, {
			schemaOnly: true,
		});

		return this.streamClient.attach(context, select, schema, options);
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
		schema: core.ContractDefinition<any>,
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

	private getConnection() {
		const connection = currentTransaction.getStore() || this.connection;
		nativeAssert(!!connection, 'Database connection required');
		return connection;
	}

	isConnected(): boolean {
		return !!this.connection;
	}
	pgConnect() {
		return this.connection!.connect();
	}
	any<T = any>(...args: Parameters<DatabaseConnection['any']>): Promise<T[]> {
		return this.getConnection().any(...args);
	}
	one<T = any>(...args: [pgPromise.QueryParam, any?]): Promise<T> {
		return this.getConnection().one<T>(...args);
	}
	task<T>(cb: (t: pgPromise.ITask<{}>) => Promise<T>) {
		return this.getConnection().task(cb);
	}
}