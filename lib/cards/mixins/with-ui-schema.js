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
			snippet: {
				...uiSchemaDefs.reset,
				data: null
			}
		}
	}
}
