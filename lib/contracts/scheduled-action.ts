import type { ContractDefinition } from '@balena/jellyfish-types/build/core';

export const scheduledAction: ContractDefinition = {
	slug: 'scheduled-action',
	type: 'type@1.0.0',
	name: 'Scheduled action',
	markers: [],
	data: {
		schema: {
			type: 'object',
			required: ['data'],
			properties: {
				data: {
					type: 'object',
					required: ['options', 'schedule'],
					properties: {
						options: {
							title: 'Action request options',
							type: 'object',
							required: ['action'],
							properties: {
								action: {
									type: 'string',
									pattern: '^action-[a-z0-9-]+@\\d+\\.\\d+\\.\\d+$',
								},
								card: {
									type: 'string',
								},
								type: {
									type: 'string',
								},
								arguments: {
									type: 'object',
								},
								context: {
									type: 'object',
								},
							},
						},
						schedule: {
							title: 'Execution schedule',
							type: 'object',
							oneOf: [
								{
									required: ['once'],
								},
								{
									required: ['recurring'],
								},
							],
							properties: {
								once: {
									type: 'object',
									required: ['date'],
									properties: {
										date: {
											type: 'string',
											format: 'date-time',
										},
									},
								},
								recurring: {
									type: 'object',
									required: ['start', 'end', 'interval'],
									properties: {
										start: {
											title: 'Execution start date/time',
											type: 'string',
											format: 'date-time',
										},
										end: {
											title: 'Execution end date/time',
											type: 'string',
											format: 'date-time',
										},
										interval: {
											title: 'Execution interval (cron format)',
											type: 'string',
											pattern:
												'^([\\d|/|*|\\-|,]+\\s)?[\\d|/|*|\\-|,]+\\s[\\d|/|*|\\-|,]+\\s[\\d|L|/|*|\\-|,|\\?]+\\s[\\d|/|*|\\-|,]+\\s[\\d|L|/|*|\\-|,|\\?]+$',
										},
									},
								},
							},
						},
					},
				},
			},
		},
	},
};
