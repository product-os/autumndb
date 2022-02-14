import type { JsonSchema } from '@balena/jellyfish-types';
import jsone = require('json-e');
import * as _ from 'lodash';

// Recursively applies an authorization schema to $$links queries,
// ensuring that authorization can't be escaped by using a relational query.
export const applyAuthorizationSchemaToLinks = (
	schema: JsonSchema,
	authorizationSchema: JsonSchema,
): void => {
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
				links[linkType] = {
					allOf: [authorizationSchema, linkSchema],
				};
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
): JsonSchema => {
	if (schema instanceof Object) {
		if (schema.$eval) {
			return jsone(schema, evaluationContext);
		}

		for (const key of Object.keys(schema)) {
			// For performance reasons
			// eslint-disable-next-line lodash/prefer-lodash-typecheck
			if (typeof schema[key] !== 'object') {
				continue;
			}

			schema[key] = evaluateSchemaWithContext(schema[key], evaluationContext);
		}
	}

	return schema;
};
