import type { ContractDefinition } from '@balena/jellyfish-types/build/core';
import { uiSchemaDef } from './ui-schema-defs';

const eventsPartial = `FILTER(contract.links['is attached to'], function (c) { return c && c.type && c.type !== 'create@1.0.0' && c.type !== 'update@1.0.0' })`;

// This mixin defines all common fields in cards that support
// attached events (i.e. 'timelines')
export function withEvents(slug: string, type: string): ContractDefinition {
	return {
		slug,
		type,
		data: {
			schema: {
				properties: {
					tags: {
						type: 'array',
						items: {
							type: 'string',
						},
						$$formula: `AGGREGATE(${eventsPartial}, 'tags')`,
						fullTextSearch: true,
					},
					data: {
						properties: {
							participants: {
								type: 'array',
								$$formula: `AGGREGATE(${eventsPartial}, 'participants')`,
							},
							mentionsUser: {
								type: 'array',
								$$formula: `AGGREGATE(${eventsPartial}, 'data.payload.mentionsUser')`,
							},
							alertsUser: {
								type: 'array',
								$$formula: `AGGREGATE(${eventsPartial}, 'data.payload.alertsUser')`,
							},
							mentionsGroup: {
								type: 'array',
								$$formula: `AGGREGATE(${eventsPartial}, 'data.payload.mentionsGroup')`,
							},
							alertsGroup: {
								type: 'array',
								$$formula: `AGGREGATE(${eventsPartial}, 'data.payload.alertsGroup')`,
							},
						},
					},
				},
			},
			uiSchema: {
				fields: {
					tags: uiSchemaDef('badgeList'),
					data: {
						'ui:order': [
							'mentionsUser',
							'alertsUser',
							'mentionsGroup',
							'alertsGroup',
							'participants',
						],
						mentionsUser: uiSchemaDef('usernameList'),
						alertsUser: uiSchemaDef('usernameList'),
						mentionsGroup: uiSchemaDef('groupList'),
						alertsGroup: uiSchemaDef('groupList'),
						participants: uiSchemaDef('userIdList'),
					},
				},
			},
		},
	};
}
