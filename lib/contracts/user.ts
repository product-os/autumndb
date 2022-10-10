import { uiSchemaDef } from './mixins/ui-schema-defs';

const statusOptions = [
	{
		type: 'object',
		title: 'Available',
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
	{
		type: 'object',
		title: 'Do Not Disturb',
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
		title: 'On Annual Leave',
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
		title: 'In a Meeting',
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
];

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
							oneOf: statusOptions,
							default: {
								title: statusOptions[0].properties.title.const,
								value: statusOptions[0].properties.value.const,
							},
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
							},
						},
					},
					required: ['roles'],
				},
			},
			required: ['slug', 'data'],
		},
		uiSchema: {
			fields: {
				data: {
					email: uiSchemaDef('email'),
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
