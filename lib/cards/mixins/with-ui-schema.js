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
			fields: uiSchemaDefs.reset,
			edit: {
				$ref: '#/data/uiSchema/definitions/form'
			},
			create: {
				$ref: '#/data/uiSchema/edit'
			},
			definitions: {
				form: {
					'ui:order': [ 'name', 'loop', 'tags', 'data', '*' ],
					loop: {
						'ui:widget': 'AutoCompleteWidget',
						'ui:options': {
							resource: 'loop',
							keyPath: 'slug'
						}
					}
				}
			},
			snippet: {
				'ui:explicit': true,
				data: {
					'ui:title': null,
					'ui:explicit': true
				}
			}
		}
	}
}
