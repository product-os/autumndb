/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

module.exports = {
	slug: 'session',
	type: 'type@1.0.0',
	name: 'Jellyfish Session',
	data: {
		schema: {
			type: 'object',
			properties: {
				data: {
					type: 'object',
					properties: {
						actor: {
							type: 'string',
							format: 'uuid'
						},
						expiration: {
							type: 'string',
							format: 'date-time'
						},
						scope: {
							type: 'object',
							additionalProperties: true
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
	}
}
