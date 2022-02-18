import type { JsonSchema } from '@balena/jellyfish-types';
import type { Contract } from '@balena/jellyfish-types/build/core';
import * as _ from 'lodash';
import type { DatabaseBackend } from '../backend/postgres/types';
import type { Context } from '../context';
import { resolveMarkerBasedAuthorizationSchema } from './markers';
import { resolveRoleBasedAuthorizationSchema } from './roles';
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
	const authorizationSchemaParts = await Promise.all([
		resolveRoleBasedAuthorizationSchema(context, backend, actor),
		resolveMarkerBasedAuthorizationSchema(context, backend, actor),
	]);

	// Apply scope if given
	if (!_.isEmpty(scope)) {
		authorizationSchemaParts.push(scope);
	}

	return { allOf: authorizationSchemaParts };
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

	const authorizedQuerySchema = {
		allOf: [
			authorizationSchema,
			evaluateSchemaWithContext(querySchema, {
				// TODO: Update views to interpolate "actor" instead of "user"
				user: actor,
			}),
		],
	};

	return authorizedQuerySchema;
};
