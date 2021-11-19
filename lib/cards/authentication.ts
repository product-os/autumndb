/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

export const authentication = {
	slug: 'authentication',
	type: 'type@1.0.0',
	name: 'Authentication Details',
	data: {
		schema: {
			type: 'object',
			properties: {
				slug: {
					type: 'string',
					pattern: '^authentication-[a-z0-9-]+$',
				},
				data: {
					type: 'object',
					properties: {
						hash: {
							type: 'string',
							minLength: 1,
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
