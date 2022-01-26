import type { ContractDefinition } from '@balena/jellyfish-types/build/core';
import { uiSchemaDef } from './ui-schema-defs';

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
						$$formula: "AGGREGATE($events, 'tags')",
						fullTextSearch: true,
					},
					data: {
						properties: {
							participants: {
								type: 'array',
								$$formula: "AGGREGATE($events, 'data.actor')",
							},
							mentionsUser: {
								type: 'array',
								$$formula: "AGGREGATE($events, 'data.payload.mentionsUser')",
							},
							alertsUser: {
								type: 'array',
								$$formula: "AGGREGATE($events, 'data.payload.alertsUser')",
							},
							mentionsGroup: {
								type: 'array',
								$$formula: "AGGREGATE($events, 'data.payload.mentionsGroup')",
							},
							alertsGroup: {
								type: 'array',
								$$formula: "AGGREGATE($events, 'data.payload.alertsGroup')",
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
