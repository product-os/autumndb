import { uiSchemaDef } from './mixins/ui-schema-defs';

export const userSettings = {
	slug: 'user-settings',
	type: 'type@1.0.0',
	name: 'User Settings',
	data: {
		schema: {
			type: 'object',
			properties: {
				slug: {
					type: 'string',
					pattern: '^user-settings-[a-z0-9-]+$',
				},
				data: {
					type: 'object',
					required: ['actorId'],
					properties: {
						actorId: {
							type: 'string',
							format: 'uuid',
						},
						type: {
							type: 'string',
						},
						homeView: {
							description: 'The default view that is loaded after you login',
							type: 'string',
							format: 'uuid',
						},
						activeLoop: {
							// TODO: Add pattern regex once it is finalized
							description: 'The loop that the user is currently working on',
							type: ['string', 'null'],
						},
						sendCommand: {
							title: 'Send command',
							description: 'Command to send a message',
							type: 'string',
							default: 'shift+enter',
							enum: ['shift+enter', 'ctrl+enter', 'enter'],
						},
						disableNotificationSound: {
							title: 'Disable notification sound',
							description: 'Do not play a sound when displaying notifications',
							type: 'boolean',
							default: false,
						},
						starredViews: {
							description: 'List of view slugs that are starred',
							type: 'array',
							items: {
								type: 'string',
							},
						},
						viewSettings: {
							description:
								'A map of settings for view contracts, keyed by the view id',
							type: 'object',
							patternProperties: {
								'^.*$': {
									lens: {
										type: 'string',
									},
									slice: {
										type: 'string',
									},
									notifications: {
										type: 'object',
										properties: {
											web: {
												title: 'Web',
												description: 'Alert me with desktop notifications',
												type: 'object',
												properties: {
													update: {
														type: 'boolean',
													},
													mention: {
														type: 'boolean',
													},
													alert: {
														type: 'boolean',
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
			},
		},
		uiSchema: {
			fields: {
				data: {
					viewSettings: null,
					homeView: uiSchemaDef('idOrSlugLink'),
					sendCommand: {
						'ui:widget': 'Markdown',
						'ui:value': {
							$if: 'source',
							then: '`${source}`',
							else: null,
						},
					},
					disableNotificationSound: {
						'ui:widget': 'Checkbox',
					},
					starredViews: uiSchemaDef('idOrSlugList'),
				},
			},
		},
	},
};
