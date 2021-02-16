/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const _ = require('lodash')
const Bluebird = require('bluebird')
const logger = require('@balena/jellyfish-logger').getLogger(__filename)

// List of Postgres error codes we can safely ignore during initial db setup.
// All error codes: https://www.postgresql.org/docs/12/errcodes-appendix.html
// 23505: unique violation error
// 42P07: duplicate table error
const INIT_IGNORE_CODES = [ '23505', '42P07' ]

// Postgres error codes
const DEADLOCK_ERROR_CODE = '40P01'

// FIXME
// this function is intended to make the transition between dates as
// strings to actual dates smoother: it ensures that returned dates
// are still strings in ISO format
// beware that when reading a jsonb column with dates stored as dates
// the output json will end with '+00' rathen than 'Z'
// we should not to this conversion and instead rely on Date objects
exports.convertDatesToISOString = (row) => {
	if (!row) {
		return row
	}
	if (row.created_at) {
		row.created_at = new Date(row.created_at).toISOString()
	}
	if (row.updated_at) {
		row.updated_at = new Date(row.updated_at).toISOString()
	}

	// FIXME remove references to new_* columns
	Reflect.deleteProperty(row, 'new_created_at')
	Reflect.deleteProperty(row, 'new_updated_at')

	return row
}

exports.removeLinkMetadataFields = (row) => {
	Reflect.deleteProperty(row, '$link direction$')
	Reflect.deleteProperty(row, '$link type$')
	Reflect.deleteProperty(row, '$parent id$')
}

exports.removeVersionFields = (row) => {
	if (row) {
		const version = [
			row.version_major,
			row.version_minor,
			row.version_patch
		].filter(_.isNumber).join('.') || row.version
		if (version) {
			row.version = version
		}

		Reflect.deleteProperty(row, 'version_major')
		Reflect.deleteProperty(row, 'version_minor')
		Reflect.deleteProperty(row, 'version_patch')
	}

	return row
}

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
 *   await this.connection.any(`CREATE DATABASE mydb`)
 * } catch (error) {
 *   if (!utils.isIgnorableInitError(error.code)) {
 *     throw error
 *   }
 * }
 */
exports.isIgnorableInitError = (code) => {
	return _.includes(INIT_IGNORE_CODES, code)
}

/**
 * Create an index concurrently.
 * Retry on deadlock, which commonly occurs when multiple services attempt to initialize the backend at the same time.
 * Postgres does not allow multiple "CREATE INDEX CONCURRENTLY" executions for the same table at the same time.
 *
 * @function
 *
 * @param {Object} context - execution context
 * @param {Object} connection - connection to database
 * @param {Object} tableName - table name
 * @param {String} indexName - index name
 * @param {String} predicate - index create statement predicate
 * @param {Boolean} unique - declare index as UNIQUE or not (optional)
 *
 * @example
 * await exports.createIndexConcurrently(context, connection, 'cards', 'example_idx', 'USING btree (updated_at)')
 */
exports.createIndexConcurrently = async (context, connection, tableName, indexName, predicate, unique = false) => {
	const uniqueFlag = (unique) ? 'UNIQUE' : ''
	const statement = `CREATE ${uniqueFlag} INDEX CONCURRENTLY IF NOT EXISTS "${indexName}" ON ${tableName} ${predicate}`
	try {
		await connection.task(async (task) => {
			await task.any('SET statement_timeout=0')
			await task.any(statement)
		})
	} catch (error) {
		if (error.code === DEADLOCK_ERROR_CODE) {
			logger.debug(context, 'Deadlock encountered on index creation', {
				table: tableName,
				index: indexName,
				statement
			})
			await Bluebird.delay(1000)
			await exports.createIndexConcurrently(context, connection, tableName, indexName, predicate)
		} else {
			throw error
		}
	}
}
