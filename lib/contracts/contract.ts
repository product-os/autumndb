import deref = require('json-schema-deref-sync');
import _ = require('lodash');
import path = require('path');
import * as mixins from './mixins';
import { loadSchemaDefinitionsFromDir } from './utils';

/**
 * The data interface used when we don't know/care what the contract type is.
 */
export interface ContractData {
	[k: string]: unknown;
}

/**
 * The base interface that must be implemented by every contract.
 */
export interface Contract<
	TData = ContractData,
	TLinks = { [key: string]: Contract[] },
> {
	/**
	 * A UUID that uniquely identifies this contract.
	 */
	id: string;
	/**
	 * A semantic version of the contract.
	 */
	version: string;
	/**
	 * A string that uniquely identifies this contract.
	 */
	slug: string;
	/**
	 * An optional user-friendly name for this contract.
	 */
	name?: string | null;
	/**
	 * The slug of the loop that the contract belongs to.
	 */
	loop?: string | null;
	/**
	 * The type of this contract. The type value should include the version.
	 *
	 * For example: 'my-type@1.0.0'
	 */
	type: string;
	/**
	 * The tags associated with this contract.
	 */
	tags: string[];
	/**
	 * Markers associated with this contract.
	 */
	markers: string[];
	/**
	 * Linked contracts, keyed by the 'link verb'.
	 */
	links?: TLinks;
	/**
	 * The date/time the contract was created, expressed as an ISO 8601 string.
	 */
	created_at: string;
	/**
	 * The date/time the contract was most recently updated, expressed as an ISO 8601 string.
	 */
	updated_at?: string | null;
	/**
	 * Specifies whether the contract is currently active.
	 */
	active: boolean;
	/**
	 * The data associated with this contract.
	 */
	data: TData;
	/**
	 * A list of requirements/dependencies for this contract.
	 */
	requires: Array<{
		[k: string]: unknown;
	}>;
	/**
	 * A list of capabilities for this contract.
	 */
	capabilities: Array<{
		[k: string]: unknown;
	}>;
	/**
	 * Link timestamps, keyed by 'link verb'.
	 */
	linked_at?: {
		[k: string]: unknown;
	};
}

/**
 * A summary of a contract, containing just the key fields.
 */
export interface ContractSummary<TData = ContractData>
	extends Pick<Contract<TData>, 'id' | 'slug' | 'version' | 'type'> {}

interface OptionalContract<TData = ContractData>
	extends Partial<Contract<TData>> {}

/**
 * Contracts are defined with certain required properties and various other optional properties.
 */
export interface ContractDefinition<TData = ContractData>
	extends Omit<
			OptionalContract<TData>,
			| 'slug'
			| 'type'
			| 'links'
			| 'created_at'
			| 'updated_at'
			| 'linked_at'
			| 'data'
		>,
		Pick<Contract<TData>, 'slug' | 'type' | 'data'> {}

/**
 * A map of contracts, keyed by slug
 */
export interface ContractMap {
	[slug: string]: ContractDefinition;
}

interface Mixin<TData = ContractData> {
	schema: ContractDefinition<TData>;
	test: (contract: ContractDefinition<TData>) => boolean;
}

export const initialize = <TData = ContractData>(
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

const contracts: ContractDefinition[] = loadSchemaDefinitionsFromDir(
	path.join(__dirname, '../schemas'),
	{
		exclude: ['mixins'],
	},
);

export const CONTRACTS: ContractMap = contracts.reduce<{
	[slug: string]: ContractDefinition;
}>((acc, contract) => {
	const initializedContract = initialize(contract, [
		{
			schema: mixins.baseUi,
			test: (c) => c.type.split('@')[0] === 'type',
		},
		{ schema: mixins.sensibleDefaults, test: () => true },
	]);
	acc[initializedContract.slug] = initializedContract;
	return acc;
}, {});

/** @deprecated */
export const CARDS = CONTRACTS;
