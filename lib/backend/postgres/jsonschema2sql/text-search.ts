/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import * as pgFormat from 'pg-format';

/**
 * @summary Prepare a Postgres to_tsvector function call for full-text search
 * @function
 *
 * @param {String} path - full path to field
 * @param {Boolean} isJson - denotes if json field
 * @param {Boolean} isArray - denotes if array
 * @returns {String} to_tsvector function call
 *
 * @example
 * const result = exports.toTSVector('cards.tags', false, true)
 */
export const toTSVector = (
	path: string,
	isJson: boolean,
	isArray: boolean,
): string => {
	if (isJson) {
		return `jsonb_to_tsvector('english', ${path}, '["string"]')`;
	}

	if (isArray) {
		return `to_tsvector('english', immutable_array_to_string(${path}, ' '))`;
	}
	return `to_tsvector('english', ${path})`;
};

/**
 * @summary Prepare a Postgres tsquery function call for full-text search
 * @function
 *
 * @param {String} term - term to search for
 * @returns {String} tsquery function call
 *
 * @example
 * const term = 'test'
 * const result = exports.toTSQuery(term)
 */
export const toTSQuery = (term: string): string => {
	return `plainto_tsquery('english', ${pgFormat.literal(term)})`;
};
