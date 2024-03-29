/*
 * This file was automatically generated by 'npm run types'.
 *
 * DO NOT MODIFY IT BY HAND!
 */

// tslint:disable: array-type

import type { Contract, ContractDefinition } from '../';

export interface ViewData {
	actor?: string;
	namespace?: string;
	schema?: {
		[k: string]: unknown;
	};
	anyOf?: Array<{
		name: string;
		schema: {
			type: 'object';
			[k: string]: unknown;
		};
	}>;
	allOf?: Array<{
		name: string;
		schema: {
			type: 'object';
			[k: string]: unknown;
		};
	}>;
	/**
	 * A list of data types this view can return
	 */
	types?: string[];
	[k: string]: unknown;
}

export type ViewContractDefinition = ContractDefinition<ViewData>;

export type ViewContract = Contract<ViewData>;
