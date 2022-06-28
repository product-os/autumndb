import type { ContractDefinition } from '@balena/jellyfish-types/build/core';
import { authenticationOauth } from './authentication-oauth';
import { authenticationPassword } from './authentication-password';
import { card } from './card';
import { error } from './error';
import { event } from './event';
import { link } from './link';
import { loop } from './loop';
import { initialize } from './mixins';
import { org } from './org';
import { relationship } from './relationship';
import { relationshipOauthProviderHasAttachedOauthClient } from './relationship-oauth-provider-has-attached-oauth-client';
import { relationshipOrgHasMemberUser } from './relationship-org-has-member-user';
import { relationshipUserIsAuthenticatedWithAuthenticationOauth } from './relationship-user-is-authenticated-with-authentication-oauth';
import { relationshipUserIsAuthenticatedWithAuthenticationPassword } from './relationship-user-is-authenticated-with-authentication-password';
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
	authenticationOauth,
	authenticationPassword,
	card,
	error,
	event,
	link,
	loop,
	org,
	relationship,
	relationshipOauthProviderHasAttachedOauthClient,
	relationshipOrgHasMemberUser,
	relationshipUserIsAuthenticatedWithAuthenticationOauth,
	relationshipUserIsAuthenticatedWithAuthenticationPassword,
	role,
	roleUserAdmin,
	roleUserCommunity,
	roleUserGuest,
	roleUserOperator,
	roleUserTest,
	session,
	type,
	user,
	userAdmin,
	userSettings,
	view,
];

export const CONTRACTS = contracts.reduce<{
	[slug: string]: ContractDefinition;
}>((acc, kontract) => {
	const initializedContract = initialize(kontract as any);
	acc[initializedContract.slug] = initializedContract;
	return acc;
}, {});

/** @deprecated */
export const CARDS = CONTRACTS;
