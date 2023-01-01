import * as metrics from '@balena/jellyfish-metrics';
import * as Bluebird from 'bluebird';
import * as _ from 'lodash';
import { randomUUID } from 'node:crypto';
import * as pgFormat from 'pg-format';
import * as traverse from 'traverse';
import type { PostgresBackend } from '.';
import { errors } from '../../';
import type { Context } from '../../context';
import type { Contract, ContractDefinition, JsonSchema } from '../../types';
import { SqlPath } from './jsonschema2sql/sql-path';
import { generateTypeIndexPredicate } from './jsonschema2sql/table-index';
import * as textSearch from './jsonschema2sql/text-search';
import type { SearchFieldDef } from './types';
import * as utils from './utils';

// tslint:disable-next-line: no-var-requires
const { version: coreVersion } = require('../../../package.json');

const CARDS_TABLE = 'cards';
const CARDS_TRIGGER_COLUMNS = [
	'active',
	'version_major',
	'version_minor',
	'version_patch',
	'version_prerelease',
	'version_build',
	'name',
	'loop',
	'tags',
	'markers',
	'links',
	'requires',
	'capabilities',
	'data',
	'linked_at',
];
const CARDS_SELECT = [
	'id',
	'slug',
	'type',
	'active',
	`${SqlPath.getVersionComputedField()} AS version`,
	'name',
	'loop',
	'tags',
	'markers',
	'created_at',
	'linked_at',
	'updated_at',
	'links',
	'requires',
	'capabilities',
	'data',
].join(', ');

/**
 * Parses and normalizes slug versions. Can handle these patterns:
 *
 * some-slug
 *  \- ...@1, ...@1.1, ...@1.2.3
 *    \- ...-alpha, ...-alpha+rev1, ...+rev1
 *  \- ...@latest
 * and will normalize so that major,minor,patch all fallback to 0 if not specified
 *
 * balenaOS versions allow spaces and expect natural sort. This is not valid here.
 * Spaces must be removed and numbers must be padded to be sortable alphanumerically.
 *
 * @param {String} slug - the slug including the @version part
 * @returns {*} the different parts of the versioned slug
 */
export const parseVersionedSlug = (slug: string) => {
	const slugVersionPattern = /^(?<base>[a-zA-Z0-9-]+)(@(?<version>.*))?$/;

	const match = slugVersionPattern.exec(slug);
	if (!match || !match.groups) {
		throw new Error(`slug format invalid: ${slug}`);
	}
	const { base, version } = match.groups;
	const { major, minor, patch, prerelease, build, latest } =
		utils.parseVersion(version);

	return {
		base,
		major,
		minor,
		patch,
		prerelease,
		build,
		latest,
	};
};

export const TABLE = CARDS_TABLE;
export const TRIGGER_COLUMNS = CARDS_TRIGGER_COLUMNS;

