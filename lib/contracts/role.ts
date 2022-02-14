import type { TypeContractDefinition } from '@balena/jellyfish-types/build/core';

export const role: TypeContractDefinition = {
	slug: 'role',
	type: 'type@1.0.0',
	name: 'Jellyfish Role',
	data: {
		schema: {
			type: 'object',
			required: ['data'],
			properties: {
				slug: {
					type: 'string',
					pattern: '^role-[a-z0-9-]+$',
				},
				data: {
					type: 'object',
					required: ['read'],
					properties: {
						read: {
							type: 'object',
						},
					},
				},
			},
		},
	},
};
