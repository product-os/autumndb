export const authenticationPassword = {
	slug: 'authentication-password',
	type: 'type@1.0.0',
	name: 'Password Authentication Details',
	data: {
		schema: {
			type: 'object',
			properties: {
				slug: {
					type: 'string',
					pattern: '^authentication-password-[a-z0-9-]+$',
				},
				data: {
					type: 'object',
					required: ['actorId', 'hash'],
					properties: {
						actorId: {
							type: 'string',
							format: 'uuid',
						},
						hash: {
							type: 'string',
							minLength: 1,
						},
					},
				},
			},
		},
	},
};
