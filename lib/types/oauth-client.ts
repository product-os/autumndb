import type { Contract, ContractDefinition } from './contract';

export interface OauthClientData {
	scope?: string;
	clientId: string;
	redirectUrl?: string;
	clientSecret: string;
	[k: string]: unknown;
}

export interface OauthClientContractDefinition
	extends ContractDefinition<OauthClientData> {}

export interface OauthClientContract extends Contract<OauthClientData> {}
