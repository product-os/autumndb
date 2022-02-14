import type { UserContractDefinition } from '@balena/jellyfish-types/build/core';

export const userAdmin: UserContractDefinition = {
	slug: 'user-admin',
	type: 'user@1.0.0',
	name: 'The admin user',
	data: {
		email: 'accounts+jellyfish@resin.io',
		hash: 'PASSWORDLESS',
		roles: [],
	},
};
