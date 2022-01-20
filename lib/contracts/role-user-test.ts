import type { RoleContractDefinition } from '@balena/jellyfish-types/build/core';

export const roleUserTest: RoleContractDefinition = {
	slug: 'role-user-test',
	name: 'Test role permissions',
	type: 'role@1.0.0',
	markers: [],
	data: {
		read: {
			type: 'object',
		},
	},
};
