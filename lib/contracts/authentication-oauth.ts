export const authenticationOauth = {
	slug: 'authentication-oauth',
	type: 'type@1.0.0',
	name: 'OAuth Authentication Details',
	data: {
		schema: {
			type: 'object',
			properties: {
				slug: {
					type: 'string',
					pattern: '^authentication-oauth-[a-z0-9-]+$',
				},
				data: {
					type: 'object',
					required: ['actorId', 'oauth'],
					properties: {
						actorId: {
							type: 'string',
							format: 'uuid',
						},
						oauth: {
							description: 'Linked accounts',
							type: 'object',
						},
					},
				},
			},
		},
	},
};