export const setup = async (
	context: Context,
	backend: PostgresBackend,
	options: {
		// The name of the "cards" table, defaults to the TABLE constant
		table?: string;
	} = {},
) => {
	const table = options.table || TABLE;
	const tables = _.map(
		await context.query(`
			SELECT table_name
			FROM information_schema.tables
			WHERE table_schema = 'public'
		`),
		'table_name',
	);
	if (!tables.includes(table)) {
		await context.runQuery(`
			CREATE TABLE IF NOT EXISTS ${table} (
				id UUID PRIMARY KEY NOT NULL,
				slug VARCHAR (255) NOT NULL,
				type TEXT NOT NULL,
				active BOOLEAN NOT NULL,
				version_major INTEGER NOT NULL DEFAULT 1,
				version_minor INTEGER NOT NULL DEFAULT 0,
				version_patch INTEGER NOT NULL DEFAULT 0,
				version_prerelease TEXT NOT NULL DEFAULT '',
				version_build TEXT NOT NULL DEFAULT '',
				name TEXT,
				loop TEXT,
				tags TEXT[] NOT NULL,
				markers TEXT[] NOT NULL,
				links JSONB NOT NULL,
				requires JSONB[] NOT NULL,
				capabilities JSONB[] NOT NULL,
				data JSONB NOT NULL,
				linked_at JSONB NOT NULL,
				created_at TIMESTAMP WITH TIME ZONE NOT NULL,
				updated_at TIMESTAMP WITH TIME ZONE,
				CONSTRAINT ${table}_slug_version_key
					UNIQUE (slug, version_major, version_minor, version_patch, version_prerelease, version_build),
				CONSTRAINT version_positive
					CHECK (version_major >= 0 AND version_minor >= 0 AND version_patch >= 0)
			);

			-- Disable compression on the jsonb columns so we can access its
			-- properties faster.
			-- See http://erthalion.info/2017/12/21/advanced-json-benchmarks/
			ALTER TABLE ${table}
			ALTER COLUMN data SET STORAGE EXTERNAL,
			ALTER COLUMN links SET STORAGE EXTERNAL,
			ALTER COLUMN linked_at SET STORAGE EXTERNAL;

			-- Recursive function to merge JSONB objects. This function assumes
			-- both objects are just views into the same underlying object
			CREATE OR REPLACE FUNCTION merge_jsonb_views(x jsonb, y jsonb) RETURNS jsonb AS $$
				SELECT coalesce(merged.payload, '{}'::jsonb)
				FROM (
					SELECT jsonb_object_agg(
						coalesce(x_key, y_key),
						CASE
							WHEN jsonb_typeof(x_value) = 'object' OR jsonb_typeof(x_value) = 'object'
							THEN merge_jsonb_views(x_value, y_value)
							ELSE coalesce(x_value, y_value)
						END
					) AS payload
					FROM jsonb_each(x) AS f1(x_key, x_value)
					FULL OUTER JOIN jsonb_each(y) AS f2(y_key, y_value)
					ON x_key = y_key
				) AS merged
			$$ LANGUAGE SQL IMMUTABLE PARALLEL SAFE;

			 -- Create function that allows us to create tsvector indexes from
			 -- text[] fields
			CREATE OR REPLACE FUNCTION immutable_array_to_string(arr text[], sep text) RETURNS text AS $$
				SELECT array_to_string(arr, sep);
			$$ LANGUAGE SQL IMMUTABLE;
		`);
	}

	await Promise.all([
		Bluebird.map(
			[
				{
					column: 'slug',
				},
				{
					column: 'loop',
				},
				{
					column: 'tags',
					indexType: 'GIN',
				},
				{
					column: 'type',
				},
				{
					name: 'data_mirrors',
					column: "(data->'mirrors')",
					indexType: 'GIN',
					options: 'jsonb_path_ops',
				},
				{
					column: 'created_at',
					options: 'DESC',
				},
				{
					column: 'updated_at',
				},
			],
			async (secondaryIndex) => {
				/*
				 * This is the actual name of the index that we will create
				 * in Postgres.
				 *
				 * Keep in mind that if you change this, then this code will
				 * not be able to cleanup older indexes with the older
				 * name convention.
				 */
				const fullyQualifiedIndexName = `${
					secondaryIndex.name || secondaryIndex.column
				}_${table}_idx`;
				await backend.createIndex(
					context,
					table,
					fullyQualifiedIndexName,
					coreVersion,
					`USING ${secondaryIndex.indexType || 'BTREE'} (${
						secondaryIndex.column
					} ${secondaryIndex.options || ''})`,
				);
			},
			{
				concurrency: 1,
			},
		),
	]);
};

export const getById = async (
	context: Context,
	id: string,
	options: {
		// The name of the "cards" table, defaults to the TABLE constant
		table?: string;
	} = {},
) => {
	const table = options.table || TABLE;
	context.debug('Getting element by id', {
		id,
		table,
	});
	const results = await context.query(
		`
		SELECT ${CARDS_SELECT}
		FROM ${table}
		WHERE id = $1
		LIMIT 1
		`,
		[id],
	);
	if (results[0]) {
		metrics.markContractReadFromDatabase(results[0]);
	}
	return results[0] || null;
};

export const getBySlug = async (
	context: Context,
	slug: string,
	options: {
		// The name of the "cards" table, defaults to the TABLE constant
		table?: string;
		lock?: boolean;
	} = {},
) => {
	const table = options.table || TABLE;

	context.debug('Getting element by slug', {
		slug,
		table,
		locking: options.lock,
	});

	const { base, major, minor, patch, prerelease, build, latest } =
		parseVersionedSlug(slug);

	let results = [];

	// We don't test if we're in a transaction here because FOR UPDATE simply
	// won't have an effect then. Might still be worth to add a warning though
	const lockSql = options.lock ? 'FOR UPDATE' : '';

	if (latest) {
		results = await context.query(
			`
			SELECT ${CARDS_SELECT}
			FROM ${table}
			WHERE slug = $1 AND version_prerelease = ''
			ORDER BY
				version_major DESC,
				version_minor DESC,
				version_patch DESC,
				version_build DESC
			LIMIT 1
			${lockSql}
			`,
			[base],
		);
	} else {
		results = await context.query(
			`
			SELECT ${CARDS_SELECT}
			FROM ${table}
			WHERE
				slug = $1 AND
				version_major = $2 AND
				version_minor = $3 AND
				version_patch = $4 AND
				version_prerelease = $5 AND
				version_build = $6
			LIMIT 1
			${lockSql}
			`,
			[base, major, minor, patch, prerelease, build],
		);
	}
	_.forEach(results, utils.convertDatesToISOString);
	_.forEach(results, (result) => {
		metrics.markContractReadFromDatabase(result);
	});
	return results[0] || null;
};

