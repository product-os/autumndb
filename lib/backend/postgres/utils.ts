/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import * as _ from 'lodash';
import { getLogger } from '@balena/jellyfish-logger';
import { Context } from '@balena/jellyfish-types/build/core';
import type { Queryable } from './types';
const logger = getLogger('jellyfish-core');

// FIXME
// this function is intended to make the transition between dates as
// strings to actual dates smoother: it ensures that returned dates
// are still strings in ISO format
// beware that when reading a jsonb column with dates stored as dates
// the output json will end with '+00' rathen than 'Z'
// we should not to this conversion and instead rely on Date objects
export const convertDatesToISOString = (row: any) => {
	if (!row) {
		return row;
	}
	if (row.created_at) {
		row.created_at = new Date(row.created_at).toISOString();
	}
	if (row.updated_at) {
		row.updated_at = new Date(row.updated_at).toISOString();
	}

	return row;
};

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
export const createIndex = async (
	context: Context,
	connection: Queryable,
	tableName: string,
	indexName: string,
	predicate: string,
	unique: boolean = false,
) => {
	logger.debug(context, 'Attempting to create table index', {
		table: tableName,
		index: indexName,
	});

	const uniqueFlag = unique ? 'UNIQUE' : '';
	const statement = `CREATE ${uniqueFlag} INDEX IF NOT EXISTS "${indexName}" ON ${tableName} ${predicate}`;
	await connection.task(async (task) => {
		await task.any('SET statement_timeout=0');
		await task.any(statement);
	});
};

/**
 * ParseVersion behaves like parseVersionedSlug but only
 * taking the version part into account
 *
 * @param {String} version - the version string
 * @returns {*} the different parts of the version
 */
export const parseVersion = (version: string) => {
	if (!version) {
		// We treat 'my-slug@latest' and 'my-slug' identically
		return {
			major: 0,
			minor: 0,
			patch: 0,
			prerelease: '',
			build: '',
			latest: true,
		};
	}
	// eslint-disable-next-line max-len
	const versionPattern =
		/(?<major>\d+)(\.(?<minor>\d+))?(\.(?<patch>\d+))?(-(?<prerelease>[0-9A-Za-z-]+))?(\+(?<build>[0-9A-Za-z-]+))?|(?<latest>latest)/;

	const match = versionPattern.exec(version);

	if (!match || !match.groups) {
		throw new Error(`slug version suffix is invalid: ${version}`);
	}

	const { major, minor, patch, prerelease, build, latest } = match.groups;

	return {
		major: _.toInteger(major) || 0,
		minor: _.toInteger(minor) || 0,
		patch: _.toInteger(patch) || 0,

		// Why empty string and not null?
		// Because the pg unique constraint ignores NULL values.
		prerelease: prerelease || '',
		build: build || '',
		latest: latest === 'latest',
	};
};
