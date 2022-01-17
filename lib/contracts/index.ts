import type { ContractDefinition } from '@balena/jellyfish-types/build/core';
import { initialize } from './mixins';
import { actionRequest } from './action-request';
import { action } from './action';
import { card } from './card';
import { role } from './role';
import { org } from './org';
import { error } from './error';
import { event } from './event';
import { link } from './link';
import { loop } from './loop';
import { session } from './session';
import { type } from './type';
import { userAdmin } from './user-admin';
import { user } from './user';
import { roleUserAdmin } from './role-user-admin';
import { view } from './view';
import { oauthProvider } from './oauth-provider';
import { oauthClient } from './oauth-client';
import { scheduledAction } from './scheduled-action';
import { authentication } from './authentication';
import { userSettings } from './user-settings';

const contracts = [
	actionRequest,
	action,
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
	view,
	oauthProvider,
	oauthClient,
	scheduledAction,
	authentication,
	userSettings,
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