export const getManyById = async (
	context: Context,
	ids: string[],
	options: {
		// The name of the "cards" table, defaults to the TABLE constant
		table?: string;
	} = {},
) => {
	const table = options.table || TABLE;
	context.debug('Batch get by id', {
		count: ids.length,
		table,
	});
	const results = await context.query(
		`
		SELECT ${CARDS_SELECT}
		FROM ${table}
		WHERE id = ANY ($1)
		`,
		[ids],
	);
	_.forEach(results, utils.convertDatesToISOString);
	_.forEach(results, (result) => {
		metrics.markContractReadFromDatabase(result);
	});
	return results;
};

export const upsert = async <T extends Contract = Contract>(
	context: Context,
	object: Omit<Contract, 'id'> & Partial<Pick<Contract, 'id'>>,
	options: {
		// The name of the "cards" table, defaults to the TABLE constant
		table?: string;
		// Optional UUID to be used for this contract
		id?: string;
		// True if existing contract is being updated
		replace?: boolean;
	} = {},
): Promise<T> => {
	const table = options.table || TABLE;
	context.assertInternal(
		object.slug,
		errors.JellyfishDatabaseError,
		'Missing primary key',
	);
	context.assertInternal(
		object.type,
		errors.JellyfishDatabaseError,
		'Missing type',
	);
	const insertedObject = Object.assign({}, object);
	insertedObject.links = {};
	const elementId = options.id || insertedObject.id || randomUUID();
	if (options.replace) {
		insertedObject.updated_at = new Date().toISOString();
		context.debug('Upserting element', {
			table,
			slug: insertedObject.slug,
		});
	} else {
		insertedObject.created_at = new Date().toISOString();
		context.debug('Inserting element', {
			table,
			slug: insertedObject.slug,
		});
	}
	const version = utils.parseVersion(insertedObject.version);
	const payload = [
		elementId,
		insertedObject.slug,
		insertedObject.type,
		insertedObject.active,
		version.major,
		version.minor,
		version.patch,
		version.prerelease,
		version.build,
		typeof insertedObject.name === 'string' ? insertedObject.name : null,
		insertedObject.tags,
		insertedObject.markers,
		insertedObject.links,
		insertedObject.requires,
		insertedObject.capabilities,
		insertedObject.data,
		{},
		new Date(insertedObject.created_at),
		insertedObject.updated_at ? new Date(insertedObject.updated_at) : null,
		typeof insertedObject.loop === 'string' ? insertedObject.loop : null,
	];
	let results = null;
	// Its very important, for concurrency issues, that inserts/upserts
	// remain atomic, in that there is only one atomic request sent to
	// the database. We were previously violating this principle by
	// querying the database before proceeding with the insertion.
	try {
		if (options.replace) {
			results = await context.query(
				`
				INSERT INTO ${table} (
					id,
					slug,
					type,
					active,
					version_major,
					version_minor,
					version_patch,
					version_prerelease,
					version_build,
					name,
					tags,
					markers,
					links,
					requires,
					capabilities,
					data,
					linked_at,
					created_at,
					updated_at,
					loop
				)
				VALUES (
					$1,
					$2,
					$3,
					$4,
					$5,
					$6,
					$7,
					$8,
					$9,
					$10,
					$11,
					$12,
					$13,
					$14,
					$15,
					$16,
					$17,
					$18,
					NULL,
					$20
				)
				ON CONFLICT (
					slug,
					version_major,
					version_minor,
					version_patch,
					version_prerelease,
					version_build
				) DO UPDATE SET
					id = ${table}.id,
					active = $4,
					name = $10,
					tags = $11,
					markers = $12,
					links = ${table}.links,
					requires = $14,
					capabilities = $15,
					data = $16,
					linked_at = ${table}.linked_at,
					created_at = ${table}.created_at,
					updated_at = $19,
					loop = $20
				RETURNING ${CARDS_SELECT}
				`,
				payload,
			);
		} else {
			results = await context.query(
				`
				INSERT INTO ${table} (
					id,
					slug,
					type,
					active,
					version_major,
					version_minor,
					version_patch,
					version_prerelease,
					version_build,
					name,
					tags,
					markers,
					links,
					requires,
					capabilities,
					data,
					linked_at,
					created_at,
					updated_at,
					loop
				)
				VALUES (
					$1,
					$2,
					$3,
					$4,
					$5,
					$6,
					$7,
					$8,
					$9,
					$10,
					$11,
					$12,
					$13,
					$14,
					$15,
					$16,
					$17,
					$18,
					$19,
					$20
				)
				RETURNING ${CARDS_SELECT}
				`,
				payload,
			);
		}
	} catch (error: any) {
		if (/^duplicate key value/.test(error.message)) {
			if (/pkey/.test(error.message)) {
				const upsertError = new errors.JellyfishElementAlreadyExists(
					`There is already an element with id ${object.id}`,
				);
				// TS-TODO: Why are we adding an "id" to the error?
				(upsertError as any).id = object.id;
				throw upsertError;
			} else {
				const upsertError = new errors.JellyfishElementAlreadyExists(
					`There is already an element with slug ${object.slug}@${object.version}`,
				);
				// TS-TODO: Why are we adding a "slug" to the error?
				(upsertError as any).slug = object.slug;
				throw upsertError;
			}
		}
		if (/^value too long/.test(error.message)) {
			throw new errors.JellyfishInvalidSlug(
				`The primary key is too long: ${object.slug}`,
			);
		}
		if (/canceling statement due to statement timeout/.test(error.message)) {
			const verb = options.replace ? 'upserting' : 'inserting';
			throw new errors.JellyfishDatabaseTimeoutError(
				`Timeout when ${verb} ${object.slug}`,
			);
		}
		throw new errors.JellyfishDatabaseError(error.message);
	}
	insertedObject.name =
		typeof insertedObject.name === 'string' ? insertedObject.name : null;
	insertedObject.id = results[0].id;
	insertedObject.created_at = results[0].created_at;
	insertedObject.updated_at = results[0].updated_at;
	insertedObject.linked_at = results[0].linked_at;
	insertedObject.version = results[0].version;
	utils.convertDatesToISOString(insertedObject);
	options.replace
		? metrics.markContractUpsert(insertedObject as Contract)
		: metrics.markContractInsert(insertedObject as Contract);
	return insertedObject as T;
};

