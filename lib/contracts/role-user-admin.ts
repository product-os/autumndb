import type { RoleContractDefinition } from '@balena/jellyfish-types/build/core';

export const roleUserAdmin: RoleContractDefinition = {
	slug: 'role-user-admin',
	name: 'Kernel admin user permissions',
	type: 'role@1.0.0',
	data: {
		read: {
			type: 'object',
		},
	},
};
