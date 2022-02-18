import type { LogContext } from '@balena/jellyfish-logger';
import * as _ from 'lodash';
import * as jsonpatch from 'fast-json-patch';
import * as fastEquals from 'fast-equals';
import { CONTRACTS } from './contracts';
import * as metrics from '@balena/jellyfish-metrics';
import type { JsonSchema } from '@balena/jellyfish-types';
import type {
	Contract,
	ContractData,
	ContractDefinition,
	LinkContract,
	TypeContract,
	ViewContract,
} from '@balena/jellyfish-types/build/core';
import { Pool } from 'pg';
import * as stopword from 'stopword';
import { v4 as uuidv4 } from 'uuid';
import { PostgresBackend, PostgresBackendOptions } from './backend';
import type {
	BackendQueryOptions,
	DatabaseBackend,
	SelectObject,
} from './backend/postgres/types';
import type { Cache } from './cache';
import { Context, MixedContext, TransactionIsolation } from './context';
import * as errors from './errors';
import jsonSchema from './json-schema';
import * as authorization from './authorization';
import {
	preprocessQuerySchema,
	resolveActorAndScopeFromSessionId,
} from './utils';
import { Stream } from './backend/postgres/streams';

export interface QueryOptions {
	/*
   path to field that should be used for sorting
	*/
	sortBy?: string | string[];

	/*
   the direction results should be sorted in
	*/
	sortDir?: 'asc' | 'desc';

	/*
   the number of records to skip when querying results
	*/
	skip?: number;

	/*
   the maximum number of records that should be returned by the query
	*/
	limit?: number;

	links?: { [key: string]: QueryOptions };

	mask?: JsonSchema;

	// if true, the query parameters will be logged on every request
	profile?: boolean;
}

// Contracts that are inserted by default.
const CORE_CONTRACTS = [
	CONTRACTS.card,
	CONTRACTS.org,
	CONTRACTS.error,
	CONTRACTS.event,
	CONTRACTS.view,
	CONTRACTS.role,
	CONTRACTS.link,
	CONTRACTS.loop,
	CONTRACTS['oauth-provider'],
	CONTRACTS['oauth-client'],
];

const CONTRACT_CONTRACT_TYPE = `${CONTRACTS['card'].slug}@${CONTRACTS['card'].version}`;

const VERSIONED_CONTRACTS = _.mapKeys(CONTRACTS, (value: any, key: any) => {
	return `${key}@${value.version}`;
});

// Generate a concise slug for a contract, using the `name` field
// if its available
export const generateSlug = (
	contract: Pick<Contract, 'name' | 'type'>,
): string => {
	const baseType = contract.type.split('@')[0];

	if (contract.name) {
		const name = stopword
			.removeStopwords(contract.name.split(' '), stopword.en)
			.join(' ');
		const shortUUID = uuidv4().slice(0, 7);

		// Lowercase the name and replace all non-digit, non-alpha characters with a hyphen
		const sluggedName = name.toLowerCase().replace(/[^a-z\d]+/g, '-');

		return `${baseType}-${sluggedName}-${shortUUID}`;
	} else {
		return `${baseType}-${uuidv4()}`;
	}
};

const flattenSelectObject = (selectObject: SelectObject): SelectObject => {
	const flat = selectObject.properties;

	if ('links' in flat! && !_.isEmpty(selectObject.links)) {
		flat.links = _.merge(flat.links, selectObject.links);
	}

	return flat!;
};

const mergeSelectedMaps = (base: any, extras: any) => {
	return _.mergeWith(base, ...extras, (objA: any, objB: any) => {
		if (!_.isEmpty(objA)) {
			return objA;
		} else if (!_.isEmpty(objB)) {
			return objB;
		}
		return undefined;
	});
};