export const materializeLink = async (
	context: Context,
	card: Contract,
	options: {
		// The name of the "cards" table, defaults to the TABLE constant
		table?: string;
	} = {},
) => {
	const table = options.table || TABLE;
	try {
		await context.runQuery(
			`
			UPDATE ${table}
			SET linked_at = $1::jsonb
			WHERE id = $2
			`,
			[card.linked_at, card.id],
		);
	} catch (error: any) {
		if (/^duplicate key value/.test(error.message)) {
			throw new errors.JellyfishElementAlreadyExists(
				`There is already an element with the slug ${card.slug}`,
			);
		}
		if (/^value too long/.test(error.message)) {
			throw new errors.JellyfishInvalidSlug(
				`The primary key is too long: ${card.slug}`,
			);
		}
		throw new errors.JellyfishDatabaseError(error.message);
	}
};

/**
 * @param {Context} context - Session context
 * @param {BackendConnection} connection - Database connection
 * @param {String[]} fields - Fields to use as an index
 * @param {Object} schema - The card schema
 *
 * @example
 * const fields = [ 'name',	'data.from.id',	'data.to.id' ];
 * await cards.createTypeIndex(context, connection, 'cards', fields, 'link', {...});
 */
export const createTypeIndex = async (
	context: Context,
	connection: PostgresBackend,
	fields: string[],
	schema: ContractDefinition<any>,
	retries: number = 1,
): Promise<void> => {
	/*
	 * This is the actual name of the index that we will create
	 * in Postgres.
	 *
	 * Keep in mind that if you change this, then this code will
	 * not be able to cleanup older indexes with the older
	 * name convention.
	 */
	const fullyQualifiedIndexName = `${schema.slug}__${fields
		.join('__')
		.replace(/\./g, '_')}__idx`;

	// If two instances run this function simultaneously, it's possible to enter a race condition
	// where the index creation will fail with an error, as one instance will create the index
	// before the other. Ideally we want a unified way of handling system bootstrapping, but for now we
	// can simply retry once on a failure and check again to see if the index already exists.
	try {
		await connection.createIndex(
			context,
			CARDS_TABLE,
			fullyQualifiedIndexName,
			schema.version!,
			generateTypeIndexPredicate(fields, schema),
			schema.slug,
		);
	} catch (error: any) {
		context.warn('Hit error whilst creating type index', error.message);
		if (retries === 0) {
			throw error;
		} else {
			return createTypeIndex(context, connection, fields, schema, retries - 1);
		}
	}
};
/**
 * @param {Context} context - session context
 * @param {BackendConnection} connection - database connection
 * @param {String} type - type contract versioned slug
 * @param {Array} fields - fields to build indexes for
 *
 * @example
 * const type = 'message@1.0.0'
 * const fields = [
 *   {
 *     path: [ 'data', 'payload', 'message' ],
 *     isArray: true
 *   }
 * ]
 * await cards.createFullTextSearchIndex(context, connection, type, fields)
 */
