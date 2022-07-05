import * as _ from 'lodash';
import type { DatabaseBackend } from '../backend/postgres/types';
import type { Context } from '../context';
import jsonSchema from '../json-schema';
import { resolveMarkerBasedAuthorizationSchema } from './markers';
import { resolveRoleBasedAuthorizationSchema } from './roles';
import type { Contract, JsonSchema } from '../types';
import {
	applyAuthorizationSchemaToLinks,
	evaluateSchemaWithContext,
} from './utils';

/**
 * @summary Resolves the authorization schema for a given actor and scope.
 * @function
 * @public
 *
 * @param {Object} context - execution context
 * @param {Object} backend - backend
 * @param {Object} actor - actor contract
 * @param {Object} scope - optional scope
 * @returns {Object} permission schema
 */
export const resolveAuthorizationSchema = async (
	context: Context,
	backend: DatabaseBackend,
	actor: Contract,
	scope: JsonSchema = {},
): Promise<JsonSchema> => {
	const roleBasedAuthorizationSchema =
		await resolveRoleBasedAuthorizationSchema(context, backend, actor);

	const markerBasedAuthorizationSchema =
		await resolveMarkerBasedAuthorizationSchema(context, backend, actor);

	let authorizationSchema = jsonSchema.merge([
		roleBasedAuthorizationSchema as any,
		markerBasedAuthorizationSchema as any,
	]) as JsonSchema;

	// Apply scope if given
	if (!_.isEmpty(scope)) {
		authorizationSchema = jsonSchema.merge([
			authorizationSchema as any,
			scope as any,
		]) as JsonSchema;
	}

	return authorizationSchema;
};

/**
 * @summary Return a JsonSchema query masked based on actor permissions and scope.
 * @function
 * @public
 *
 * @param {Object} context - execution context
 * @param {Object} backend - backend
 * @param {String} session - session id
 * @param {Object} schema - query schema
 * @returns {Promise<JsonSchema>} query
 */
export const authorizeQuery = async (
	context: Context,
	backend: DatabaseBackend,
	actor: Contract,
	scope: JsonSchema = {},
	querySchema: JsonSchema,
): Promise<JsonSchema> => {
	const authorizationSchema = await resolveAuthorizationSchema(
		context,
		backend,
		actor,
		scope,
	);

	applyAuthorizationSchemaToLinks(querySchema, authorizationSchema);

	const authorizedQuerySchema = jsonSchema.merge([
		authorizationSchema,
		evaluateSchemaWithContext(querySchema, {
			// TODO: Update views to interpolate "actor" instead of "user"
			user: actor,
		}),
	]) as JsonSchema;

	return authorizedQuerySchema;
};
