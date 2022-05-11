import type { ContractDefinition } from '@balena/jellyfish-types/build/core';

const typeRegExp = '^\\*|([a-z0-9-]+(@\\d+\\.\\d+\\.\\d+)?)$';

export const relationship: ContractDefinition = {
	slug: `relationship`,
	type: 'type@1.0.0',
	name: 'Relationship',
	data: {
		schema: {
			type: 'object',
			required: ['name', 'slug', 'type', 'data'],
			properties: {
				name: {
					type: 'string',
				},
				slug: {
					type: 'string',
					pattern: '^relationship-[a-z0-9-]+$',
				},
				type: {
					type: 'string',
					const: 'relationship@1.0.0',
				},
				data: {
					type: 'object',
					required: ['inverseName', 'title', 'inverseTitle', 'from', 'to'],
					properties: {
						inverseName: {
							type: 'string',
						},
						title: {
							type: 'string',
						},
						inverseTitle: {
							type: 'string',
						},
						from: {
							type: 'object',
							required: ['type'],
							properties: {
								type: {
									type: 'string',
									pattern: typeRegExp,
								},
							},
						},
						to: {
							type: 'object',
							required: ['type'],
							properties: {
								type: {
									type: 'string',
									pattern: typeRegExp,
								},
							},
						},
					},
				},
			},
		},
		indexed_fields: [['data.from.type', 'data.to.type'], ['slug']],
	},
};
