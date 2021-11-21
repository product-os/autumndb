import * as _ from 'lodash';
import deref = require('json-schema-deref-sync');
import { sensibleDefaults } from './with-sensible-defaults';
import { baseUiSchema } from './with-ui-schema';
import {
	ContractData,
	ContractDefinition,
} from '@balena/jellyfish-types/build/core';

const mergeWithUniqConcatArrays = (objValue: any, srcValue: any) => {
	if (_.isArray(objValue)) {
		return _.uniq(objValue.concat(srcValue));
	}

	return undefined;
};

export const mixin = (...mixins: ContractDefinition[]) => {
	return <TData = ContractData>(
		base: ContractDefinition<TData>,
	): ContractDefinition<TData> => {
		return _.mergeWith({}, base, ...mixins, mergeWithUniqConcatArrays);
	};
};

export const initialize = <TData = ContractData>(
	card: ContractDefinition<TData>,
): ContractDefinition<TData> => {
	const snippets = [{}, sensibleDefaults, card];

	// All type cards should have a UI schema
	if (card.type.split('@')[0] === 'type') {
		snippets.push(baseUiSchema);
	}
	const intializedCard = (_.mergeWith as any)(
		...snippets,
		mergeWithUniqConcatArrays,
	);

	// TODO: This isn't quite right, because the I/O here is contracts not schemas, it works
	// "by accident" because deref will iterate over any object not just schemas.
	// Ideally we need to stop using deref completely, in favor of mixin functions, as the
	// current implementation leads to abominated deep linking.
	// See https://github.com/product-os/jellyfish-plugin-default/blob/2e15d57ec8b362d899b1957b4ad6fcab5e618b11/lib/cards/mixins/index.js#L12
	// Dereference all $ref values
	return deref(intializedCard, {
		failOnMissing: true,
		mergeAdditionalProperties: true,
	}) as ContractDefinition<TData>;
};