const selectObjectFromSchema = (schema: JsonSchema): SelectObject => {
	if (_.isBoolean(schema)) {
		return {
			links: {},
			properties: {},
		};
	}

	const links: { [linkType: string]: JsonSchema } = {};

	if ('$$links' in schema) {
		for (const [linkType, linked] of Object.entries(schema.$$links!)) {
			links[linkType] = flattenSelectObject(
				selectObjectFromSchema(linked),
			) as JsonSchema;
		}
	}

	const extraLinks = [];
	const properties: { [property: string]: { [key: string]: any } } = {};

	if ('required' in schema) {
		for (const required of schema.required!) {
			properties[required] = {};
		}
	}

	if ('properties' in schema) {
		for (const [name, subSchema] of Object.entries(schema.properties!)) {
			const subSelected = selectObjectFromSchema(subSchema);
			extraLinks.push(subSelected.links);
			properties[name] = subSelected.properties!;
		}
	}

	const extraProperties = [];
	for (const combinator of ['allOf', 'anyOf']) {
		if (combinator in schema) {
			for (const branch of (schema as any)[combinator]) {
				const subSelected = selectObjectFromSchema(branch);
				extraLinks.push(subSelected.links);
				extraProperties.push(subSelected.properties);
			}
		}
	}

	if ('not' in schema) {
		const subSelected = selectObjectFromSchema(schema.not!);
		extraLinks.push(subSelected.links);
		extraProperties.push(subSelected.properties);
	}

	return {
		links: mergeSelectedMaps(links, extraLinks),
		properties: mergeSelectedMaps(properties, extraProperties),
	};
};

// TODO: rename with something more descriptive.
const rectifySelectObject = (
	selectObject: SelectObject,
	authorizedSelectObject: SelectObject,
): SelectObject => {
	const result = { ...selectObject };

	for (const [key, value] of Object.entries(result)) {
		if (key in authorizedSelectObject) {
			rectifySelectObject(value, (authorizedSelectObject as any)[key]);
		} else {
			Reflect.deleteProperty(result, key);
		}
	}

	return result;
};

// If a field is completely blacklisted by the authorization schema, it will be
// completely removed from `authorizedQuerySchema`. In that case we need to find
// all selected properties again from `authorizedQuerySchema` and then rectify
// the original `selectObject` by removing missing properties.
const getSelectObjectFromSchema = (
	querySchema: JsonSchema,
	authorizedQuerySchema: JsonSchema,
): SelectObject => {
	const selectObject = flattenSelectObject(selectObjectFromSchema(querySchema));

	const authorizedSelectedLinksAndProperties = flattenSelectObject(
		selectObjectFromSchema(authorizedQuerySchema),
	);

	const rectifiedSelectObject = rectifySelectObject(
		selectObject,
		authorizedSelectedLinksAndProperties,
	);

	return rectifiedSelectObject;
};

const patchContract = (
	contract: Contract,
	patch: jsonpatch.Operation[],
	options: { mutate?: boolean } = {},
) => {
	return patch.reduce((accumulator, operation) => {
		if (!operation.path) {
			throw new errors.JellyfishInvalidPatch(
				`Patch operation has no path: ${JSON.stringify(operation, null, 2)}`,
			);
		}

		if (
			operation.path.startsWith('/id') ||
			operation.path.startsWith('/links') ||
			operation.path.startsWith('/linked_at') ||
			operation.path.startsWith('/created_at') ||
			operation.path.startsWith('/updated_at')
		) {
			return accumulator;
		}

		try {
			return jsonpatch.applyOperation(
				accumulator,
				operation,
				false,
				options.mutate,
			).newDocument;
		} catch (error) {
			const newError = new errors.JellyfishInvalidPatch(
				`Patch does not apply to ${contract.slug}: ${JSON.stringify(patch)}`,
			);

			newError.expected = true;

			throw newError;
		}
	}, contract);
};

/**
 * @summary Upsert a contract in an unsafe way (DANGEROUS)
 * @function
 * @public
 *
 * @description
 * This bypasses the whole authorization system, so use with care.
 *
 * This function has the added limitation that you can only insert
 * contracts of types that are defined in the Jellyfish core.
 *
 * @param {Object} context - exectuion context
 * @param {Object} backend - backend
 * @param {Object} contract - contract
 * @returns {Object} contract
 *
 * @example
 * const contract = await unsafeUpsertContract(backend, {
 *   type: 'foo',
 *   links: {},
 *   requires: [],
 *   capabilities: [],
 *   tags: [],
 *   active: true,
 *   data: {
 *     foo: 'bar'
 *   }
 * })
 *
 * console.log(contract.id)
 */
export const unsafeUpsertContract = async (
	context: Context,
	backend: DatabaseBackend,
	contract: Contract,
): Promise<Contract> => {
	jsonSchema.validate(
		VERSIONED_CONTRACTS[CONTRACT_CONTRACT_TYPE].data.schema as any,
		contract,
	);
	jsonSchema.validate(
		VERSIONED_CONTRACTS[contract.type].data.schema as any,
		contract,
	);
	return backend.upsertElement(context, contract);
};

export class Kernel {
	private backend: DatabaseBackend;
	private sessions?: { admin: string };

