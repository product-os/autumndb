import type { DatabaseBackend } from './backend/postgres/types';
import type { Context } from './context';
import { CONTRACTS } from './contracts';
import * as errors from './errors';
import type { Contract, JsonSchema, ViewContract } from './types';
import { getViewContractSchema } from './views';

/**
 * @summary Resolve the actor and scope associated with a session ID.
 * @function
 * @private
 *
 * @param {Object} context - execution context
 * @param {Object} backend - backend
 * @param {String} sessionId - session id
 * @returns {Object} sessionActorAndScope - actor contract and session scope
 * @returns {Object} sessionActorAndScope.actor - the actor contract
 * @returns {Object} sessionActorAndScope.scope - the session scope
 */
export const resolveActorAndScopeFromSessionId = async (
	context: Context,
	backend: DatabaseBackend,
	sessionId: string,
): Promise<{ actor: Contract; scope: JsonSchema }> => {
	const sessionContract = await backend.getElementById(context, sessionId);

	context.assertUser(
		sessionContract,
		errors.JellyfishInvalidSession,
		`Invalid session ID: ${sessionId}`,
	);

	// Don't allow inactive sessions to be used
	context.assertUser(
		sessionContract.active,
		errors.JellyfishInvalidSession,
		`Invalid session ID: ${sessionId}`,
	);

	context.assertUser(
		!sessionContract.data.expiration ||
			new Date() <= new Date(sessionContract.data.expiration),
		errors.JellyfishSessionExpired,
		`Session expired at: ${sessionContract.data.expiration}`,
	);

	const actor = await backend.getElementById(
		context,
		sessionContract.data.actor,
	);

	context.assertInternal(
		actor,
		errors.JellyfishNoElement,
		`Invalid actor: ${sessionContract.data.actor}`,
	);

	return {
		actor,
		scope: sessionContract.data.scope || {},
	};
};

// TODO: make name more descriptive
export const preprocessQuerySchema = async (
	schema: JsonSchema | ViewContract,
): Promise<JsonSchema> => {
	if (
		schema instanceof Object &&
		schema.type === `${CONTRACTS['view'].slug}@${CONTRACTS['view'].version}`
	) {
		schema = getViewContractSchema(schema as ViewContract)!;
	}

	return schema as JsonSchema;
};
