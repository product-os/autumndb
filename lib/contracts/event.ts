import type { TypeContractDefinition } from '@balena/jellyfish-types/build/core';

export const event: TypeContractDefinition = {
	slug: 'event',
	type: 'type@1.0.0',
	name: 'Jellyfish Event',
	data: {
		schema: {
			type: 'object',
			properties: {
				version: {
					type: 'string',
					const: '1.0.0',
				},
				data: {
					type: 'object',
					properties: {
						timestamp: {
							type: 'string',
							format: 'date-time',
						},
						target: {
							type: 'string',
							format: 'uuid',
						},
						actor: {
							type: 'string',
							format: 'uuid',
						},
						payload: {
							type: 'object',
						},
					},
					required: ['timestamp', 'target', 'actor'],
				},
			},
			required: ['version', 'data'],
		},
	},
};
