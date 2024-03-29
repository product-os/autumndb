export const link = {
	slug: 'link',
	type: 'type@1.0.0',
	data: {
		schema: {
			type: 'object',
			properties: {
				name: {
					type: 'string',
				},
				slug: {
					type: 'string',
					pattern: '^link-[a-z0-9-]+$',
				},
				type: {
					type: 'string',
					enum: ['link', 'link@1.0.0'],
				},
				links: {
					type: 'object',
					additionalProperties: false,
					properties: {},
				},
				data: {
					type: 'object',
					properties: {
						inverseName: {
							type: 'string',
						},
						from: {
							type: 'object',
							required: ['id', 'type'],
							properties: {
								id: {
									type: 'string',
									format: 'uuid',
								},
								type: {
									type: 'string',
									pattern: '^[a-z0-9-]+@\\d+(\\.\\d+)?(\\.\\d+)?$',
								},
								slug: {
									type: 'string',
								},
							},
						},
						to: {
							type: 'object',
							required: ['id', 'type'],
							properties: {
								id: {
									type: 'string',
									format: 'uuid',
								},
								type: {
									type: 'string',
									pattern: '^[a-z0-9-]+@\\d+(\\.\\d+)?(\\.\\d+)?$',
								},
								slug: {
									type: 'string',
								},
							},
						},
					},
					required: ['inverseName', 'from', 'to'],
				},
			},
			required: ['name', 'type', 'links', 'data'],
		},
		indexed_fields: [
			['name'],
			['data.from.id'],
			['data.from.type'],
			['data.to.id'],
			['data.to.type'],
			['data.from.id', 'name', 'data.to.id'],
		],
	},
};
