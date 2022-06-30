import type { TypeContractDefinition } from '../types';

const logWidget = {
	'ui:widget': 'Txt',
	'ui:options': { whitespace: 'pre', monospace: true },
};

export const error: TypeContractDefinition = {
	slug: 'error',
	type: 'type@1.0.0',
	data: {
		schema: {
			type: 'object',
			properties: {
				name: {
					type: 'string',
				},
				data: {
					type: 'object',
					properties: {
						transformer: {
							type: 'string',
						},
						expectedOutputTypes: {
							type: 'array',
						},
						message: {
							type: 'string',
						},
						code: {
							type: 'string',
						},
						stdOutTail: {
							type: 'string',
						},
						stdErrTail: {
							type: 'string',
						},
					},
				},
			},
		},
		uiSchema: {
			fields: {
				data: {
					stdOutTail: logWidget,
					stdErrTail: logWidget,
					// MR 2021-12-10: is there no way to hide a field?
					$transformer: { 'ui:widget': 'None' },
				},
			},
		},
	},
};
