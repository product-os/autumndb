import type { Contract, ContractDefinition } from './contract';

export interface OrgData {
	profile?: {
		description?: string;
		[k: string]: unknown;
	};
	[k: string]: unknown;
}

export interface OrgContractDefinition extends ContractDefinition<OrgData> {}

export interface OrgContract extends Contract<OrgData> {}
