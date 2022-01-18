import { uiSchemaDef } from './ui-schema-defs';

const formUISchema = {
	'ui:order': ['name', 'loop', 'tags', 'data', '*'],
	loop: {
		'ui:widget': 'LoopSelect',
	},
};

// This mixin defines all common fields in contracts that support
// UI Schemas (i.e. type contracts)
export const baseUiSchema = {
	data: {
		uiSchema: {
			fields: uiSchemaDef('reset'),
			edit: formUISchema,
			create: formUISchema,
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
