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
					additionalProperties: true,
					required: ['slug'],
					properties: {
						slug: {
							type: 'string',
							enum: ['first-time-login', 'action-create-user'],
						},
					},
				},
				{
					type: 'object',
					description: 'User can see other users (except for admin and guest)',
					additionalProperties: true,
					required: ['data', 'type', 'slug'],
					properties: {
						slug: {
							type: 'string',
							not: {
								enum: ['user-admin', 'user-guest'],
							},
						},
						type: {
							type: 'string',
							const: 'user@1.0.0',
						},
					},
				},
				{
					type: 'object',
					description:
						'User can view create contracts that create users, overrides user-community restriction',
					additionalProperties: true,
					required: ['type', 'data'],
					properties: {
						type: {
							const: 'create@1.0.0',
						},
						data: {
							type: 'object',
							properties: {
								payload: {
									type: 'object',
									if: {
										properties: {
											type: {
												const: 'user@1.0.0',
											},
										},
										required: ['type'],
									},
									then: {
										properties: {
											data: {
												required: ['roles'],
												properties: {
													roles: {
														type: 'array',
														not: {
															contains: {
																enum: ['user-guest', 'user-admin'],
															},
														},
													},
												},
											},
										},
										required: ['data'],
									},
								},
							},
						},
					},
				},
			],
		},
	},
};
