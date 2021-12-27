import type { JsonSchema } from '@balena/jellyfish-types';
import type { ViewContract } from '@balena/jellyfish-types/build/core';
import * as _ from 'lodash';
import jsonSchema from './json-schema';

/**
 * @summary Get the schema of a view card
 * @function
 * @public
 *
 * @param {Object} card - view card
 * @returns {(Object|Null)} schema
 */
export const getSchema = (
	card: Partial<ViewContract> & Pick<ViewContract, 'data'>,
): JsonSchema | null => {
	if (card.data && card.data.schema) {
		return card.data.schema;
	}

	const conjunctions = _.map(_.get(card, ['data', 'allOf']), 'schema');
	const disjunctions = _.map(_.get(card, ['data', 'anyOf']), 'schema');

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
