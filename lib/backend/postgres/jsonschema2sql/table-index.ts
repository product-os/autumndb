/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import { core } from '@balena/jellyfish-types';
import * as _ from 'lodash';
import * as pgFormat from 'pg-format';
import { SqlPath } from './sql-path';

/**
 * @param type - contract type
 * @param schema - type contract schema
 * @param fieldPath - path to field in schema
 * @returns string representation of field type
 *
 * @example
 * getFieldType('message', {...}, 'data.payload.message');
 */
export function getFieldType(
	contractType: string,
	schema: core.ContractDefinition<any>,
	fieldPath: string,
): string {
	const fullPath = ['data', 'schema', 'properties'].concat(
		fieldPath.replace(/\./g, '.properties.').split('.'),
		['type'],
	);
	const fieldType = _.get(schema, fullPath);

	// Error out if no type is found for provided path, invalid schema or indexed_fields.
	if (!_.isString(fieldType)) {
		throw new Error(
			`Could not find type for field ${fieldPath} on ${contractType}`,
		);
	}
	return fieldType;
}

/**
 *
 * @param fields - fields to index
 * @param schema - card schema
 * @returns generated predicate for CREATE INDEX statement
 */
export function generateTypeIndexPredicate(
	fields: string[],
	schema: core.ContractDefinition<any>,
): string {
	const type = schema.slug;
	const columns = [];
	let indexType = 'btree';
	let asText = true;

	for (const path of fields) {
		// Use gin for indexes on array fields
		const isArray = getFieldType(type, schema, path) === 'array';
		if (fields.length === 1 && isArray) {
			indexType = 'gin';
			asText = false;
		}

		// Generate and add field selector
		const sqlPath = SqlPath.fromArray(path.split('.'));
		let column = sqlPath.toSql('', { asText }).replace(/\./, '');
		if (sqlPath.isProcessingJsonProperty) {
			column = `(${column})`;
		}
		columns.push(column);
	}

	const versionedType = type.includes('@') ? type : `${type}@1.0.0`;
	return `USING ${indexType} (${columns.join(
		',',
	)}) WHERE type=${pgFormat.literal(versionedType)}`;
}
