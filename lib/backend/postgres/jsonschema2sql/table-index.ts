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
 * @param schema - type contract schema
 * @param fieldPath - path to field in schema
 * @returns boolean flag denoting if field is of type array or not
 *
 * @example
 * isArrayField({...}, 'data.payload.message');
 */
export function isArrayField(
	schema: core.ContractDefinition<any>,
	fieldPath: string,
): boolean {
	const fullPath = ['data', 'schema', 'properties'].concat(
		fieldPath.replace(/\./g, '.properties.').split('.'),
		['type'],
	);
	const fieldType = _.get(schema, fullPath);
	if (_.isString(fieldType) && fieldType === 'array') {
		return true;
	}

	return false;
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
		if (fields.length === 1 && isArrayField(schema, path)) {
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