export const createFullTextSearchIndex = async (
	context: Context,
	database: PostgresBackend,
	type: string,
	fields: SearchFieldDef[],
	retries: number = 1,
): Promise<void> => {
	// Leave early if fields is empty
	if (_.isEmpty(fields)) {
		return;
	}

	// Create all necessary search indexes for the given type.
	// Similar to the logic, in createTypeIndex, we retry once on failure in case we hit a race condition.
	try {
		for (const field of fields) {
			const path = SqlPath.fromArray(_.clone(field.path));
			const isJson = path.isProcessingJsonProperty;
			const name = `${type.split('@')[0]}__${field.path.join('_')}__search_idx`;
			await database.createIndex(
				context,
				CARDS_TABLE,
				name,
				type.split('@')[1],
				`USING GIN(${textSearch.toTSVector(
					path.toSql(CARDS_TABLE),
					isJson,
					field.isArray,
				)})
					WHERE type=${pgFormat.literal(type)}`,
				type.split('@')[0],
			);
		}
	} catch (error: any) {
		context.warn(
			'Hit error whilst creating full text search index',
			error.message,
		);
		if (retries === 0) {
			throw error;
		} else {
			return createFullTextSearchIndex(
				context,
				database,
				type,
				fields,
				retries - 1,
			);
		}
	}
};
/* @summary Parse field paths denoted as being targets for full-text search
 * @function
 *
 * @param {Object} context - session context
 * @param {Object} schema - type card schema to traverse
 * @param {Object} errors - a set of rich error classes
 * @returns {Array} list of objects containing field path information
 *
 * @example
 * const paths = parseFullTextSearchFields(context, schema, errors)
 */
export const parseFullTextSearchFields = (
	context: Context,
	schema: JsonSchema,
) => {
	const fields: SearchFieldDef[] = [];
	const combinators = ['anyOf', 'allOf', 'oneOf'];
	traverse(schema).forEach(function (_node) {
		if (
			this.key === 'fullTextSearch' &&
			this.node === true &&
			!_.isNil(this.parent?.node.type)
		) {
			// Throw an error if item doesn't have "string" as a possible type.
			const hasStringType = Boolean(
				_.includes(this.parent?.node.type, 'string') ||
					(_.has(this.parent?.node, ['items', 'type']) &&
						this.parent?.node.items.type.includes('string')),
			);
			context.assertInternal(
				hasStringType,
				errors.JellyfishInvalidSchema,
				'Full-text search fields must contain "string" as a possible type',
			);
			if (_.intersection(this.path, combinators).length > 0) {
				// Handle combinators by creating an index for its parent node.
				for (let idx = 0; idx < this.path.length; idx++) {
					if (/^anyOf|allOf|oneOf$/.test(this.path[idx])) {
						const path = fromTypePath(_.slice(this.path, 0, idx));
						if (
							!_.find(fields, (field) => {
								return _.isEqual(field.path, path);
							})
						) {
							fields.push({
								path,
								isArray: false,
							});
						}
					}
				}
			} else {
				fields.push({
					path: fromTypePath(_.dropRight(this.path)),
					isArray: Boolean(this.parent?.node.type === 'array'),
				});
			}
		}
	});
	return fields;
};

/**
 * @summary Convert field path in type card to path used inside of cards of that type
 * @function
 *
 * @param {Array} from - full path to field as defined in the type card
 * @returns {Array} path to same field but in the context of non-type card
 *
 * @example
 * const from = [ 'data', 'schema', 'properties', 'data', 'properties', 'tags' ]
 * const path = cards.fromTypePath(from)
 */
export const fromTypePath = (from: string[]): string[] => {
	const path = from
		.join('.')
		.replace(/^data\.schema\.properties\./, '')
		.split('.');
	const target = path.pop();
	_.remove(path, (element) => {
		return element === 'properties';
	});
	path.push(target!);
	return path;
};
