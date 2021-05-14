/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import { initialize } from './mixins';
import { actionRequest } from './action-request';
import { action } from './action';
import { card } from './card';
import { role } from './role';
import { org } from './org';
import { event } from './event';
import { link } from './link';
import { session } from './session';
import { type } from './type';
import { userAdmin } from './user-admin';
import { user } from './user';
import { roleUserAdmin } from './role-user-admin';
import { view } from './view';
import { oauthProvider } from './oauth-provider';
import { oauthClient } from './oauth-client';
import { ContractDefinition } from '@balena/jellyfish-types/build/core';

const cards = [
	actionRequest,
	action,
	card,
	role,
	org,
	event,
	link,
	session,
	type,
	userAdmin,
	user,
	roleUserAdmin,
	view,
	oauthProvider,
	oauthClient,
];

export const CARDS = cards.reduce<{ [slug: string]: ContractDefinition }>(
	(acc, contract) => {
		const initializedContract = initialize(contract as any);
		acc[initializedContract.slug] = initializedContract;
		return acc;
	},
	{},
);
