import jsone = require('json-e');
import * as _ from 'lodash';
import jsonSchema from '../json-schema';
import type { JsonSchema } from '../types';

// Recursively applies an authorization schema to $$links queries,
// ensuring that authorization can't be escaped by using a relational query.
export const applyAuthorizationSchemaToLinks = (
	schema: JsonSchema,
	authorizationSchema: JsonSchema,
) => {
	if (Array.isArray(schema)) {
		for (const item of schema) {
			applyAuthorizationSchemaToLinks(item, authorizationSchema);
		}
	}

	if (!_.isPlainObject(schema)) {
		return;
	}

	if (schema instanceof Object) {
		if ('$$links' in schema) {
			const links = schema.$$links!;
			for (const [linkType, linkSchema] of Object.entries(links)) {
				applyAuthorizationSchemaToLinks(linkSchema, authorizationSchema);
				links[linkType] = jsonSchema.merge([
					authorizationSchema as any,
					linkSchema as any,
				]) as JsonSchema;
			}
		}

		if ('properties' in schema) {
			for (const propertySchema of Object.values(schema.properties!)) {
				applyAuthorizationSchemaToLinks(propertySchema, authorizationSchema);
			}
		}

		for (const keyWithSubSchema of [
			'allOf',
			'anyOf',
			'contains',
			'items',
			'not',
		]) {
			if (keyWithSubSchema in schema) {
				applyAuthorizationSchemaToLinks(
					schema[keyWithSubSchema as keyof JsonSchema] as JsonSchema,
					authorizationSchema,
				);
			}
		}
	}
};

// Only consider objects with $eval
export const evaluateSchemaWithContext = (
	schema: any,
	evaluationContext: { [key: string]: any },
) => {
	if (!schema) {
		return schema;
	}

	if (schema.$eval) {
		return jsone(schema, evaluationContext);
	}

	if (schema.$id) {
		Reflect.deleteProperty(schema, '$id');
	}

	for (const key of Object.keys(schema)) {
		// For performance reasons
		if (typeof schema[key] !== 'object') {
			continue;
		}

		schema[key] = evaluateSchemaWithContext(schema[key], evaluationContext);
	}

	return schema;
};
