import type { Contract } from '@balena/jellyfish-types/build/core';
import type { DatabaseBackend } from '../backend/postgres/types';
import type { Context } from '../context';
import type { JsonSchema } from '@balena/jellyfish-types';
import { evaluateSchemaWithContext } from './utils';

/**
 * @summary Get an array containing authorization schemas for each of the actor's roles.
 * @function
 * @private
 *
 * @param {Object} context - execution context
 * @param {Object} backend - backend
 * @param {Object} actor - actor contract
 * @returns {Object} role-based authorization schema
 */
export const resolveRoleBasedAuthorizationSchema = async (
	context: Context,
	backend: DatabaseBackend,
	actor: Contract,
): Promise<JsonSchema> => {
	const authorizationSchemas: JsonSchema[] = [];

	const actorRoleSlugs: string[] = (actor.data?.roles as string[]) || [];

	for (const roleSlug of [actor.slug, ...actorRoleSlugs]) {
		const roleContract = await backend.getElementBySlug(
			context,
			`role-${roleSlug}@1.0.0`,
		);

		if (!roleContract) {
			continue;
		}

		authorizationSchemas.push(roleContract.data.read);
	}

	// A default schema that will not match anything
	if (authorizationSchemas.length === 0) {
		authorizationSchemas.push({ type: 'null' });
	}

	return {
		type: 'object',
		// At least one permission must match
		anyOf: authorizationSchemas.map((el) => {
			return evaluateSchemaWithContext(el, {
				// TODO: Update views to interpolate "actor" instead of "user"
				user: actor,
			});
		}),
	} as any;
};
