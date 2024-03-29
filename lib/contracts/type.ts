import { mergeProperties } from './transformer-merge-properties';

export const type = {
	slug: 'type',
	type: 'type@1.0.0',
	name: 'Jellyfish Contract Type',
	data: {
		schema: {
			type: 'object',
			properties: {
				slug: {
					type: 'string',
					pattern: '^[a-z0-9-]+$',
				},
				type: {
					type: 'string',
					enum: ['type', 'type@1.0.0'],
				},
				data: {
					type: 'object',
					properties: {
						schema: {
							type: 'object',
						},
						uiSchema: {
							type: 'object',
						},
						slices: {
							type: 'array',
							items: {
								type: 'string',
							},
						},
						indexed_fields: {
							description:
								'Fields, or groups of fields that should be indexed for improved performance',
							type: 'array',
							items: {
								type: 'array',
								items: {
									type: 'string',
								},
							},
						},
					},
					$transformer: {
						type: 'object',
						properties: {
							...mergeProperties,
							mergeable: {
								description:
									'types are validated on insert and thus are always mergeable',
								type: 'boolean',
								$$formula: 'true',
								readOnly: true,
								default: false,
							},
						},
					},
					required: ['schema'],
				},
			},
			required: ['slug', 'type', 'data'],
		},
	},
};
