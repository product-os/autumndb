import deref = require('json-schema-deref-sync');
import _ = require('lodash');
import path = require('path');
import { ContractData, ContractDefinition } from './contract';
import { loadSchemaDefinitionFromFile } from './utils';

export const sensibleDefaults: ContractDefinition =
	loadSchemaDefinitionFromFile(
		path.join(__dirname, '../schemas/mixins/sensible-defaults.json'),
	);

export const baseUi: ContractDefinition = loadSchemaDefinitionFromFile(
	path.join(__dirname, '../schemas/mixins/ui-schema.json'),
);

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

// Although we wanted to replace this with initializeContractWithMixins, the
// initialize function had to be kept because it is currently in use by jellyfish-plugin-base.
export const initialize = <TData = ContractData>(
	contract: ContractDefinition<TData>,
): ContractDefinition<TData> => {
	const snippets = [{}, sensibleDefaults, contract];

	// All type contracts should have a UI schema
	if (contract.type.split('@')[0] === 'type') {
		snippets.push(baseUi);
	}
	const intializedContract = (_.mergeWith as any)(
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
	}) as ContractDefinition<TData>;
};

interface Mixin<TData = ContractData> {
	schema: ContractDefinition<TData>;
	test: (contract: ContractDefinition<TData>) => boolean;
}

export const initializeContractWithMixins = <TData = ContractData>(
	contract: ContractDefinition<TData>,
	mixinsToApply: Array<Mixin<TData>>,
): ContractDefinition<TData> => {
	const schemasToMerge = [{}, contract];

	mixinsToApply.forEach((el) => {
		if (el.test(contract)) {
			schemasToMerge.push(el.schema);
		}
	});

	const initializedContract = (_.mergeWith as any)(
		...schemasToMerge,
		(objValue: any, srcValue: any) => {
			if (_.isArray(objValue)) {
				return _.uniq(objValue.concat(srcValue));
			}
			return undefined;
		},
	);

	// TODO: This isn't quite right, because the I/O here is contracts not schemas, it works
	// "by accident" because deref will iterate over any object not just schemas.
	// Ideally we need to stop using deref completely, in favor of mixin functions, as the
	// current implementation leads to abominated deep linking.
	// See https://github.com/product-os/jellyfish-plugin-default/blob/2e15d57ec8b362d899b1957b4ad6fcab5e618b11/lib/cards/mixins/index.js#L12
	// Dereference all $ref values
	return deref(initializedContract, {
		failOnMissing: true,
		mergeAdditionalProperties: true,
	}) as ContractDefinition<TData>;
};
