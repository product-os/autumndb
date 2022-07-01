import type { RoleContractDefinition } from '../types';

export const roleUserCommunity: RoleContractDefinition = {
	slug: 'role-user-community',
	name: 'Community role permissions',
	type: 'role@1.0.0',
	markers: [],
	data: {
		read: {
			type: 'object',
			required: ['active'],
			properties: {
				active: {
					const: true,
				},
			},
			not: {
				anyOf: [
					{
						required: ['slug'],
						properties: {
							slug: {
								enum: [
									'action-create-user',
									'action',
									'event',
									'external-event',
									'first-time-login',
									'role',
									'triggered-action',
									'view-active-triggered-actions',
									'view-active',
									'view-non-executed-action-requests',
								],
							},
						},
					},
					{
						required: ['type'],
						properties: {
							type: {
								enum: [
									'action-request@1.0.0',
									'event@1.0.0',
									'external-event@1.0.0',
									'first-time-login@1.0.0',
									'password-reset@1.0.0',
									'role@1.0.0',
								],
							},
						},
					},
					{
						description:
							'User can view their own execute, session, web-push-subscription and view cards',
						required: ['type', 'data'],
						properties: {
							type: {
								enum: [
									'execute@1.0.0',
									'session@1.0.0',
									'view@1.0.0',
									'web-push-subscription@1.0.0',
								],
							},
							data: {
								not: {
									type: 'object',
									required: ['actor'],
									properties: {
										actor: {
											const: {
												$eval: 'user.id',
											},
										},
									},
								},
							},
						},
					},
					{
						required: ['slug', 'type', 'data'],
						properties: {
							slug: {
								const: {
									$eval: 'user.slug',
								},
							},
							type: {
								const: 'user@1.0.0',
							},
							data: {
								not: {
									type: 'object',
									additionalProperties: false,
									properties: {
										avatar: true,
										email: true,
										hash: true,
										oauth: true,
										profile: true,
										status: true,
									},
								},
							},
						},
					},
					{
						required: ['type', 'data'],
						properties: {
							type: {
								enum: [
									'authentication-oauth@1.0.0',
									'authentication-password@1.0.0',
									'user-settings@1.0.0',
								],
							},
							data: {
								not: {
									type: 'object',
									required: ['actorId'],
									properties: {
										actorId: {
											const: {
												$eval: 'user.id',
											},
										},
									},
								},
							},
						},
					},
					{
						description: "User can view create cards that don't create users",
						required: ['type', 'data'],
						properties: {
							type: {
								const: 'create@1.0.0',
							},
							data: {
								not: {
									type: 'object',
									properties: {
										payload: {
											type: 'object',
											properties: {
												type: {
													not: {
														enum: ['user@1.0.0', 'user'],
													},
												},
											},
										},
									},
								},
							},
						},
					},
					{
						required: ['slug', 'type', 'data'],
						properties: {
							slug: {
								not: {
									enum: ['user-admin', 'user-guest'],
								},
							},
							type: {
								const: 'user@1.0.0',
							},
							data: {
								not: {
									type: 'object',
									additionalProperties: false,
									properties: {
										avatar: true,
										email: true,
										profile: {
											type: 'object',
											additionalProperties: false,
											properties: {
												name: true,
												about: true,
												birthday: true,
												startDate: true,
												country: true,
												city: true,
												timezone: true,
											},
										},
										status: true,
									},
								},
							},
						},
					},
				],
			},
		},
	},
};
