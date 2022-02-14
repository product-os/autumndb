import type {
	ContractData,
	ContractDefinition,
} from '@balena/jellyfish-types/build/core';
import deref = require('json-schema-deref-sync');
import * as _ from 'lodash';
import { sensibleDefaults } from './with-sensible-defaults';
import { baseUiSchema } from './with-ui-schema';

export { asPipelineItem } from './as-pipeline-item';
export { uiSchemaDef } from './ui-schema-defs';
export { withEvents } from './with-events';

const mergeWithUniqConcatArrays = (objValue: any, srcValue: any) => {
	if (_.isArray(objValue)) {
		return _.uniq(objValue.concat(srcValue));
	}

	return undefined;
};

export const mixin = (
	...mixins: ContractDefinition[]
): (<TData = ContractData>(
	base: ContractDefinition<TData>,
) => ContractDefinition<TData>) => {
	return (base) => {
		return _.mergeWith({}, base, ...mixins, mergeWithUniqConcatArrays);
	};
};

export const initialize = <TData = ContractData>(
	contract: ContractDefinition<TData>,
): ContractDefinition<TData> => {
	const snippets = [{}, sensibleDefaults, contract];

	// All type contracts should have a UI schema
	if (contract.type.split('@')[0] === 'type') {
		snippets.push(baseUiSchema);
	}
	const intializedContract = _.mergeWith(
		...snippets,
		mergeWithUniqConcatArrays,
	);

	// TODO: This isn't quite right, because the I/O here is contracts not schemas, it works
	// "by accident" because deref will iterate over any object not just schemas.
	// Ideally we need to stop using deref completely, in favor of mixin functions, as the
	// current implementation leads to abominated deep linking.
	// See https://github.com/product-os/jellyfish-plugin-default/blob/2e15d57ec8b362d899b1957b4ad6fcab5e618b11/lib/cards/mixins/index.js#L12
	// Dereference all $ref values
	return deref(intializedContract, {
		failOnMissing: true,
		mergeAdditionalProperties: true,
	});
};
