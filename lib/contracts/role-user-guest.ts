import type { RoleContractDefinition } from '../types';

export const roleUserGuest: RoleContractDefinition = {
	slug: 'role-user-guest',
	name: 'Guest role permissions',
	type: 'role@1.0.0',
	markers: [],
	data: {
		read: {
			type: 'object',
			required: ['slug', 'type'],
			properties: {
				slug: {
					const: {
						$eval: 'user.slug',
					},
				},
				type: {
					const: 'user@1.0.0',
				},
			},
		},
	},
};
