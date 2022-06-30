import { JSONSchema7Type, JSONSchema7TypeName } from 'json-schema';

export { JSONSchema7Type, JSONSchema7TypeName };

export type JsonSchema =
	| boolean
	| {
			// Extensions
			$$formula?: string;
			$$links?: {
				[key: string]: JsonSchema;
			};
			formatMaximum?: string;
			formatMinimum?: string;
			fullTextSearch?: boolean;

			// These are not supported currently
			// $id?: string;
			// $ref?: string;
			// $schema?: JSONSchema7Version;
			// $comment?: string;

			/**
			 * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.1
			 */
			type?: JSONSchema7TypeName | JSONSchema7TypeName[];
			enum?: JSONSchema7Type[];
			const?: JSONSchema7Type;

			/**
			 * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.2
			 */
			multipleOf?: number;
			maximum?: number;
			exclusiveMaximum?: number;
			minimum?: number;
			exclusiveMinimum?: number;

			/**
			 * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.3
			 */
			maxLength?: number;
			minLength?: number;
			pattern?: string;

			/**
			 * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.4
			 */
			items?: JsonSchema | JsonSchema[];
			maxItems?: number;
			minItems?: number;
			contains?: JsonSchema;
			// These are not supported currently
			// additionalItems?: JsonSchema;
			// uniqueItems?: boolean;

			/**
			 * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.5
			 */
			maxProperties?: number;
			minProperties?: number;
			required?: string[];
			properties?: {
				[key: string]: JsonSchema;
			};
			additionalProperties?: JsonSchema;
			// These are not supported currently
			/*patternProperties?: {
		[key: string]: JsonSchema;
	};*/
			/*dependencies?: {
		[key: string]: JSONSchema | string[];
	};*/
			// propertyNames?: JsonSchema;

			/**
			 * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.6
			 */
			// These are not supported currently
			// if?: JsonSchema;
			// then?: JsonSchema;
			// else?: JsonSchema;

			/**
			 * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.7
			 */
			allOf?: JsonSchema[];
			anyOf?: JsonSchema[];
			oneOf?: JsonSchema[];
			not?: JsonSchema;

			/**
			 * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-7
			 */
			format?: string;

			/**
			 * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-8
			 */
			// These are not supported currently
			// contentMediaType?: string;
			// contentEncoding?: string;

			/**
			 * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-9
			 */
			// This is not supported currently
			/*definitions?: {
		[key: string]: JsonSchema;
	};*/

			/**
			 * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-10
			 */
			title?: string;
			description?: string;
			examples?: JSONSchema7Type;
			// These are not supported currently
			// default?: JSONSchema7Type;
			// readOnly?: boolean;
			// writeOnly?: boolean;
	  };
