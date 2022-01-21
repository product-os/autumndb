import * as _ from 'lodash';
import jsonSchema, { JsonSchema } from './json-schema';
import { ViewContract } from './contracts';

/**
 * @summary Get the schema of a view contract
 * @function
 * @public
 *
 * @param {Object} contract - view contract
 * @returns {(Object|Null)} schema
 */
export const getSchema = (
	contract: Partial<ViewContract> & Pick<ViewContract, 'data'>,
): JsonSchema | null => {
	if (contract.data && contract.data.schema) {
		return contract.data.schema;
	}

	const conjunctions = _.map(_.get(contract, ['data', 'allOf']), 'schema');
	const disjunctions = _.map(_.get(contract, ['data', 'anyOf']), 'schema');

	if (_.isEmpty(conjunctions) && _.isEmpty(disjunctions)) {
		return null;
	}

	// FIXME: get rid of the 'as any' below
	if (!_.isEmpty(disjunctions)) {
		conjunctions.push({
			anyOf: disjunctions,
		} as any);
	}

	return jsonSchema.merge(conjunctions as any) as JsonSchema;
};
