import type { TypeContractDefinition } from '@balena/jellyfish-types/build/core';

export const error: TypeContractDefinition = {
	slug: 'error',
	type: 'type@1.0.0',
	data: {
		schema: {
			type: 'object',
			properties: {
				name: {
					type: 'string',
				},
				data: {
					type: 'object',
					properties: {
						message: {
							type: 'string',
						},
						code: {
							type: 'string',
						},
					},
				},
			},
		},
	},
};
