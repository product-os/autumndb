import type { RoleContractDefinition } from '../types';

export const roleUserOperator: RoleContractDefinition = {
	slug: 'role-user-operator',
	name: 'Operator role permissions',
	type: 'role@1.0.0',
	markers: [],
	data: {
		read: {
			type: 'object',
			anyOf: [
				{
					type: 'object',
					required: ['slug'],
					properties: {
						slug: {
							enum: ['action-create-user', 'first-time-login'],
						},
					},
				},
				{
					description:
						'User can see other users (except for user-admin and user-guest)',
					type: 'object',
					required: ['type', 'slug'],
					properties: {
						slug: {
							not: {
								enum: ['user-admin', 'user-guest'],
							},
						},
						type: {
							const: 'user@1.0.0',
						},
					},
				},
			],
		},
	},
};
