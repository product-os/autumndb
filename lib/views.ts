import * as _ from 'lodash';
import jsonSchema from './json-schema';
import type { JsonSchema, ViewContract } from './types';

/**
 * @summary Get the schema of a view contract
 * @function
 * @public
 *
 * @param {Object} contract - view contract
 * @returns {(Object|Null)} schema
 */
export const getViewContractSchema = (
	contract: Partial<ViewContract> & Pick<ViewContract, 'data'>,
): JsonSchema | null => {
	if (contract.data && contract.data.schema) {
		return contract.data.schema;
	}

	const conjunctions: JsonSchema[] = _.map(
		_.get(contract, ['data', 'allOf']),
		'schema',
	);
	const disjunctions: JsonSchema[] = _.map(
		_.get(contract, ['data', 'anyOf']),
		'schema',
	);

	if (_.isEmpty(conjunctions) && _.isEmpty(disjunctions)) {
		return null;
	}

	if (!_.isEmpty(disjunctions)) {
		conjunctions.push({
			anyOf: disjunctions,
		});
	}

	return jsonSchema.merge(conjunctions as any) as JsonSchema;
};
