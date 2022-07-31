/*
 * This file was automatically generated by 'npm run types'.
 *
 * DO NOT MODIFY IT BY HAND!
 */

// tslint:disable: array-type

import type { Contract, ContractDefinition } from '../';

export interface TypeData {
	schema: {
		[k: string]: unknown;
	};
	uiSchema?: {
		[k: string]: unknown;
	};
	slices?: string[];
	/**
	 * Fields, or groups of fields that should be indexed for improved performance
	 */
	indexed_fields?: string[][];
	[k: string]: unknown;
}

export interface TypeContractDefinition extends ContractDefinition<TypeData> {}

export interface TypeContract extends Contract<TypeData> {}