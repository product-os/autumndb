import * as redis from 'redis';
import * as redismock from 'redis-mock';
import * as errors from './errors';
import type { Contract } from './types';

interface CacheOptions extends redis.RedisClientOptions {
	namespace: string;
	mock: boolean;
}

export type CacheResult = { hit: false } | { hit: true; element: any };

export class Cache {
	tables: Set<string>;
	client: redis.RedisClientType<any, any, any> | null;

	/**
	 * @summary The contract cache store
	 * @class
	 * @public
	 * @param {Object} options - options
	 * @param {String} options.namespace - will be used as key prefix
	 * @param {Boolean} options.mock - if true uses in memory cache
	 *
	 * @example
	 * const cache = new Cache()
	 */
	constructor(public options: CacheOptions) {
		this.options = options;
		this.tables = new Set();
		this.client = null;
	}

	/**
	 * @private
	 * @summary Gets the internal redis client and raises an error if it isn't set
	 *
	 * @return {redis.RedisClientType} the redis client
	 */
	private getClient(): redis.RedisClientType<any, any, any> {
		if (!this.client) {
			throw new errors.JellyfishCacheError(
				'Cache client is not set, did you forget to call Cache.connect()?',
			);
		}

		return this.client;
	}

	/**
	 * @summary Connect to the cache
	 * @function
	 * @public
	 *
	 * @example
	 * const cache = new Cache()
	 * await cache.connect()
	 */
	async connect(): Promise<void> {
		if (this.client) {
			return;
		}

		// Attempt to recover if we lose the connection to the cache
		this.options.socket = this.options.socket || {};
		this.options.socket.reconnectStrategy = (attempts) => {
			if (attempts > 100) {
				return new errors.JellyfishCacheError('Cannot connect to cache');
			}

			// Reconnect after
			return Math.min(attempts * 100, 3000);
		};

		if (this.options.mock) {
			// This module is a singleton, and calling `.createClient()` attaches
			// events over the same singleton over and over again, causing
			// Node.js to eventually display:
			//   MaxListenersExceededWarning: Possible EventEmitter memory leak detected.
			// Updating the module itself is doable but tricky to get right given
			// various OOP smells in their architecture, so another workaround
			// is to invalidate the require cache entry, which will force the module
			// to return a new instance every time, as it should be.
			Reflect.deleteProperty(require.cache, require.resolve('redis-mock'));
			this.client = redismock.createClient(this.options);
		} else {
			this.client = redis.createClient(this.options);
			if (this.client) {
				await this.client.connect();
			}
		}
	}

	/**
	 * @summary Disconnect from the cache
	 * @function
	 * @public
	 *
	 * @example
	 * const cache = new Cache()
	 * await cache.disconnect()
	 */
	async disconnect() {
		if (this.client) {
			const client = this.client;
			this.client = null;
			await client.quit();
		}
	}

	/**
	 * @summary Generate a key scoped by database name
	 * @function
	 * @private
	 *
	 * @param {String} table - table
	 * @param {String} category - category
	 * @param {String} key - key
	 *
	 * @returns {String} key - redis key
	 *
	 * @example
	 * const cache = new Cache()
	 * console.log(cache.generateKey('contracts', 'slug', 'xxxxxx'))
	 *
	 * > `database:contracts:slug:xxxx`
	 */
	generateKey(table: string, category: string, key: string): string {
		return `${this.options.namespace}:${table}:${category}:${key}`;
	}

	/**
	 * @summary Set an element in the cache by a certain key
	 * @function
	 * @private
	 *
	 * @param {String} table - table
	 * @param {String} category - category
	 * @param {String} key - key
	 * @param {Object} element - element
	 * @param {Object} backend - redis client
	 *
	 * @example
	 * const cache = new Cache()
	 * cache.setElementByKey('contracts', 'slug', 'xxxxxx', {
	 *   id: 'xxxxxx',
	 *   slug: 'foo',
	 *   data: 'baz'
	 * })
	 */
	async setElementByKey(
		table: string,
		category: string,
		key: string,
		element: Contract | null,
	) {
		if (!key) {
			return;
		}

		this.tables.add(table);

		const client = this.getClient();

		for (const name of this.tables) {
			if (name === table) {
				// Store key with one hour expiration
				const expirationTime = 3600;

				await client.set(
					this.generateKey(name, category, key),
					JSON.stringify(element),
					{
						EX: expirationTime,
					},
				);
			} else if (element) {
				await client.set(this.generateKey(name, category, key), 'null');
			}
		}
	}

