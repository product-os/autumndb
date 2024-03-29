export const view = {
	slug: 'view',
	type: 'type@1.0.0',
	name: 'Jellyfish view',
	data: {
		schema: {
			description: 'Jellyfish View',
			type: 'object',
			properties: {
				slug: {
					type: 'string',
					pattern: '^[a-z0-9-]+$',
				},
				name: {
					type: 'string',
					fullTextSearch: true,
				},
				data: {
					type: 'object',
					properties: {
						actor: {
							type: 'string',
							format: 'uuid',
						},
						namespace: {
							type: 'string',
						},
						schema: {
							type: 'object',
						},
						anyOf: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									name: {
										type: 'string',
										pattern: '^.*\\S.*$',
									},
									schema: {
										type: 'object',
										properties: {
											type: {
												type: 'string',
												const: 'object',
											},
										},
										required: ['type'],
									},
								},
								additionalProperties: false,
								required: ['name', 'schema'],
							},
						},
						allOf: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									name: {
										type: 'string',
										pattern: '^.*\\S.*$',
									},
									schema: {
										type: 'object',
										properties: {
											type: {
												type: 'string',
												const: 'object',
											},
										},
										required: ['type'],
									},
								},
								additionalProperties: false,
								required: ['name', 'schema'],
							},
						},
						types: {
							description: 'A list of data types this view can return',
							type: 'array',
							items: {
								type: 'string',
							},
						},
					},
				},
			},
			required: ['data'],
		},
	},
};
