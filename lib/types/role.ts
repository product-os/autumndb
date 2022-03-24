import type { Contract, ContractDefinition } from './contract';

export interface RoleData {
	read: {
		[k: string]: unknown;
	};
	[k: string]: unknown;
}

export interface RoleContractDefinition extends ContractDefinition<RoleData> {}

export interface RoleContract extends Contract<RoleData> {}