	/**
	 * @summary The Jellyfish Kernel
	 * @class
	 * @public
	 *
	 * @param {Object} backend - the backend instance
	 *
	 * @example
	 * const cache = new Cache()
	 * const backend = new Backend(cache, {
	 *   database: 'my-jellyfish',
	 *   host: 'localhost',
	 *   port: 28015,
	 *   user: 'admin'
	 * })
	 *
	 * const kernel = new Kernel(backend)
	 */
	private constructor(backend: DatabaseBackend) {
		this.backend = backend;
	}

	/**
	 * Create a new [[`Kernel`]] object backed by a PostgreSQL database and
	 * optionally use the specified cache. Return the new `Kernel` and also the
	 * underlying database handler.
	 */
	public static async withPostgres(
		logContext: LogContext,
		cache: Cache | null,
		options: PostgresBackendOptions,
	): Promise<{ kernel: Kernel; pool: Pool }> {
		const backend = new PostgresBackend(cache, options);
		const kernel = new Kernel(backend);
		await kernel.initialize(logContext);

		return { kernel, pool: backend.pool! };
	}

	/**
	 * Get the admin session token. Returns null if this `Kernel` is not
	 * connected.
	 */
	public adminSession(): string | null {
		return this.sessions?.admin || null;
	}

	/**
	 * @summary Disconnect
	 * @function
	 * @public
	 *
	 * @param {MixedContext} context - execution context
	 *
	 * @example
	 * const kernel = new Kernel(backend, { ... })
	 * await kernel.initialize()
	 * await kernel.disconnect()
	 */
	async disconnect(logContext: LogContext) {
		await this.backend.disconnect(new Context(logContext));
	}

	/**
	 * Truncate database tables.
	 */
	async reset(mixedContext: MixedContext) {
		await this.backend.reset(Context.fromMixed(mixedContext, this.backend));
	}

	/**
	 * Drop database tables.
	 */
	async drop(mixedContext: MixedContext) {
		// TODO: we probably want to drop the database itself too.
		await this.backend.drop(Context.fromMixed(mixedContext, this.backend));
	}

	/**
	 * @summary Initialize the kernel
	 * @function
	 * @public
	 *
	 * @param logContext - log context
	 *
	 * @description
	 * This makes sure the kernel is connected to the backend
	 * and that the backend is populated with the things we need.
	 *
	 * @example
	 * const kernel = new Kernel(backend, { ... })
	 * await kernel.initialize()
	 */
	async initialize(logContext: LogContext) {
		const context = new Context(logContext, this.backend);
		await this.backend.connect(context);

		// TODO: all of this bootstrapping should be in the same transaction as the DB setup
		// happening in the connect() call above

		context.debug('Upserting minimal required contracts');

		const unsafeUpsert = (contract: ContractDefinition) => {
			const element = Kernel.defaults(contract);
			return unsafeUpsertContract(context, this.backend, element as Contract);
		};

		await Promise.all([
			unsafeUpsert(CONTRACTS.type),
			unsafeUpsert(CONTRACTS.session),
			unsafeUpsert(CONTRACTS.authentication),
			unsafeUpsert(CONTRACTS.user),
			unsafeUpsert(CONTRACTS['user-settings']),
			unsafeUpsert(CONTRACTS['role-user-admin']),
			unsafeUpsert(CONTRACTS['role-user-community']),
			unsafeUpsert(CONTRACTS['role-user-guest']),
			unsafeUpsert(CONTRACTS['role-user-operator']),
			unsafeUpsert(CONTRACTS['role-user-test']),
		]);

		const adminUser = await unsafeUpsert(CONTRACTS['user-admin']);
		const adminSession = await unsafeUpsert({
			slug: 'session-admin-kernel',
			type: `${CONTRACTS.session.slug}@${CONTRACTS.session.version}`,
			data: {
				actor: adminUser.id,
			},
		} as any as Contract);

		this.sessions = {
			admin: adminSession.id,
		};

		await Promise.all(
			CORE_CONTRACTS.map(async (contract) => {
				context.debug('Upserting core contract', { slug: contract.slug });

				return this.replaceContract(context, this.adminSession()!, contract);
			}),
		);
	}

