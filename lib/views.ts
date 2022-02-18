import type { JsonSchema } from '@balena/jellyfish-types';
import type { ViewContract } from '@balena/jellyfish-types/build/core';
import * as _ from 'lodash';

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

	const conjunctions = _.map(_.get(contract, ['data', 'allOf']), 'schema');
	const disjunctions = _.map(_.get(contract, ['data', 'anyOf']), 'schema');

	if (_.isEmpty(conjunctions) && _.isEmpty(disjunctions)) {
		return null;
	}

	if (!_.isEmpty(disjunctions)) {
		conjunctions.push({
			anyOf: disjunctions,
		});
	}

	return { allOf: conjunctions };
};
