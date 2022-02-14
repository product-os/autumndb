import type { TypeContractDefinition } from '@balena/jellyfish-types/build/core';

export const authentication: TypeContractDefinition = {
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
