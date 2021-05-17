/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const _ = require('lodash')
const Bluebird = require('bluebird')
const pgFormat = require('pg-format')
const logger = require('@balena/jellyfish-logger').getLogger('jellyfish-core')
const {
	v4: uuidv4
} = require('uuid')
const assert = require('@balena/jellyfish-assert')
const metrics = require('@balena/jellyfish-metrics')
const utils = require('./utils')
const traverse = require('traverse')
const textSearch = require('./jsonschema2sql/text-search')
const SqlPath = require('./jsonschema2sql/sql-path')

const CARDS_TABLE = 'cards'
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
	'linked_at'
]

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
	'data'
].join(', ')

// Functions cannot be created concurrently
const CREATE_IMMUTABLE_ARRAY_TO_STRING_FUNCTION_LOCK = 3043989439426746
const CREATE_MERGE_JSONB_VIEWS_FUNCTION_LOCK = 3043989439426747

// Just a random fixed number used as the advisory lock ID for SQL
// initialization scripts that modify the `cards` table
exports.INIT_LOCK = 1142043989439426
exports.TABLE = CARDS_TABLE
exports.TRIGGER_COLUMNS = CARDS_TRIGGER_COLUMNS

exports.setup = async (context, connection, database, options = {}) => {
	const table = options.table || exports.TABLE

	const tables = _.map(await connection.any(`
		SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`),
	'table_name')
	if (!tables.includes(table)) {
		await connection.any(`
			BEGIN;

			SELECT pg_advisory_xact_lock(${exports.INIT_LOCK});

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
					CHECK (version_major >= 0 AND version_minor >= 0 AND version_patch >= 0));

			-- Disable compression on the jsonb columns so we can access its
			-- properties faster.
			-- See http://erthalion.info/2017/12/21/advanced-json-benchmarks/
			ALTER TABLE ${table}
			ALTER COLUMN data SET STORAGE EXTERNAL,
			ALTER COLUMN links SET STORAGE EXTERNAL,
			ALTER COLUMN linked_at SET STORAGE EXTERNAL;

			COMMIT;
		`)
	}

	// TODO: Remove this block once the production database reflects these changes.
	await connection.any(`
		BEGIN;
		SELECT pg_advisory_xact_lock(${exports.INIT_LOCK});
		ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS loop TEXT;
		COMMIT;
	`)

	/*
	 * This query will give us a list of all the indexes
	 * on a particular table.
	 */
	const indexes = _.map(await connection.any(`SELECT * FROM pg_indexes WHERE tablename = '${table}'`), 'indexname')

	if (options.noIndexes) {
		return
	}

	/*
	 * Increase work memory for better performance
	 * TODO: Set this value in k8s configuration instead of here
	 */
	await connection.any(`
		SET work_mem TO '256 MB';
	`)

	await Promise.all([
		Bluebird.map(
			[
				{
					column: 'slug'
				},
				{
					column: 'loop'
				},
				{
					column: 'tags',
					indexType: 'GIN'
				},
				{
					column: 'type'
				},
				{
					name: 'data_mirrors',
					column: '(data->\'mirrors\')',
					indexType: 'GIN',
					options: 'jsonb_path_ops'
				},
				{
					column: 'created_at',
					options: 'DESC'
				},
				{
					column: 'updated_at'
				}
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
				const fullyQualifiedIndexName = `${secondaryIndex.name || secondaryIndex.column}_${table}_idx`

				/*
				 * Lets not create the index if it already exists.
				 */
				if (indexes.includes(fullyQualifiedIndexName)) {
					return
				}

				await utils.createIndex(context, connection, table, fullyQualifiedIndexName,
					`USING ${secondaryIndex.indexType || 'BTREE'} (${secondaryIndex.column} ${secondaryIndex.options || ''})`)
			},
			{
				concurrency: 1
			}
		),

		/*
		 * Create function that allows us to create tsvector indexes from text[] fields.
		 */
		connection.any(`
			BEGIN;

			SELECT pg_advisory_xact_lock(${CREATE_IMMUTABLE_ARRAY_TO_STRING_FUNCTION_LOCK});

			CREATE OR REPLACE FUNCTION immutable_array_to_string(arr text[], sep text) RETURNS text AS $$
				SELECT array_to_string(arr, sep);
			$$ LANGUAGE SQL IMMUTABLE;

			COMMIT;
		`),

		// Recursive function to merge JSONB objects. This function assumes both
		// objects are just views into the same underlying object
		connection.any(`
			BEGIN;

			SELECT pg_advisory_xact_lock(${CREATE_MERGE_JSONB_VIEWS_FUNCTION_LOCK});

			CREATE OR REPLACE FUNCTION merge_jsonb_views(x jsonb, y jsonb) RETURNS jsonb AS $$
				SELECT coalesce(merged.payload, '{}'::jsonb)
				FROM (
					SELECT jsonb_object_agg(
						coalesce(x_key, y_key),
						CASE
							WHEN jsonb_typeof(x_value) = 'object' OR jsonb_typeof(x_value) = 'object' THEN
								merge_jsonb_views(x_value, y_value)
							ELSE coalesce(x_value, y_value)
						END
					) AS payload
					FROM jsonb_each(x) AS f1(x_key, x_value)
					FULL OUTER JOIN jsonb_each(y) AS f2(y_key, y_value)
					ON x_key = y_key
				) AS merged
			$$ LANGUAGE SQL IMMUTABLE PARALLEL SAFE;

			COMMIT;
		`)
	])
}

