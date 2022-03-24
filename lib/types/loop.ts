import type { Contract, ContractDefinition } from './contract';

export interface LoopData {
	[k: string]: unknown;
}

export interface LoopContractDefinition extends ContractDefinition<LoopData> {}

export interface LoopContract extends Contract<LoopData> {}
