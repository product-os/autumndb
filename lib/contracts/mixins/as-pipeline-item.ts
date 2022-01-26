import type { ContractDefinition } from '@balena/jellyfish-types/build/core';
import * as _ from 'lodash';

const defaultStatusOptions = ['open', 'closed', 'archived'];

// Defines fields common to all items used in pipelines
export function asPipelineItem(
	slug: string,
	type: string,
	statusOptions = defaultStatusOptions,
	defaultStatus = 'open',
	statusNames: string[] | null = null,
): ContractDefinition {
	return {
		slug,
		type,
		data: {
			schema: {
				properties: {
					data: {
						type: 'object',
						required: ['status'],
						properties: {
							status: {
								title: 'Status',
								type: 'string',
								default: defaultStatus,
								enum: statusOptions,
								enumNames: statusNames || statusOptions.map(_.startCase),
							},
						},
					},
				},
				required: ['data'],
			},
			uiSchema: {
				fields: {
					data: {
						status: {
							'ui:widget': 'Badge',
						},
					},
				},
			},
			slices: ['properties.data.properties.status'],
			indexed_fields: [['data.status']],
		},
	};
}
