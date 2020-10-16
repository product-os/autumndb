/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

// This mixin defines all common fields in cards that support
// UI Schemas (i.e. type cards)
module.exports = {
	data: {
		uiSchema: {
			// Only display the data field for the fields UI schema mode
			fields: {
				data: {
					'ui:title': null,
					origin: null,
					translateDate: null,
					$$localSchema: null
				},
				id: null,
				name: null,
				slug: null,
				type: null,
				version: null,
				markers: null,
				tags: null,
				links: null,
				linked_at: null,
				created_at: null,
				updated_at: null,
				active: null,
				requires: null,
				capabilities: null
			},
			snippet: {
				$ref: '#/data/uiSchema/fields'
			}
		}
	}
}
