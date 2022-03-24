import type { Contract, ContractDefinition } from './contract';
import type { JsonSchema } from './json-schema';

export interface ViewData {
	actor?: string;
	allOf?: Array<{
		name: string;
		schema: JsonSchema;
	}>;
	anyOf?: Array<{
		name: string;
		schema: JsonSchema;
	}>;
	oneOf?: Array<{
		name: string;
		schema: JsonSchema;
	}>;
	/**
	 * A list of data types this view can return
	 */
	types?: string[];
	schema?: JsonSchema;
	namespace?: string;
	[k: string]: unknown;
}

export interface ViewContractDefinition extends ContractDefinition<ViewData> {}

export interface ViewContract extends Contract<ViewData> {}