	/**
	 * @summary Get a contract by its id
	 * @function
	 * @public
	 *
	 * @param {MixedContext} context - execution context
	 * @param {String} session - session id
	 * @param {String} id - contract id
	 * @returns {(Object|Null)} contract
	 */
	async getContractById<T extends Contract = Contract>(
		mixedContext: MixedContext,
		session: string,
		id: string,
	): Promise<T | null> {
		const context = Context.fromMixed(mixedContext, this.backend);
		context.debug('Fetching contract by id', { id });
		const schema: JsonSchema = {
			type: 'object',
			properties: {
				id: {
					type: 'string',
					const: id,
				},
			},
			additionalProperties: true,
			required: ['id'],
		};

		const results = await this.query<T>(context, session, schema, {
			limit: 1,
		});

		context.assertInternal(
			results.length <= 1,
			errors.JellyfishDatabaseError,
			`More than one contract with id ${id}`,
		);

		return results[0] || null;
	}

	/** @deprecated */
	async getCardById<T extends Contract = Contract>(
		mixedContext: MixedContext,
		session: string,
		id: string,
	): Promise<T | null> {
		return await this.getContractById(mixedContext, session, id);
	}

	/**
	 * @summary Get a contract by its slug
	 * @function
	 * @public
	 *
	 * @param {MixedContext} context - execution context
	 * @param {String} session - session id
	 * @param {String} slug - contract slug
	 * @param {Object} options - optional set of extra options
	 * @returns {(Object|Null)} contract
	 */
	async getContractBySlug<T extends Contract = Contract>(
		mixedContext: MixedContext,
		session: string,
		slug: string,
	): Promise<T | null> {
		const context = Context.fromMixed(mixedContext, this.backend);

		context.debug('Fetching contract by slug', { slug });

		context.assertInternal(
			slug,
			errors.JellyfishInvalidSlug,
			'Slug is undefined',
		);

		const [base, version] = slug.split('@');

		context.assertInternal(
			version,
			errors.JellyfishInvalidVersion,
			`No version reference: ${slug}`,
		);

		const queryOptions: BackendQueryOptions = {
			limit: 1,
		};

		const schema: JsonSchema = {
			type: 'object',
			additionalProperties: true,
			properties: {
				slug: {
					type: 'string',
					const: base,
				},
			},
		};

		if (version && version !== 'latest') {
			schema.properties!.version = {
				type: 'string',
				const: version,
			};
		} else if (version === 'latest') {
			queryOptions.sortBy = ['version'];
			queryOptions.sortDir = 'desc';
		}

		const results = await this.query<T>(context, session, schema, queryOptions);

		context.assertInternal(
			results.length <= 1,
			errors.JellyfishDatabaseError,
			`More than one contract with id slug ${slug}`,
		);

		return results[0] || null;
	}

	async getCardBySlug<T extends Contract = Contract>(
		mixedContext: MixedContext,
		session: string,
		slug: string,
	): Promise<T | null> {
		return await this.getContractBySlug(mixedContext, session, slug);
	}

	/**
	 * @summary Insert a contract to the kernel
	 * @function
	 * @public
	 *
	 * @param {MixedContext} context - execution context
	 * @param {String} session - session id
	 * @param {Object} object - contract object
	 * @returns {Object} the inserted contract
	 *
	 * @example
	 * const kernel = new Kernel(backend, { ... })
	 * await kernel.initialize()
	 *
	 * const contract = await kernel.insertContract(
	 *   '4a962ad9-20b5-4dd8-a707-bf819593cc84', { ... })
	 * console.log(contract.id)
	 */
	async insertContract<T extends Contract = Contract>(
		mixedContext: MixedContext,
		session: string,
		object: Partial<T> & Pick<T, 'type'>,
	): Promise<T> {
		const context = Context.fromMixed(mixedContext, this.backend);
		const contract = Kernel.defaults(object);

		context.debug('Inserting contract', { slug: contract.slug });

		await this.preUpsert(context, session, contract as Contract);

		return this.backend.insertElement<T>(context, contract as Contract);
	}

	/** @deprecated */
	async insertCard<T extends Contract = Contract>(
		mixedContext: MixedContext,
		session: string,
		object: Partial<T> & Pick<T, 'type'>,
	): Promise<T> {
		return await this.insertContract(mixedContext, session, object);
	}

	/**
	 * @summary Replace a contract in the kernel
	 * @function
	 * @public
	 *
	 * @param {MixedContext} context - execution context
	 * @param {String} session - session id
	 * @param {Object} object - contract object, the slug or ID must be supplied
	 * @returns {Object} the replaced contract
	 *
	 * @example
	 * const kernel = new Kernel(backend, { ... })
	 * await kernel.initialize()
	 *
	 * const contract = await kernel.replaceContract(
	 *   '4a962ad9-20b5-4dd8-a707-bf819593cc84', { ... })
	 * console.log(contract.id)
	 */
	async replaceContract<T extends Contract = Contract>(
		mixedContext: MixedContext,
		session: string,
		object: Partial<Contract> &
			Pick<Contract, 'type'> &
			(Pick<Contract, 'slug'> | Pick<Contract, 'id'>),
	): Promise<T> {
		const context = Context.fromMixed(mixedContext, this.backend);
		const contract = Kernel.defaults(object);

		context.debug('Replacing contract', { slug: contract.slug });

		await this.preUpsert(context, session, contract as Contract);

		return this.backend.upsertElement(context, contract as Contract);
	}

