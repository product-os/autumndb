import jsone = require('json-e');
import * as _ from 'lodash';
import { Context } from './context';
import jsonSchema from './json-schema';
import * as errors from './errors';
import { CARDS } from './cards';
import { Contract } from '@balena/jellyfish-types/build/core';
import { DatabaseBackend } from './backend/postgres/types';
import { JSONSchema } from '@balena/jellyfish-types';

const CARD_CARD_TYPE = `${CARDS.card.slug}@${CARDS.card.version}`;
const VERSIONED_CARDS = _.mapKeys(CARDS, (value: any, key: any) => {
	return `${key}@${value.version}`;
});

const applyMarkers = async (
	context: Context,
	backend: DatabaseBackend,
	actor: Contract,
	schema: JSONSchema,
) => {
	// TODO: Find a way to implement this logic without
	// hardcoding the admin user
	if (actor.slug === CARDS['user-admin'].slug) {
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
		[actor, ...orgs].map((card) => {
			return card.slug;
		}),
	);

	const markersQuery =
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

	// The markers must match
	if (schema.properties && schema.properties.markers) {
		schema.allOf = schema.allOf || [];
		schema.allOf.push({
			type: 'object',
			required: ['markers'],
			properties: {
				markers: markersQuery,
			},
		} as any);
	} else {
		schema.properties = schema.properties || {};
		(schema as any).properties.markers = markersQuery;
	}

	return schema;
};

/**
 * @summary Upsert a card in an unsafe way (DANGEROUS)
 * @function
 * @public
 *
 * @description
 * This bypasses the whole permission system, so use with care.
 *
 * This function has the added limitation that you can only insert
 * cards of types that are defined in the Jellyfish core.
 *
 * @param {Object} context - exectuion context
 * @param {Object} backend - backend
 * @param {Object} card - card
 * @returns {Object} card
 *
 * @example
 * const card = await permissionFilter.unsafeUpsertCard(backend, {
 *   type: 'foo',
 *   links: {},
 *   requires: [],
 *   capabilities: [],
 *   tags: [],
 *   active: true,
 *   data: {
 *     foo: 'bar'
 *   }
 * })
 *
 * console.log(card.id)
 */
export const unsafeUpsertCard = async (
	context: Context,
	backend: DatabaseBackend,
	card: Contract,
) => {
	jsonSchema.validate(VERSIONED_CARDS[CARD_CARD_TYPE].data.schema as any, card);
	jsonSchema.validate(VERSIONED_CARDS[card.type].data.schema as any, card);
	return backend.upsertElement(context, card);
};

/**
 * @summary Get the actor that corresponds to a session
 * @function
 * @private
 *
 * @param {Object} context - execution context
 * @param {Object} backend - backend
 * @param {String} session - session id
 * @returns {Object} sessionActor - actor card and session scope
 * @returns {Object} sessionActor.actor - the actor card
 * @returns {Object} sessionActor.scope - the session scope
 */
export const getSessionActor = async (
	context: Context,
	backend: DatabaseBackend,
	session: string,
) => {
	const sessionCard = await backend.getElementById(context, session);

	context.assertUser(
		sessionCard,
		errors.JellyfishInvalidSession,
		`Invalid session: ${session}`,
	);

	// Don't allow inactive sessions to be used
	context.assertUser(
		sessionCard.active,
		errors.JellyfishInvalidSession,
		`Invalid session: ${session}`,
	);

	context.assertUser(
		!sessionCard.data.expiration ||
			new Date() <= new Date(sessionCard.data.expiration),
		errors.JellyfishSessionExpired,
		`Session expired at: ${sessionCard.data.expiration}`,
	);

	const actor = await backend.getElementById(context, sessionCard.data.actor);

	context.assertInternal(
		actor,
		errors.JellyfishNoElement,
		`Invalid actor: ${sessionCard.data.actor}`,
	);

	return {
		actor,
		scope: sessionCard.data.scope || {},
	};
};

/**
 * @summary Get the filter schemas for the actor's roles
 * @function
 * @private
 *
 * @param {Object} context - execution context
 * @param {Object} backend - backend
 * @param {Object} actor - actor card
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
		const roleCard = await backend.getElementBySlug(
			context,
			`role-${role}@1.0.0`,
		);

		if (!roleCard) {
			continue;
		}

		viewSchemas.push(roleCard.data.read);
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
	scope: JSONSchema = {},
) => {
	const permissionFilters = await getRoleViews(context, backend, actor);
	let mask = await applyMarkers(context, backend, actor, {
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
		mask = jsonSchema.merge([mask as any, scope as any]) as JSONSchema;
	}

	return mask;
};

/**
 * @summary Get the permissions mask for an actor
 * @function
 * @public
 *
 * @param {Object} context - execution context
 * @param {Object} backend - backend
 * @param {String} session - session id
 * @returns {Object} mask
 */
export const getMask = async (
	context: Context,
	backend: DatabaseBackend,
	session: string,
) => {
	const { actor, scope } = await getSessionActor(context, backend, session);
	return getActorMask(context, backend, actor, scope);
};

// Recursively applies permission mask to $$links queries, ensuring you can't "escape"
// permissions using a relational query.
const mergeMaskInLinks = (schema: JSONSchema, mask: JSONSchema) => {
	if (Array.isArray(schema)) {
		for (const item of schema) {
			mergeMaskInLinks(item, mask);
		}
	}

	if (!_.isPlainObject(schema)) {
		return;
	}

	if ('$$links' in schema) {
		const links = schema.$$links!;
		for (const [linkType, linkSchema] of Object.entries(links)) {
			mergeMaskInLinks(linkSchema, mask);
			links[linkType] = jsonSchema.merge([
				mask as any,
				linkSchema as any,
			]) as JSONSchema;
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
				schema[keyWithSubSchema as keyof JSONSchema] as JSONSchema,
				mask,
			);
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
 * @param {String} session - session id
 * @param {Object} schema - query schema
 * @returns {Promise<JSONSchema>} query
 */
export const getQuery = async (
	context: Context,
	backend: DatabaseBackend,
	session: string,
	schema: JSONSchema,
): Promise<JSONSchema> => {
	const { actor, scope } = await getSessionActor(context, backend, session);
	const mask = await getActorMask(context, backend, actor, scope);

	// Apply permission mask to links, recursively
	mergeMaskInLinks(schema, mask);

	return jsonSchema.merge([
		mask,
		evalSchema(schema, {
			// TODO: Update views to interpolate "actor" instead of "user"
			user: actor,
		}),
	]) as JSONSchema;
};
