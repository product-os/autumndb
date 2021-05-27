/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

export const oauthClient = {
	slug: 'oauth-client',
	type: 'type@1.0.0',
	name: 'Oauth Client',
	data: {
		schema: {
			type: 'object',
			properties: {
				slug: {
					type: 'string',
					pattern: '^oauth-client-[a-z0-9-]+$',
				},
				name: {
					type: 'string',
				},
				data: {
					type: 'object',
					properties: {
						clientId: {
							type: 'string',
						},
						clientSecret: {
							type: 'string',
						},
						scope: {
							type: 'string',
						},
						redirectUrl: {
							type: 'string',
						},
					},
					required: ['clientId', 'clientSecret'],
				},
			},
		},
	},
};
