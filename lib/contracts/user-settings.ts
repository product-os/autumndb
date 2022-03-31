import { asTimeZone, uiSchemaDef } from './mixins';

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
					properties: {
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
						timeZone: {
							description: 'Work time-zone preferences',
							type: 'object',
							required: ['default'],
							properties: {
								default: asTimeZone(),
								overrides: {
									description: 'List of date-based time-zone overrides',
									type: 'array',
									items: {
										type: 'object',
										required: ['start', 'end', 'timeZone'],
										properties: {
											start: {
												type: 'string',
												format: 'date',
											},
											end: {
												type: 'string',
												format: 'date',
											},
											timeZone: asTimeZone(),
										},
									},
								},
							},
						},
						shareBirthday: {
							description: 'Option to share birthday with team',
							title:
								'May we share you birthday (day and month only) with the balena team?',
							type: 'boolean',
							default: false,
						},
						leavePayoutThreshold: {
							description:
								'Pay out leave above this number (min 40, max 80 days)',
							title: 'Leave payout threshold',
							type: 'number',
							minimum: 40,
							maximum: 80,
							default: 40,
						},
						supportShiftLength: {
							description: 'Ideal support shift length (in hours)',
							type: 'number',
						},
						workingHours: {
							description: 'Preferred working hours in your local time',
							title: 'Preferred working hours',
							type: 'array',
							items: {
								type: 'object',
								required: ['start', 'end', 'level'],
								properties: {
									start: uiSchemaDef('time'),
									end: uiSchemaDef('time'),
									level: {
										type: 'number',
										minimum: 0,
										maximum: 3,
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