exports.getById = async (context, connection, id, options = {}) => {
	const table = options.table || exports.TABLE

	logger.debug(context, 'Getting element by id', {
		id,
		table
	})

	const results = await connection.any({
		name: `cards-getbyid-${table}`,
		text: `SELECT ${CARDS_SELECT} FROM ${table} WHERE id = $1 LIMIT 1;`,
		values: [ id ]
	})

	if (results[0]) {
		metrics.markCardReadFromDatabase(results[0])
	}

	return results[0] || null
}

exports.getBySlug = async (context, connection, slug, options = {}) => {
	const table = options.table || exports.TABLE

	logger.debug(context, 'Getting element by slug', {
		slug,
		table
	})

	const {
		base, major, minor, patch, prerelease, build, latest
	} = utils.parseVersionedSlug(slug)

	let results = []
	if (latest) {
		results = await connection.any({
			name: `cards-getbyslug-latest-${table}`,
			text: `SELECT ${CARDS_SELECT} FROM ${table}
				WHERE slug = $1 AND version_prerelease = ''
				ORDER BY version_major DESC,
								 version_minor DESC,
								 version_patch DESC,
								 version_build DESC;
				LIMIT 1;`,
			values: [ base ]
		})
	} else {
		results = await connection.any({
			name: `cards-getbyslug-version-${table}`,
			text: `SELECT ${CARDS_SELECT} FROM ${table}
				WHERE slug = $1 AND
				      version_major = $2 AND
				      version_minor = $3 AND
				      version_patch = $4 AND
				      version_prerelease = $5 AND
				      version_build = $6
				LIMIT 1;`,
			values: [ base, major, minor, patch, prerelease, build ]
		})
	}
	_.forEach(results, utils.convertDatesToISOString)
	_.forEach(results, (result) => {
		metrics.markCardReadFromDatabase(result)
	})

	return results[0] || null
}

exports.getManyById = async (context, connection, ids, options = {}) => {
	const table = options.table || exports.TABLE

	logger.debug(context, 'Batch get by id', {
		count: ids.length,
		table
	})

	const results = await connection.any({
		name: 'cards-getmanybyid',
		text: `SELECT ${CARDS_SELECT} FROM ${table} WHERE id = ANY ($1)`,
		values: [ ids ]
	})

	_.forEach(results, utils.convertDatesToISOString)
	_.forEach(results, (result) => {
		metrics.markCardReadFromDatabase(result)
	})

	return results
}

