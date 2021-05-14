/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import uiSchemaDefs = require('./ui-schema-defs.json');

// This mixin defines all common fields in cards that support
// UI Schemas (i.e. type cards)
export const baseUiSchema = {
	data: {
		uiSchema: {
			fields: uiSchemaDefs.reset,
			snippet: {
				'ui:explicit': true,
				data: {
					'ui:title': null,
					'ui:explicit': true,
				},
			},
		},
	},
};
