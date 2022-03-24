import type { Contract, ContractDefinition } from './contract';
import type { JsonSchema } from './json-schema';

export interface TypeData {
	schema: JsonSchema;
	uiSchema?: unknown;
	[k: string]: unknown;
}

export interface TypeContract extends Contract<TypeData> {}

export interface TypeContractDefinition extends ContractDefinition<TypeData> {}