	/** @deprecated */
	async replaceCard<T extends Contract = Contract>(
		mixedContext: MixedContext,
		session: string,
		object: Partial<Contract> &
			Pick<Contract, 'type'> &
			(Pick<Contract, 'slug'> | Pick<Contract, 'id'>),
	): Promise<T> {
		return await this.replaceContract(mixedContext, session, object);
	}

	private async preUpsert(
		context: Context,
		session: string,
		contract: Contract,
	) {
		context.assertInternal(
			contract.type,
			errors.JellyfishSchemaMismatch,
			'No type in card',
		);

		const { actor, scope } = await resolveActorAndScopeFromSessionId(
			context,
			this.backend,
			session,
		);

		// Fetch necessary objects concurrently
		const [typeContract, authorizationSchema, loop] = await Promise.all([
			this.getContractBySlug<TypeContract>(context, session, contract.type),
			authorization.resolveAuthorizationSchema(
				context,
				this.backend,
				actor,
				scope,
			),
			(async () => {
				return (
					contract.loop && this.backend.getElementBySlug(context, contract.loop)
				);
			})(),
		]);
		const schema =
			typeContract && typeContract.data && typeContract.data.schema;

		// If the loop field is specified, it should be a valid loop contract
		if (contract.loop) {
			context.assertInternal(
				loop && loop.type.split('@')[0] === 'loop',
				errors.JellyfishNoElement,
				`No such loop: ${contract.loop}`,
			);
		}

		context.assertInternal(
			schema,
			errors.JellyfishUnknownCardType,
			`Unknown type: ${contract.type}`,
		);
		// TODO: Remove this once we completely migrate links
		// to have versioned types in the "from" and the "to"
		// We put this check here, before we type-check the
		// upsert, so we don't cause violations to the type
		// if the from/to have no versions.
		// See: https://github.com/product-os/jellyfish/pull/3088
		if (
			contract.type === 'link@1.0.0' &&
			contract.data &&
			contract.data.from &&
			contract.data.to &&
			(contract.data as any).from.type &&
			(contract.data as any).to.type &&
			!_.includes((contract.data as any).from.type, '@') &&
			!_.includes((contract.data as any).to.type, '@')
		) {
			(contract.data as any).from.type = `${
				(contract.data as any).from.type
			}@1.0.0`;
			(contract.data as any).to.type = `${
				(contract.data as any).to.type
			}@1.0.0`;
		}
		try {
			jsonSchema.validate(schema as any, contract);
		} catch (error) {
			if (error instanceof errors.JellyfishSchemaMismatch) {
				error.expected = true;
			}
			throw error;
		}
		try {
			jsonSchema.validate(authorizationSchema as any, contract);
		} catch (error) {
			// Failing to match the filter schema is a permissions error
			if (error instanceof errors.JellyfishSchemaMismatch) {
				const newError = new errors.JellyfishPermissionsError(error.message);
				newError.expected = true;
				throw newError;
			}
			throw error;
		}

		// Validate that both sides of the link contract are readable before inserting
		if (contract.type === 'link@1.0.0') {
			const targetContractIds = [
				(contract as LinkContract).data.from.id,
				(contract as LinkContract).data.to.id,
			];

			await Promise.all(
				targetContractIds.map(async (targetContractId) => {
					const targetContract = await this.getContractById(
						context,
						session,
						targetContractId,
					);

					if (!targetContract) {
						const newError = new errors.JellyfishNoLinkTarget(
							`Link target does not exist: ${targetContractId}`,
						);
						newError.expected = true;
						throw newError;
					}
				}),
			);
		}

		return authorizationSchema;
	}

