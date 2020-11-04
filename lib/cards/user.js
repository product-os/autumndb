/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

/* eslint-disable no-template-curly-in-string */
const path = require('path')

module.exports = {
	slug: 'user',
	type: 'type@1.0.0',
	name: 'Jellyfish User',
	data: {
		schema: {
			type: 'object',
			properties: {
				markers: {
					type: 'array',
					items: {
						type: 'string',
						pattern: '^[a-zA-Z0-9-_/:+]+$'
					}
				},
				slug: {
					type: 'string',
					pattern: '^user-[a-z0-9-]+$'
				},
				data: {
					type: 'object',
					properties: {
						status: {
							oneOf: [
								{
									type: 'object',
									properties: {
										title: {
											type: 'string',
											const: 'Do Not Disturb'
										},
										value: {
											type: 'string',
											const: 'DoNotDisturb'
										}
									}
								},
								{
									type: 'object',
									properties: {
										title: {
											type: 'string',
											const: 'On Annual Leave'
										},
										value: {
											type: 'string',
											const: 'AnnualLeave'
										}
									}
								},
								{
									type: 'object',
									properties: {
										title: {
											type: 'string',
											const: 'In a Meeting'
										},
										value: {
											type: 'string',
											const: 'Meeting'
										}
									}
								},
								{
									type: 'object',
									properties: {
										title: {
											type: 'string',
											const: 'Available'
										},
										value: {
											type: 'string',
											const: 'Available'
										}
									}
								}
							]
						},
						email: {
							type: [ 'string', 'array' ],
							format: 'email',
							uniqueItems: true,
							minItems: 1,
							items: {
								type: 'string',
								format: 'email'
							}
						},
						hash: {
							type: 'string',
							minLength: 1
						},
						avatar: {
							title: 'Avatar',
							type: [
								'string',
								'null'
							]
						},
						roles: {
							type: 'array',
							items: {
								type: 'string',
								pattern: '^[a-z0-9-]+$',
								not: {
									const: 'user-admin'
								}
							}
						},
						oauth: {
							description: 'Linked accounts',
							type: 'object'
						},
						profile: {
							description: 'Configuration options for your account',
							type: 'object',
							properties: {
								company: {
									type: 'string'
								},
								startDate: {
									title: 'Started at the company',
									type: 'string',
									format: 'date'
								},
								type: {
									type: 'string'
								},
								title: {
									type: 'string'
								},
								country: {
									title: 'Country',
									type: 'string'
								},
								city: {
									title: 'City',
									type: 'string'
								},
								timezone: {
									title: 'Timezone',
									type: 'string'
								},
								name: {
									type: 'object',
									properties: {
										first: {
											title: 'First name',
											type: 'string'
										},
										last: {
											title: 'Last name',
											type: 'string'
										},
										preffered: {
											title: 'Preferred name',
											type: 'string'
										},
										pronouns: {
											title: 'Pronouns',
											type: 'string'
										}
									}
								},
								birthday: {
									title: 'Birthday',
									type: 'string',
									pattern: '^(0[1-9]|1[0-2])/(0[1-9]|1[0-9]|2[0-9]|3[01])$'
								},
								about: {
									type: 'object',
									properties: {
										aboutMe: {
											title: 'About me',
											type: 'string'
										},
										askMeAbout: {
											title: 'Ask me about',
											type: 'array',
											items: {
												type: 'string'
											}
										},
										externalLinks: {
											title: 'Links',
											type: 'array',
											items: {
												type: 'string'
											}
										}
									}
								},
								homeView: {
									description: 'The default view that is loaded after you login',
									type: 'string',
									format: 'uuid'
								},
								sendCommand: {
									description: 'Command to send a message',
									type: 'string',
									default: 'shift+enter',
									enum: [
										'shift+enter',
										'ctrl+enter',
										'enter'
									]
								},
								starredViews: {
									description: 'List of view slugs that are starred',
									type: 'array',
									items: {
										type: 'string'
									}
								},
								viewSettings: {
									description: 'A map of settings for view cards, keyed by the view id',
									type: 'object',
									patternProperties: {
										'^.*$': {
											lens: {
												type: 'string'
											},
											slice: {
												type: 'string'
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
																type: 'boolean'
															},
															mention: {
																type: 'boolean'
															},
															alert: {
																type: 'boolean'
															}
														}
													}
												}
											}
										}
									}
								}
							}
						}
					},
					required: [
						'roles',
						'hash'
					]
				}
			},
			required: [
				'slug',
				'data'
			]
		},
		uiSchema: {
			fields: {
				data: {
					hash: null,
					email: {
						$ref: path.join(__dirname, '/mixins/ui-schema-defs.json#/email')
					},
					status: {
						'ui:title': null,
						value: null,
						title: {
							'ui:title': 'Current status'
						}
					},
					roles: {
						items: {
							'ui:widget': 'Badge'
						}
					},
					avatar: {
						'ui:widget': 'Img',
						'ui:options': {
							width: 100,
							alt: 'Avatar'
						}
					},
					profile: {
						'ui:description': null,
						viewSettings: null,
						homeView: {
							$ref: path.join(__dirname, '/mixins/ui-schema-defs.json#/idOrSlugLink')
						},
						sendCommand: {
							'ui:widget': 'Markdown',
							'ui:value': {
								$if: 'source',
								then: '`${source}`',
								else: null
							}
						},
						starredViews: {
							$ref: path.join(__dirname, '/mixins/ui-schema-defs.json#/idOrSlugList')
						},
						name: {
							'ui:title': null
						}
					}
				}
			},
			singleline: {
				$ref: path.join(__dirname, '/mixins/ui-schema-defs.json#/reset'),
				slug: null,
				'ui:order': [ 'data.avatar', '*' ],
				data: {
					roles: null,
					hash: null,
					email: null,
					profile: null,
					status: null,
					avatar: {
						'ui:title': null,
						'ui:widget': 'Avatar',
						'ui:value': {
							$if: 'source',
							then: '${source}',
							else: ''
						},
						'ui:options': {
							firstName: {
								$if: 'root["data"]["profile"]["name"]["first"]',
								then: '${root["data"]["profile"]["name"]["first"]}',
								else: ''
							},
							lastName: {
								$if: 'root["data"]["profile"]["name"]["last"]',
								then: '${root["data"]["profile"]["name"]["last"]}',
								else: ''
							},
							emphasized: true
						}
					}
				}
			}
		},
		meta: {
			relationships: [
				{
					title: 'Contact',
					link: 'has attached contact',
					type: 'contact'
				},
				{
					title: 'Sales',
					query: [
						{
							$$links: {
								'has attached element': {
									type: 'object',
									properties: {
										type: {
											const: 'create@1.0.0'
										},
										data: {
											type: 'object',
											properties: {
												actor: {
													const: {
														$eval: 'result.id'
													}
												}
											},
											required: [
												'actor'
											]
										}
									},
									required: [
										'data'
									]
								}
							},
							type: 'object',
							properties: {
								type: {
									const: 'sales-thread@1.0.0'
								}
							},
							additionalProperties: true
						}
					]
				},
				{
					title: 'Support',
					query: [
						{
							$$links: {
								'has attached element': {
									type: 'object',
									properties: {
										type: {
											const: 'create@1.0.0'
										},
										data: {
											type: 'object',
											properties: {
												actor: {
													const: {
														$eval: 'result.id'
													}
												}
											},
											required: [
												'actor'
											]
										}
									},
									required: [
										'data'
									]
								}
							},
							type: 'object',
							properties: {
								type: {
									const: 'support-thread@1.0.0'
								}
							},
							additionalProperties: true
						}
					]
				},
				{
					title: 'Owned conversations',
					query: [
						{
							$$links: {
								'is owned by': {
									type: 'object',
									properties: {
										type: {
											const: 'user@1.0.0'
										},
										id: {
											const: {
												$eval: 'result.id'
											}
										}
									},
									required: [
										'id'
									]
								}
							},
							type: 'object',
							properties: {
								type: {
									enum: [
										'support-thread@1.0.0',
										'sales-thread@1.0.0'
									]
								}
							},
							additionalProperties: true
						}
					]
				}
			]
		}
	}
}
