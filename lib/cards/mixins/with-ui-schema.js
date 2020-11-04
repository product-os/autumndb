/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const uiSchemaDefs = require('./ui-schema-defs.json')

// This mixin defines all common fields in cards that support
// UI Schemas (i.e. type cards)
module.exports = {
	data: {
		uiSchema: {
			fields: {
				...uiSchemaDefs.reset,
				links: {
					'ui:title': null,
					'is for': {
						'ui:widget': 'List',
						'ui:options': {
							ordered: true
						},
						items: {
							...uiSchemaDefs.reset,
							...uiSchemaDefs.singleline,
							links: null
						}
					}
				}
			},
			singleline: {
				// Singleline should only show the slug/id or name wrapped in a link
				...uiSchemaDefs.reset,
				...uiSchemaDefs.singleline,
				links: null
			}
		}
	}
}
