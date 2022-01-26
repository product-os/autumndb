import jsone = require('json-e');
import * as _ from 'lodash';
import type { DatabaseBackend } from './backend/postgres/types';
import { Contract } from './contracts';
import type { Context } from './context';
import jsonSchema, { JsonSchema } from './json-schema';
import { CONTRACTS } from './contracts';

const applyMarkers = async (
	context: Context,
	backend: DatabaseBackend,
	actor: Contract,
	schema: JsonSchema,
): Promise<JsonSchema> => {
	// TODO: Find a way to implement this logic without
	// hardcoding the admin user
	if (actor.slug === CONTRACTS['user-admin'].slug) {
		return schema;
	}

	const orgs = await backend.query(
		context,
		{
			slug: {},
		},
		{
			type: 'object',
			$$links: {
				'has member': {
					type: 'object',
					required: ['type', 'slug'],
					properties: {
						type: {
							type: 'string',
							const: actor.type,
						},
						slug: {
							type: 'string',
							const: actor.slug,
						},
					},
				},
			},
			required: ['slug', 'type'],
			properties: {
				slug: {
					type: 'string',
				},
				type: {
					type: 'string',
					const: 'org@1.0.0',
				},
			},
		},
	);

	const markers = _.uniq(
		[actor, ...orgs].map((contract) => {
			return contract.slug;
		}),
	);

	const markersQuery: JsonSchema =
		markers.length === 0
			? // If there are no markers provided, only elements with
			  // no markers are valid
			  {
					type: 'array',
					maxItems: 0,
			  }
			: {
					type: 'array',
					items: {
						type: 'string',
						anyOf: [
							{
								enum: markers,
							},

							// Use pattern matching to allow content using compound markers
							// (markers join with a + symbol)
							{
								pattern: `(^|\\+)(${markers.join('|')})($|\\+)`,
							},
						],
					},
			  };

	return jsonSchema.merge([
		schema as any,
		{
			type: 'object',
			required: ['markers'],
			properties: {
				markers: markersQuery,
			},
		},
	]) as JsonSchema;
};

/**
 * @summary Get the filter schemas for the actor's roles
 * @function
 * @private
 *
 * @param {Object} context - execution context
 * @param {Object} backend - backend
 * @param {Object} actor - actor contract
 * @returns {Object[]} role schemas
 */
const getRoleViews = async (
	context: Context,
	backend: DatabaseBackend,
	actor: Contract,
) => {
	const viewSchemas = [];

	const actorRoles: string[] = (actor.data?.roles as string[]) || [];

	for (const role of [actor.slug, ...actorRoles]) {
		const roleContract = await backend.getElementBySlug(
			context,
			`role-${role}@1.0.0`,
		);

		if (!roleContract) {
			continue;
		}

		viewSchemas.push(roleContract.data.read);
	}

	// A default schema that will not match anything
	if (viewSchemas.length === 0) {
		viewSchemas.push({
			type: 'object',
			additionalProperties: false,
		});
	}

	return viewSchemas;
};

// Only consider objects with $eval
const evalSchema = (object: any, context: { [key: string]: any }) => {
	if (!object) {
		return object;
	}

	if (object.$eval) {
		return jsone(object, context);
	}

	if (object.$id) {
		Reflect.deleteProperty(object, '$id');
	}

	for (const key of Object.keys(object)) {
		// For performance reasons
		// eslint-disable-next-line lodash/prefer-lodash-typecheck
		if (typeof object[key] !== 'object') {
			continue;
		}

		object[key] = evalSchema(object[key], context);
	}

	return object;
};

const getActorMask = async (
	context: Context,
	backend: DatabaseBackend,
	actor: Contract,
	scope: JsonSchema = {},
): Promise<JsonSchema> => {
	const permissionFilters = await getRoleViews(context, backend, actor);

	let actorPermissionMask = await applyMarkers(context, backend, actor, {
		type: 'object',
		// At least one permission must match
		anyOf: permissionFilters.map((object) => {
			return evalSchema(object, {
				// TODO: Update views to interpolate "actor" instead of "user"
				user: actor,
			});
		}),
	});

	// Apply session scope to mask
	if (!_.isEmpty(scope)) {
		actorPermissionMask = jsonSchema.merge([
			actorPermissionMask as any,
			scope as any,
		]) as JsonSchema;
	}

	return actorPermissionMask;
};

/**
 * @summary Get the permissions mask for an actor
 * @function
 * @public
 *
 * @param {Object} context - execution context
 * @param {Object} backend - backend
 * @param {String} actorId - actor id
 * @returns {Object} mask
 */
export const getMask = async (
	context: Context,
	backend: DatabaseBackend,
	actorId: string,
) => {
	const actor = await backend.getElementById(context, actorId);
	return getActorMask(context, backend, actor);
};

// Recursively applies permission mask to $$links queries, ensuring
// one can't "escape" permissions using a relational query.
const mergeMaskInLinks = (schema: JsonSchema, mask: JsonSchema) => {
	if (Array.isArray(schema)) {
		for (const item of schema) {
			mergeMaskInLinks(item, mask);
		}
	}

	if (!_.isPlainObject(schema)) {
		return;
	}

	if (schema instanceof Object) {
		if ('$$links' in schema) {
			const links = schema.$$links!;
			for (const [linkType, linkSchema] of Object.entries(links)) {
				mergeMaskInLinks(linkSchema, mask);
				links[linkType] = jsonSchema.merge([
					mask as any,
					linkSchema as any,
				]) as JsonSchema;
			}
		}

		if ('properties' in schema) {
			for (const propertySchema of Object.values(schema.properties!)) {
				mergeMaskInLinks(propertySchema, mask);
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
				mergeMaskInLinks(
					schema[keyWithSubSchema as keyof JsonSchema] as JsonSchema,
					mask,
				);
			}
		}
	}
};

/**
 * @summary Get a final filtered query
 * @function
 * @public
 *
 * @param {Object} context - execution context
 * @param {Object} backend - backend
 * @param {String} actorId - actor id
 * @param {Object} schema - query schema
 * @returns {Promise<JsonSchema>} query
 */
export const getQuery = async (
	context: Context,
	backend: DatabaseBackend,
	actorId: string,
	schema: JsonSchema,
): Promise<JsonSchema> => {
	const actor = await backend.getElementById(context, actorId);

	const mask = await getActorMask(context, backend, actor);

	// Apply permission mask to links, recursively
	mergeMaskInLinks(schema, mask);

	return jsonSchema.merge([
		mask,
		evalSchema(schema, {
			// TODO: Update views to interpolate "actor" instead of "user"
			user: actor,
		}),
	]) as JsonSchema;
};