	/**
	 * @summary Patch a contract in the kernel
	 * @function
	 * @public
	 *
	 * @description
	 * See https://tools.ietf.org/html/rfc6902
	 *
	 * @param {MixedContext} context - execution context
	 * @param {String} session - session id
	 * @param {String} slug - contract slug
	 * @param {Object[]} patch - JSON Patch operations
	 * @returns {Object} the patched contract
	 */
	async patchContractBySlug<T = Contract>(
		mixedContext: MixedContext,
		session: string,
		slug: string,
		patch: jsonpatch.Operation[],
	): Promise<T> {
		const context = Context.fromMixed(mixedContext, this.backend);

		const { actor, scope } = await resolveActorAndScopeFromSessionId(
			context,
			this.backend,
			session,
		);

		const authorizationSchema = await authorization.resolveAuthorizationSchema(
			context,
			this.backend,
			actor,
			scope,
		);

		const result = await metrics.measureContractPatch(async () => {
			return context.withTransaction(
				TransactionIsolation.Atomic,
				async (transactionContext: Context) => {
					// Set options to ensure subsequent queries are a part of the transaction
					const options = {
						skipCache: true,
					};

					// Fetch necessary data from database
					const fullContract = await this.backend.getElementBySlug(
						transactionContext,
						slug,
						{
							...options,
							lock: true,
						},
					);

					transactionContext.assertInternal(
						fullContract,
						errors.JellyfishNoElement,
						`No such card: ${slug}`,
					);

					// TODO: Remove this log once we understand why we are having link contract patch requests.
					if (fullContract.type === 'link@1.0.0') {
						transactionContext.info('Received request to patch a link card', {
							card: fullContract,
							patch,
						});
					}

					const filteredContract = await this.getContractBySlug(
						transactionContext,
						session,
						`${fullContract.slug}@${fullContract.version}`,
					);

					if (patch.length === 0) {
						return filteredContract;
					}

					const typeContract = await this.getContractBySlug<TypeContract>(
						transactionContext,
						session,
						fullContract.type,
					);

					transactionContext.assertInternal(
						filteredContract,
						errors.JellyfishNoElement,
						`No such contract: ${slug}`,
					);

					const schema =
						typeContract && typeContract.data && typeContract.data.schema;

					transactionContext.assertInternal(
						schema,
						errors.JellyfishUnknownCardType,
						`Unknown type: ${fullContract.type}`,
					);

					/*
					 * The idea of this algorithm is that we get the full contract
					 * as stored in the database and the contract as the current actor
					 * can see it. Then we apply the patch to both the full and
					 * the filtered contract, aborting if it fails on any. If it succeeds
					 * then we upsert the full contract to the database, but only
					 * if the resulting filtered contract still matches the permissions
					 * filter.
					 */
					// TS-TODO: "filteredContract" might be null here, and we should account for this
					const patchedFilteredContract = patchContract(
						filteredContract!,
						patch,
						{
							mutate: true,
						},
					);

					jsonSchema.validate(
						authorizationSchema as any,
						patchedFilteredContract,
					);

					const patchedFullContract = patchContract(fullContract, patch, {
						mutate: false,
					});

					try {
						jsonSchema.validate(schema as any, patchedFullContract);
					} catch (error) {
						if (error instanceof errors.JellyfishSchemaMismatch) {
							error.expected = true;

							// Because the "full" unrestricted card is being validated there is
							// potential for an error message to leak private data. To prevent this,
							// override the detailed error message with a generic one.
							error.message = 'The updated card is invalid';
						}

						throw error;
					}

					// Don't do a pointless update
					if (fastEquals.deepEqual(patchedFullContract, fullContract)) {
						return fullContract;
					}

					// TODO: Remove this log once we understand why we are having link contract patch requests.
					if (fullContract.type === 'link@1.0.0') {
						transactionContext.info('Upserting link contract after patch', {
							card: patchedFullContract,
							patch,
						});
					}

					// If the loop field is changing, check that it points to an actual loop contract
					if (
						patchedFullContract.loop &&
						patchedFullContract.loop !== fullContract.loop
					) {
						const loopContract = await this.backend.getElementBySlug(
							transactionContext,
							patchedFullContract.loop,
						);
						transactionContext.assertInternal(
							loopContract && loopContract.type.split('@')[0] === 'loop',
							errors.JellyfishNoElement,
							`No such loop: ${patchedFullContract.loop}`,
						);
					}

					const upsertedCard = await this.backend.upsertElement(
						transactionContext,
						patchedFullContract,
					);

					// Otherwise a person that patches a card gets
					// to see the full card, but we also need to get back the stuff, the kernel
					// update on the root of the card
					// This will get removed once we get rid of field-level permissions.
					return {
						...patchedFilteredContract,
						created_at: upsertedCard.created_at,
						updated_at: upsertedCard.updated_at,
					};
				},
			);
		});

		return result;
	}