exports.upsert = async (context, errors, connection, object, options) => {
	const table = options.table || exports.TABLE

	assert.INTERNAL(context, object.slug,
		errors.JellyfishDatabaseError, 'Missing primary key')
	assert.INTERNAL(context, object.type,
		errors.JellyfishDatabaseError, 'Missing type')

	const insertedObject = Object.assign({}, object)
	insertedObject.links = {}

	const elementId = options.id || insertedObject.id || uuidv4()

	if (options.replace) {
		insertedObject.updated_at = new Date().toISOString()
		logger.debug(context, 'Upserting element', {
			table,
			slug: insertedObject.slug
		})
	} else {
		insertedObject.created_at = new Date().toISOString()
		logger.debug(context, 'Inserting element', {
			table,
			slug: insertedObject.slug
		})
	}
	const version = utils.parseVersion(insertedObject.version)

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
		typeof insertedObject.name === 'string'
			? insertedObject.name
			: null,
		insertedObject.tags,
		insertedObject.markers,
		insertedObject.links,
		insertedObject.requires,
		insertedObject.capabilities,
		insertedObject.data,
		{},
		new Date(insertedObject.created_at),
		insertedObject.updated_at ? new Date(insertedObject.updated_at) : null,
		insertedObject.loop
	]

	let results = null

	// Its very important, for concurrency issues, that inserts/upserts
	// remain atomic, in that there is only one atomic request sent to
	// the database. We were previously violating this principle by
	// querying the database before proceeding with the insertion.
	try {
		if (options.replace) {
			const sql = `
				INSERT INTO ${table}
					(id, slug, type, active,
					version_major, version_minor, version_patch,
					version_prerelease, version_build,
					name, tags, markers, links, requires,
					capabilities, data, linked_at, created_at, updated_at,
					loop)
				VALUES
					($1, $2, $3, $4,
					$5, $6, $7,
					$8, $9,
					$10, $11, $12, $13, $14,
					$15, $16, $17, $18, NULL,
					$20)
				ON CONFLICT (slug, version_major, version_minor, version_patch, version_prerelease, version_build) DO UPDATE SET
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
				RETURNING ${CARDS_SELECT}`

			results = await connection.any({
				name: `cards-upsert-replace-${table}`,
				text: sql,
				values: payload
			})
		} else {
			const sql = `
				INSERT INTO ${table}
					(id, slug, type, active,
					version_major, version_minor, version_patch,
					version_prerelease, version_build,
					name, tags, markers, links, requires,
					capabilities, data, linked_at, created_at, updated_at,
					loop)
				VALUES
					($1, $2, $3, $4, $5, $6, $7, $8,
					$9, $10, $11, $12, $13, $14,
					$15, $16, $17, $18, $19,
					$20)
				RETURNING ${CARDS_SELECT}`
			results = await connection.any({
				name: `cards-upsert-insert-${table}`,
				text: sql,
				values: payload
			})
		}
	} catch (error) {
		if (/^duplicate key value/.test(error.message)) {
			console.log(error.message)
			if (/pkey/.test(error.message)) {
				const upsertError = new errors.JellyfishElementAlreadyExists(
					`There is already an element with id ${object.id}`)
				upsertError.id = object.id
				throw upsertError
			} else {
				const upsertError = new errors.JellyfishElementAlreadyExists(
					`There is already an element with slug ${object.slug}@${object.version}`)
				upsertError.slug = object.slug
				throw upsertError
			}
		}

		if (/^value too long/.test(error.message)) {
			throw new errors.JellyfishInvalidSlug(
				`The primary key is too long: ${object.slug}`)
		}

		if (/canceling statement due to statement timeout/.test(error.message)) {
			const verb = options.replace ? 'upserting' : 'inserting'
			throw new errors.JellyfishDatabaseTimeoutError(
				`Timeout when ${verb} ${object.slug}`)
		}

		throw new errors.JellyfishDatabaseError(error.message)
	}

	insertedObject.name = typeof insertedObject.name === 'string'
		? insertedObject.name
		: null
	insertedObject.id = results[0].id
	insertedObject.created_at = results[0].created_at
	insertedObject.updated_at = results[0].updated_at
	insertedObject.linked_at = results[0].linked_at
	insertedObject.version = results[0].version

	utils.convertDatesToISOString(insertedObject)

	options.replace ? metrics.markCardUpsert(insertedObject) : metrics.markCardInsert(insertedObject)

	return insertedObject
}

exports.materializeLink = async (context, errors, connection, card, options = {}) => {
	const table = options.table || exports.TABLE

	try {
		const sql = `
			UPDATE ${table}
				SET linked_at = $1::jsonb
			WHERE id = $2;`
		await connection.any({
			name: `cards-materializelink-${table}`,
			text: sql,
			values: [ card.linked_at, card.id ]
		})
	} catch (error) {
		if (/^duplicate key value/.test(error.message)) {
			throw new errors.JellyfishElementAlreadyExists(
				`There is already an element with the slug ${card.slug}`)
		}

		if (/^value too long/.test(error.message)) {
			throw new errors.JellyfishInvalidSlug(
				`The primary key is too long: ${card.slug}`)
		}

		throw new errors.JellyfishDatabaseError(error.message)
	}
}

/**
 * @param {Object} context - Session context
 * @param {Object} connection - Database connection
 * @param {String[]} fields - Fields to use as an index
 * @param {String} type - The card type to constrain the index by
 *
 * @example
 * const fields = [ 'name',	'data.from.id',	'data.to.id' ]
 * await cards.createTypeIndex(context, connection, 'cards', fields, 'link')
 */
