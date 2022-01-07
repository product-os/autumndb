import * as path from 'path';

export const user = {
	slug: 'user',
	type: 'type@1.0.0',
	name: 'Jellyfish User',
	data: {
		schema: {
			type: 'object',
			properties: {
				markers: {
					type: 'array',
					items: {
						type: 'string',
						pattern: '^[a-zA-Z0-9-_/:+]+$',
					},
				},
				slug: {
					type: 'string',
					pattern: '^user-[a-z0-9-]+$',
					fullTextSearch: true,
				},
				data: {
					type: 'object',
					properties: {
						status: {
							oneOf: [
								{
									type: 'object',
									properties: {
										title: {
											type: 'string',
											const: 'Do Not Disturb',
										},
										value: {
											type: 'string',
											const: 'DoNotDisturb',
										},
									},
								},
								{
									type: 'object',
									properties: {
										title: {
											type: 'string',
											const: 'On Annual Leave',
										},
										value: {
											type: 'string',
											const: 'AnnualLeave',
										},
									},
								},
								{
									type: 'object',
									properties: {
										title: {
											type: 'string',
											const: 'In a Meeting',
										},
										value: {
											type: 'string',
											const: 'Meeting',
										},
									},
								},
								{
									type: 'object',
									properties: {
										title: {
											type: 'string',
											const: 'Available',
										},
										value: {
											type: 'string',
											const: 'Available',
										},
									},
								},
							],
						},
						email: {
							title: 'Email',
							oneOf: [
								{
									title: 'List of email addresses',
									type: 'array',
									uniqueItems: true,
									minItems: 1,
									items: {
										type: 'string',
										format: 'email',
									},
									fullTextSearch: true,
								},
								{
									title: 'Single email address',
									type: 'string',
									format: 'email',
									fullTextSearch: true,
								},
							],
						},
						hash: {
							type: 'string',
							minLength: 1,
						},
						avatar: {
							title: 'Avatar',
							type: ['string', 'null'],
						},
						roles: {
							type: 'array',
							items: {
								type: 'string',
								pattern: '^[a-z0-9-]+$',
								not: {
									const: 'user-admin',
								},
							},
						},
						oauth: {
							description: 'Linked accounts',
							type: 'object',
						},
						profile: {
							description: 'Configuration options for your account',
							type: 'object',
							properties: {
								company: {
									type: 'string',
								},
								startDate: {
									title: 'Started at the company',
									type: 'string',
									format: 'date',
								},
								type: {
									type: 'string',
								},
								title: {
									type: 'string',
								},
								country: {
									title: 'Country',
									type: 'string',
								},
								city: {
									title: 'City',
									type: 'string',
								},
								timezone: {
									title: 'Timezone',
									type: 'string',
								},
								name: {
									type: 'object',
									properties: {
										first: {
											title: 'First name',
											type: 'string',
											fullTextSearch: true,
										},
										last: {
											title: 'Last name',
											type: 'string',
											fullTextSearch: true,
										},
										preffered: {
											title: 'Preferred name',
											type: 'string',
										},
										pronouns: {
											title: 'Pronouns',
											type: 'string',
										},
									},
								},
								birthday: {
									title: 'Birthday',
									type: 'string',
									pattern: '^(0[1-9]|1[0-2])/(0[1-9]|1[0-9]|2[0-9]|3[01])$',
								},
								about: {
									type: 'object',
									properties: {
										aboutMe: {
											title: 'About me',
											type: 'string',
										},
										askMeAbout: {
											title: 'Ask me about',
											type: 'array',
											items: {
												type: 'string',
											},
										},
										externalLinks: {
											title: 'Links',
											type: 'array',
											items: {
												type: 'string',
											},
										},
									},
								},
								homeView: {
									description:
										'The default view that is loaded after you login',
									type: 'string',
									format: 'uuid',
								},
								activeLoop: {
									// TODO: Add pattern regex once it is finalized
									description: 'The loop that the user is currently working on',
									type: ['string', 'null'],
								},
								sendCommand: {
									title: 'Send command',
									description: 'Command to send a message',
									type: 'string',
									default: 'shift+enter',
									enum: ['shift+enter', 'ctrl+enter', 'enter'],
								},
								disableNotificationSound: {
									title: 'Disable notification sound',
									description:
										'Do not play a sound when displaying notifications',
									type: 'boolean',
									default: false,
								},
								starredViews: {
									description: 'List of view slugs that are starred',
									type: 'array',
									items: {
										type: 'string',
									},
								},
								viewSettings: {
									description:
										'A map of settings for view contracts, keyed by the view id',
									type: 'object',
									patternProperties: {
										'^.*$': {
											lens: {
												type: 'string',
											},
											slice: {
												type: 'string',
											},
											notifications: {
												type: 'object',
												properties: {
													web: {
														title: 'Web',
														description: 'Alert me with desktop notifications',
														type: 'object',
														properties: {
															update: {
																type: 'boolean',
															},
															mention: {
																type: 'boolean',
															},
															alert: {
																type: 'boolean',
															},
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
					required: ['roles', 'hash'],
				},
			},
			required: ['slug', 'data'],
		},
		uiSchema: {
			fields: {
				data: {
					hash: null,
					email: {
						$ref: path.join(__dirname, '/mixins/ui-schema-defs.json#/email'),
					},
					status: {
						'ui:title': null,
						value: null,
						title: {
							'ui:title': 'Current status',
						},
					},
					roles: {
						items: {
							'ui:widget': 'Badge',
						},
					},
					avatar: {
						'ui:widget': 'Img',
						'ui:options': {
							width: 100,
							alt: 'Avatar',
						},
					},
					profile: {
						'ui:description': null,
						viewSettings: null,
						homeView: {
							$ref: path.join(
								__dirname,
								'/mixins/ui-schema-defs.json#/idOrSlugLink',
							),
						},
						sendCommand: {
							'ui:widget': 'Markdown',
							'ui:value': {
								$if: 'source',
								then: '`${source}`',
								else: null,
							},
						},
						disableNotificationSound: {
							'ui:widget': 'Checkbox',
						},
						starredViews: {
							$ref: path.join(
								__dirname,
								'/mixins/ui-schema-defs.json#/idOrSlugList',
							),
						},
						name: {
							'ui:title': null,
						},
					},
				},
			},
		},
		meta: {
			relationships: [
				{
					title: 'Sales',
					query: [
						{
							$$links: {
								'has attached element': {
									type: 'object',
									properties: {
										type: {
											const: 'create@1.0.0',
										},
										data: {
											type: 'object',
											properties: {
												actor: {
													const: {
														$eval: 'result.id',
													},
												},
											},
											required: ['actor'],
										},
									},
									required: ['data'],
								},
							},
							type: 'object',
							properties: {
								type: {
									const: 'sales-thread@1.0.0',
								},
							},
							additionalProperties: true,
						},
					],
				},
				{
					title: 'Support',
					query: [
						{
							$$links: {
								'has attached element': {
									type: 'object',
									properties: {
										type: {
											const: 'create@1.0.0',
										},
										data: {
											type: 'object',
											properties: {
												actor: {
													const: {
														$eval: 'result.id',
													},
												},
											},
											required: ['actor'],
										},
									},
									required: ['data'],
								},
							},
							type: 'object',
							properties: {
								type: {
									const: 'support-thread@1.0.0',
								},
							},
							additionalProperties: true,
						},
					],
				},
			],
		},
	},
};
