export const card = {
	slug: 'card',
	name: 'Jellyfish Card',
	type: 'type@1.0.0',
	data: {
		schema: {
			type: 'object',
			properties: {
				id: {
					type: 'string',
					format: 'uuid',
				},
				version: {
					type: 'string',

					// https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
					pattern:
						'^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$',
				},
				slug: {
					type: 'string',
					pattern: '^[a-z0-9-]+$',
				},
				name: {
					type: ['string', 'null'],
				},
				type: {
					type: 'string',
					pattern: '^[a-z0-9-]+@\\d+(\\.\\d+)?(\\.\\d+)?$',
				},
				loop: {
					// TODO: Add a pattern once the loop slug pattern is finalized
					type: ['string', 'null'],
				},
				tags: {
					type: 'array',
					items: {
						type: 'string',
					},
				},
				markers: {
					type: 'array',
					items: {
						type: 'string',
						pattern: '^[a-zA-Z0-9-_/:+]+$',
					},
				},
				links: {
					type: 'object',
				},
				created_at: {
					title: 'created at',
					type: 'string',
					format: 'date-time',
				},
				updated_at: {
					title: 'updated at',
					anyOf: [
						{
							type: 'string',
							format: 'date-time',
						},
						{
							type: 'null',
						},
					],
				},
				active: {
					type: 'boolean',
				},
				requires: {
					type: 'array',
					items: {
						type: 'object',
					},
				},
				capabilities: {
					type: 'array',
					items: {
						type: 'object',
					},
				},
				data: {
					type: 'object',
				},
				linked_at: {
					title: 'linked at',
					type: 'object',
				},
			},
			additionalProperties: false,
			required: [
				'active',
				'created_at',
				'slug',
				'capabilities',
				'data',
				'links',
				'markers',
				'requires',
				'tags',
				'type',
				'version',
			],
		},
	},
};