	/**
	 * @summary Set an element in the cache
	 * @function
	 * @public
	 *
	 * @param {String} table - table
	 * @param {Object} element - element
	 *
	 * @example
	 * const cache = new Cache()
	 * cache.set('contracts', {
	 *   id: 'xxxxxx',
	 *   slug: 'foo',
	 *   data: 'baz'
	 * })
	 */
	async set(table: string, element: Contract) {
		await Promise.all([
			this.setElementByKey(table, 'id', element.id, element),
			this.setElementByKey(
				table,
				'slug',
				`${element.slug}@${element.version}`,
				element,
			),
		]);
	}

	/**
	 * @summary Set a slug explicitly as "missing"
	 * @function
	 * @public
	 *
	 * @param {String} table - table
	 * @param {String} slug - slug
	 * @param {String} version - version
	 *
	 * @example
	 * const cache = new Cache()
	 * cache.setMissingSlug('contracts', 'foo', '1.0.0')
	 */
	async setMissingSlug(table: any, slug: any, version: any) {
		await this.setElementByKey(table, 'slug', `${slug}@${version}`, null);
	}

	/**
	 * @summary Set a slug explicitly as "missing"
	 * @function
	 * @public
	 *
	 * @param {String} table - table
	 * @param {String} id - id
	 *
	 * @example
	 * const cache = new Cache()
	 * cache.setMissingId('contracts', '4a962ad9-20b5-4dd8-a707-bf819593cc84')
	 */
	async setMissingId(table: any, id: any) {
		await this.setElementByKey(table, 'id', id, null);
	}

	/**
	 * @summary Get an element from the cache by its category
	 * @function
	 * @private
	 *
	 * @param {String} table - table
	 * @param {String} category - category
	 * @param {String} key - key
	 * @returns {Object} results
	 *
	 * @example
	 * const cache = new Cache()
	 * const result = cache.get('contracts', 'id', 'foo')
	 *
	 * if (result.hit) {
	 *   console.log(result.data)
	 * }
	 */
	async get(
		table: string,
		category: string,
		key: string,
	): Promise<CacheResult> {
		const client = this.getClient();

		const result = await client.get(this.generateKey(table, category, key));

		if (result) {
			const data = {
				hit: true,
				element: JSON.parse(result),
			};
			return data;
		}

		return {
			hit: false,
		};
	}

	/**
	 * @summary Get an element from the cache by its id
	 * @function
	 * @public
	 *
	 * @param {String} table - table
	 * @param {String} id - id
	 * @returns {Object} results
	 *
	 * @example
	 * const cache = new Cache()
	 * const result = cache.getById('contracts',
	 *   '4a962ad9-20b5-4dd8-a707-bf819593cc84')
	 *
	 * if (result.hit) {
	 *   console.log(result.data)
	 * }
	 */
	async getById(table: string, id: string) {
		return this.get(table, 'id', id);
	}

	/**
	 * @summary Get an element from the cache by its slug
	 * @function
	 * @public
	 *
	 * @param {String} table - table
	 * @param {String} slug - slug
	 * @param {String} version - version
	 * @returns {Object} results
	 *
	 * @example
	 * const cache = new Cache()
	 * const result = cache.getBySlug('contracts', 'foo', '1.0.0')
	 *
	 * if (result.hit) {
	 *   console.log(result.data)
	 * }
	 */
	async getBySlug(table: any, slug: any, version: any) {
		return this.get(table, 'slug', `${slug}@${version}`);
	}

	/**
	 * @summary Unset an element from the cache
	 * @function
	 * @public
	 *
	 * @param {Object} element - element
	 *
	 * @example
	 * const cache = new Cache()
	 * cache.unset({
	 *   id: 'xxxxxx',
	 *   slug: 'foo',
	 *   data: 'baz'
	 * })
	 */
	async unset(element: Contract) {
		const client = this.getClient();

		for (const name of this.tables) {
			if (element.id) {
				await client.del(this.generateKey(name, 'id', element.id));
			}
			if (element.slug) {
				await client.del(
					this.generateKey(name, 'slug', `${element.slug}@${element.version}`),
				);
			}
		}
	}

	/**
	 * @summary Reset the cache
	 * @function
	 * @public
	 *
	 * @example
	 * const cache = new Cache()
	 * cache.reset()
	 */
	async reset() {
		if (this.client) {
			await this.client.flushAll();
		}
	}
}