	/** @deprecated */
	async patchCardBySlug<T = Contract>(
		mixedContext: MixedContext,
		session: string,
		slug: string,
		patch: jsonpatch.Operation[],
	): Promise<T> {
		return await this.patchContractBySlug(mixedContext, session, slug, patch);
	}

	/**
	 * @summary Query the kernel
	 * @function
	 * @public
	 *
	 * @param {MixedContext} context - execution context
	 * @param {String} session - session id
	 * @param {Object} schema - JSON Schema
	 * @param {Object} [options] - options
	 * @param {Number} [options.limit] - query limit
	 * @param {Number} [options.skip] - skip
	 * @param {String | String[]} [options.sortBy] - Key or key path as an array to
	 *   a value that the query should be sorted by
	 * @param {'asc' | 'desc'} [options.sortDir] - Set sort direction,
	 * @returns {Object[]} results
	 *
	 * @example
	 * const kernel = new Kernel(backend, { ... })
	 * await kernel.initialize()
	 *
	 * const results = await kernel.query('4a962ad9-20b5-4dd8-a707-bf819593cc84', {
	 *   type: 'object',
	 *   properties: {
	 *     slug: {
	 *       type: 'string',
	 *       const: 'foo'
	 *     }
	 *   },
	 *   required: [ 'slug' ]
	 * })
	 */
	async query<T extends Contract = Contract>(
		mixedContext: MixedContext,
		sessionId: string,
		querySchema: JsonSchema | ViewContract,
		options: QueryOptions = {},
	): Promise<T[]> {
		const context = Context.fromMixed(mixedContext, this.backend);

		querySchema = await preprocessQuerySchema(querySchema);

		if (options.mask) {
			querySchema = {
				allOf: [querySchema, options.mask],
			};
		}

		const { actor, scope } = await resolveActorAndScopeFromSessionId(
			context,
			this.backend,
			sessionId,
		);

		const authorizedQuerySchema = await authorization.authorizeQuery(
			context,
			this.backend,
			actor,
			scope,
			querySchema as JsonSchema,
		);

		const selectObject = await getSelectObjectFromSchema(
			querySchema,
			authorizedQuerySchema,
		);

		return this.backend
			.query(context, selectObject, authorizedQuerySchema, options)
			.catch((error) => {
				if (error instanceof errors.JellyfishDatabaseTimeoutError) {
					context.warn('Query timeout', { querySchema });
				}
				throw error;
			});
	}

	/**
	 * @summary Stream events from objects that match a schema
	 * @function
	 * @public
	 *
	 * @description
	 * The event emitter emits the following events:
	 *
	 * - data: when there is a change. The payload is an object with the
	 *   following keys:
	 *   - id: ID of the contract that was changed
	 *   - type: change type. One of:
	 *     - insert: on insertion
	 *     - update: on update
	 *     - delete: on deletion
	 *     - unmatch: on an update to a previously seen contract (either from `data`
	 *       or `dataset` events) that makes the contract not match the schema
	 *       anymore
	 *   - after: the result of running a query for this stream's schema on the
	 *     relevant contract after an insertion or update. `null` on delete or
	 *     unmatch
	 * - dataset: in response to the `query` event. The payload is an object with
	 *   the following keys:
	 *   - id: the query ID
	 *   - contracts: the array of contracts
	 * - error: when there is an error. The payload is the error
	 * - closed: when the connection is closed after calling `.close()`
	 *
	 * The event emitter also accepts the following events:
	 *
	 * - query: query with a schema. This is almost the same as calling `query()`
	 *   with the stream's context and session. The only difference is that the
	 *   resulting contracts become eligible for the `unmatch` event type. The query
	 *   results are returned through the `dataset` event. The payload is an
	 *   object with the following keys:
	 *   - id: a free-form ID for this query. Optional
	 *   - schema: the schema to be queried
	 *   - options: an options object in the same format as `query()`
	 * - setSchema: set the stream's schema. The payload is the new schema
	 *
	 * @param {MixedContext} context - execution context
	 * @param {String} session - session id
	 * @param {Object} schema - JSON Schema
	 * @param {Object} options - options object
	 * @returns {EventEmitter} emitter
	 *
	 * @example
	 * const kernel = new Kernel(backend, { ... })
	 * await kernel.initialize()
	 *
	 * const emitter = await kernel.stream('4a962ad9-20b5-4dd8-a707-bf819593cc84', {
	 *   type: 'object',
	 *   properties: {
	 *     type: {
	 *       type: 'string',
	 *       pattern: '^example$'
	 *     }
	 *   },
	 *   required: [ 'type' ]
	 * })
	 *
	 * emitter.on('error', (error) => {
	 *   throw error
	 * })
	 *
	 * emitter.on('closed', () => {
	 *   console.log('Closed!')
	 * })
	 *
	 * emitter.on('data', (change) => {
	 *   console.log(change.id)
	 *   console.log(change.type)
	 *   console.log(change.after)
	 * })
	 *
	 * // At some point...
	 * emitter.close()
	 */
	async stream(
		mixedContext: MixedContext,
		session: string,
		querySchema: JsonSchema,
		options: QueryOptions = {},
	) {
		const context = Context.fromMixed(mixedContext, this.backend);

		const { actor, scope } = await resolveActorAndScopeFromSessionId(
			context,
			this.backend,
			session,
		);

		querySchema = await preprocessQuerySchema(querySchema);

		if (options.mask) {
			querySchema = {
				allOf: [querySchema, options.mask],
			};
		}

		const authorizedQuerySchema = await authorization.authorizeQuery(
			context,
			this.backend,
			actor,
			scope,
			querySchema,
		);

		context.debug('Opening stream');

		const stream = await this.backend.stream(
			await getSelectObjectFromSchema(querySchema, authorizedQuerySchema),
			authorizedQuerySchema,
			options,
		);

		await setupStreamEventHandlers(context, this.backend, stream, actor, scope);

		return stream;
	}