exports.createTypeIndex = async (context, connection, fields, type) => {
	/*
	 * This query will give us a list of all the indexes
	 * on a particular table.
	 */
	const indexes = _.map(await connection.any(`SELECT * FROM pg_indexes WHERE tablename = '${CARDS_TABLE}'`), 'indexname')

	/*
	 * This is the actual name of the index that we will create
	 * in Postgres.
	 *
	 * Keep in mind that if you change this, then this code will
	 * not be able to cleanup older indexes with the older
	 * name convention.
	 */
	const fullyQualifiedIndexName = `${type}__${fields.join('__').replace(/\./g, '_')}__idx`

	/*
	 * Lets not create the index if it already exists.
	 */
	if (indexes.includes(fullyQualifiedIndexName)) {
		return
	}

	const columns = []
	for (const path of fields) {
		// Make the assumption that if the index is dot seperated, it is a json path
		const keys = path.split('.').map((value, arrayIndex) => {
			// Escape input before sending it to the DB
			return arrayIndex === 0 ? pgFormat.ident(value) : pgFormat.literal(value)
		})

		if (keys.length === 1) {
			columns.push(keys[0])
		} else {
			const final = keys.pop()
			columns.push(`(${keys.join('->')}->>${final})`)
		}
	}

	const versionedType = type.includes('@') ? type : `${type}@1.0.0`

	await utils.createIndex(context, connection, CARDS_TABLE, fullyQualifiedIndexName,
		`(${columns.join(',')}) WHERE type=${pgFormat.literal(versionedType)}`)
}

/**
 * @param {Object} context - session context
 * @param {Object} connection - database connection
 * @param {String} type - card type name
 * @param {Array} fields - fields to build indexes for
 *
 * @example
 * const type = 'message'
 * const fields = [
 *   {
 *     path: [ 'data', 'payload', 'message' ],
 *     type: 'string'
 *   }
 * ]
 * await cards.createFullTextSearchIndex(context, connection, type, fields)
 */
exports.createFullTextSearchIndex = async (context, connection, type, fields) => {
	// Leave early if fields is empty
	if (_.isEmpty(fields)) {
		return
	}

	// Get full list of indexes.
	const indexes = _.map(await connection.any(`SELECT * FROM pg_indexes WHERE tablename = '${CARDS_TABLE}'`), 'indexname')

	// Create all necessary search indexes for the given type
	const typeBase = type.split('@')[0]
	const versionedType = `${typeBase}@1.0.0`
	for (const field of fields) {
		const path = SqlPath.fromArray(_.clone(field.path))
		const isJson = path.isProcessingJsonProperty
		const name = `${typeBase}__${field.path.join('_')}__search_idx`
		if (!indexes.includes(name)) {
			await utils.createIndex(context, connection, CARDS_TABLE, name,
				`USING GIN(${textSearch.toTSVector(path.toSql(CARDS_TABLE), isJson, field.isArray)})
					WHERE type=${pgFormat.literal(versionedType)}`)
		}
	}
}

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
exports.parseFullTextSearchFields = (context, schema, errors) => {
	const fields = []
	const combinators = [ 'anyOf', 'allOf', 'oneOf' ]
	traverse(schema).forEach(function (node) {
		if (this.key === 'fullTextSearch' && this.node === true && !_.isNil(this.parent.node.type)) {
			// Throw an error if item doesn't have "string" as a possible type.
			const hasStringType = Boolean(_.includes(this.parent.node.type, 'string') ||
				(_.has(this.parent.node, [ 'items', 'type' ]) && this.parent.node.items.type.includes('string')))
			assert.INTERNAL(context, hasStringType,
				errors.JellyfishInvalidSchema, 'Full-text search fields must contain "string" as a possible type')

			if (_.intersection(this.path, combinators).length > 0) {
				// Handle combinators by creating an index for its parent node.
				for (let idx = 0; idx < this.path.length; idx++) {
					if (/^anyOf|allOf|oneOf$/.test(this.path[idx])) {
						const path = exports.fromTypePath(_.slice(this.path, 0, idx))
						if (!_.find(fields, (field) => {
							return _.isEqual(field.path, path)
						})) {
							fields.push({
								path,
								isArray: false
							})
						}
					}
				}
			} else {
				fields.push({
					path: exports.fromTypePath(_.dropRight(this.path)),
					isArray: Boolean(this.parent.node.type === 'array')
				})
			}
		}
	})
	return fields
}

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
exports.fromTypePath = (from) => {
	const path = from.join('.').replace(/^data\.schema\.properties\./, '').split('.')
	const target = path.pop()
	_.remove(path, (element) => {
		return element === 'properties'
	})
	path.push(target)
	return path
}
