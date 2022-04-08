import type { RoleContractDefinition } from '@balena/jellyfish-types/build/core';

export const roleUserGuest: RoleContractDefinition = {
	slug: 'role-user-guest',
	name: 'Guest role permissions',
	type: 'role@1.0.0',
	markers: [],
	data: {
		read: {
			type: 'object',
			required: ['id', 'type'],
			additionalProperties: true,
			properties: {
				id: {
					type: 'string',
					const: {
						$eval: 'user.id',
					},
				},
				type: {
					type: 'string',
					const: 'user@1.0.0',
				},
			},
		},
	},
};