	/**
	 * Get a full contract from a partial one. Missing fields are given a
	 * default value.
	 */
	static defaults<Data = ContractData, Links = { [key: string]: Contract[] }>(
		contract: Partial<Contract<Data, Links>> &
			Pick<Contract<Data, Links>, 'type'>,
	): Omit<Contract<Data, Links>, 'id'> {
		const extras: { created_at?: string; slug?: string } = {};

		// Only create a timestamp if it's necessary
		if (!contract.created_at) {
			extras.created_at = new Date().toISOString();
		}

		// Only create a slug if it's necessary
		if (!contract.slug) {
			extras.slug = generateSlug(contract);
		}

		// There are two `as` casts here:
		//
		// - `data`: we cannot make any assumptions as to what `Data` is nor
		//   can construct a default value for `Data`. Thus an `as any` cast is
		//   necessary to typecheck.
		// - Return type: can't convince TS that `created_at` and `slug` will
		//   always be set.
		return {
			updated_at: null,
			linked_at: {},
			active: true,
			version: '1.0.0',
			tags: [],
			markers: [],
			loop: null,
			links: {},
			requires: [],
			capabilities: [],
			data: {} as any,
			...extras,
			...contract,
		} as Omit<Contract<Data, Links>, 'id'>;
	}

	/**
	 * @summary Report status from the kernel
	 * @function
	 * @public
	 *
	 * const kernel = new Kernel(backend, { ... })
	 * await kernel.initialize()
	 *
	 * @returns {Object} status
	 *
	 * @example
	 * const kernel = new Kernel(backend, { ... })
	 * await kernel.initialize()
	 *
	 * const status = await kernel.getStatus()
	 * console.log(status)
	 */
	async getStatus() {
		return {
			backend: await this.backend.getStatus(),
		};
	}
}

const setupStreamEventHandlers = async (
	context: Context,
	backend: any,
	stream: Stream,
	actor: Contract,
	scope: JsonSchema,
): Promise<void> => {
	// Attach event handlers. We got to do this here and not in any lower
	// levels because of the whole permissions handling
	stream.on('query', async (payload) => {
		let querySchema = await preprocessQuerySchema(payload.schema);

		if (payload.options?.mask) {
			querySchema = {
				allOf: [querySchema, payload.options?.mask],
			};
		}

		const authorizedQuerySchema = await authorization.authorizeQuery(
			context,
			backend,
			actor,
			scope,
			payload.schema,
		);

		const contracts = await stream.query(
			await getSelectObjectFromSchema(payload.schema, authorizedQuerySchema),
			authorizedQuerySchema,
			payload.options,
		);

		stream.emit('dataset', {
			id: payload.id,
			cards: contracts,
		});
	});

	stream.on('setSchema', async (newSchema) => {
		const querySchema = await preprocessQuerySchema(newSchema);

		const authorizedQuerySchema = await authorization.authorizeQuery(
			context,
			backend,
			actor,
			scope,
			querySchema,
		);

		stream.setSchema(
			await getSelectObjectFromSchema(newSchema, authorizedQuerySchema),
			authorizedQuerySchema,
		);
	});
};
