import type {
	TypeData,
	TypeContractDefinition,
} from '@balena/jellyfish-types/build/core';
import { authentication } from './authentication';
import { card } from './card';
import { error } from './error';
import { event } from './event';
import { link } from './link';
import { loop } from './loop';
import { initialize } from './mixins';
import { oauthClient } from './oauth-client';
import { oauthProvider } from './oauth-provider';
import { org } from './org';
import { role } from './role';
import { roleUserAdmin } from './role-user-admin';
import { roleUserCommunity } from './role-user-community';
import { roleUserGuest } from './role-user-guest';
import { roleUserOperator } from './role-user-operator';
import { roleUserTest } from './role-user-test';
import { session } from './session';
import { type } from './type';
import { user } from './user';
import { userAdmin } from './user-admin';
import { userSettings } from './user-settings';
import { view } from './view';

const contracts = [
	card,
	role,
	org,
	event,
	error,
	link,
	loop,
	session,
	type,
	userAdmin,
	user,
	roleUserAdmin,
	roleUserCommunity,
	roleUserGuest,
	roleUserOperator,
	roleUserTest,
	view,
	oauthProvider,
	oauthClient,
	authentication,
	userSettings,
];

export const CONTRACTS = contracts.reduce<{
	[slug: string]: TypeContractDefinition;
}>((acc, kontract) => {
	const initializedContract = initialize<TypeData>(kontract as any);
	acc[initializedContract.slug] = initializedContract;
	return acc;
}, {});

/** @deprecated */
export const CARDS = CONTRACTS;
