export const org = {
	slug: 'org',
	type: 'type@1.0.0',
	name: 'Organisation',
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
				name: {
					type: 'string',
					fullTextSearch: true,
				},
				data: {
					type: 'object',
					properties: {
						profile: {
							type: 'object',
							properties: {
								description: {
									type: 'string',
									format: 'markdown',
								},
							},
						},
					},
				},
			},
			required: ['name'],
		},
	},
};
