import type {
	Contract,
	ContractDefinition,
} from '@balena/jellyfish-types/build/core';

export type RelationshipData = RelationshipDataGeneric &
	RelationshipDataSpecific;

export interface RelationshipDataGeneric {
	[k: string]: unknown;
}

export interface RelationshipDataSpecific {
	inverseName: string | undefined;
	title: string;
	inverseTitle: string | undefined;
	from: {
		type: string;
	};
	to: {
		type: string;
	};
}

export interface RelationshipContractDefinition
	extends ContractDefinition<RelationshipData> {}

export interface RelationshipContract extends Contract<RelationshipData> {}
