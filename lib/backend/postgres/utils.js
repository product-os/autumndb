/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const _ = require('lodash')
const logger = require('@balena/jellyfish-logger').getLogger(__filename)

// List of Postgres error codes we can safely ignore during initial db setup.
// All error codes: https://www.postgresql.org/docs/12/errcodes-appendix.html
// 23505: unique violation error
// 42P07: duplicate table error
const INIT_IGNORE_CODES = [ '23505', '42P07' ]

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

	return row
}

exports.removeLinkMetadataFields = (row) => {
	Reflect.deleteProperty(row, '$link direction$')
	Reflect.deleteProperty(row, '$link type$')
	Reflect.deleteProperty(row, '$parent id$')
}

exports.removeVersionFields = (row) => {
	if (row) {
		Reflect.deleteProperty(row, 'version_major')
		Reflect.deleteProperty(row, 'version_minor')
		Reflect.deleteProperty(row, 'version_patch')
		Reflect.deleteProperty(row, 'version_prerelease')
		Reflect.deleteProperty(row, 'version_build')
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
 * Create an index.
 *
 * @function
 *
 * @param {Object} context - execution context
 * @param {Object} connection - connection to database
 * @param {String} tableName - table name
 * @param {String} indexName - index name
 * @param {String} predicate - index create statement predicate
 * @param {Boolean} unique - declare index as UNIQUE (optional)
 *
 * @example
 * await exports.createIndex(context, connection, 'cards', 'example_idx', 'USING btree (updated_at)')
 */
exports.createIndex = async (context, connection, tableName, indexName, predicate, unique = false) => {
	logger.debug(context, 'Attempting to create table index', {
		table: tableName,
		index: indexName
	})

	const uniqueFlag = (unique) ? 'UNIQUE' : ''
	const statement = `CREATE ${uniqueFlag} INDEX IF NOT EXISTS "${indexName}" ON ${tableName} ${predicate}`
	await connection.task(async (task) => {
		await task.any('SET statement_timeout=0')
		await task.any(statement)
	})
}

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
exports.parseVersionedSlug = (slug) => {
	const slugVersionPattern = /^(?<base>[a-z0-9-]+)(@(?<version>.*))?$/

	const match = slugVersionPattern.exec(slug)
	if (!match || !match.groups) {
		throw new Error(`slug format invalid: ${slug}`)
	}
	const {
		base, version
	} = match.groups
	const {
		major, minor, patch, prerelease, build, latest
	} = exports.parseVersion(version)

	return {
		base, major, minor, patch, prerelease, build, latest
	}
}

/**
 * ParseVersion behaves like parseVersionedSlug but only
 * taking the version part into account
 *
 * @param {String} version - the version string
 * @returns {*} the different parts of the version
 */
exports.parseVersion = (version) => {
	if (!version) {
		// We treat 'my-slug@latest' and 'my-slug' identically
		return {
			major: 0, minor: 0, patch: 0, prerelease: '', build: '', latest: true
		}
	}
	// eslint-disable-next-line max-len
	const versionPattern = /(?<major>\d+)(\.(?<minor>\d+))?(\.(?<patch>\d+))?(-(?<prerelease>[0-9A-Za-z-]+))?(\+(?<build>[0-9A-Za-z-]+))?|(?<latest>latest)/
	const match = versionPattern.exec(version)
	if (!match || !match.groups) {
		throw new Error(`slug version suffix is invalid: ${version}`)
	}
	const {
		major, minor, patch, prerelease, build, latest
	} = match.groups

	return {
		major: _.toInteger(major) || 0,
		minor: _.toInteger(minor) || 0,
		patch: _.toInteger(patch) || 0,

		// Why empty string and not null?
		// Because the pg unique constraint ignores NULL values.
		prerelease: prerelease || '',
		build: build || '',
		latest: latest === 'latest'
	}
}
