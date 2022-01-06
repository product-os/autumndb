import { initialize } from './mixins';
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
import { authentication } from './authentication';
import { userSettings } from './user-settings';
import type { ContractDefinition } from '@balena/jellyfish-types/build/core';

const cards = [
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
	authentication,
	userSettings,
];

export const CARDS = cards.reduce<{ [slug: string]: ContractDefinition }>(
	(acc, contract) => {
		const initializedContract = initialize(contract as any);
		acc[initializedContract.slug] = initializedContract;
		return acc;
	},
	{},
);
