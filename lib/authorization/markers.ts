import type { JsonSchema } from '@balena/jellyfish-types';
import type { Contract } from '@balena/jellyfish-types/build/core';
import * as _ from 'lodash';
import type { DatabaseBackend } from '../backend/postgres/types';
import type { Context } from '../context';
import { CONTRACTS } from '../contracts';

export const resolveMarkerBasedAuthorizationSchema = async (
	context: Context,
	backend: DatabaseBackend,
	actor: Contract,
): Promise<JsonSchema> => {
	// TODO: Rewrite this without hardcoding the admin user slug.
	if (actor.slug === CONTRACTS['user-admin'].slug) {
		return {};
	}

	const actorOrganizations = await backend.query(
		context,
		{
			slug: {},
		},
		{
			type: 'object',
			$$links: {
				'has member': {
					type: 'object',
					properties: {
						id: {
							type: 'string',
							const: actor.id,
						},
						additionalProperties: false,
					},
				},
			},
			properties: {
				type: {
					type: 'string',
					const: 'org@1.0.0',
				},
			},
			additionalProperties: false,
		},
	);

	const markers = _.uniq(
		[actor, ...actorOrganizations].map((contract) => {
			return contract.slug;
		}),
	);

	const markerBasedAuthorizationSchema: JsonSchema = {
		type: 'object',
		properties: {
			markers:
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
					  },
		},
	};

	return markerBasedAuthorizationSchema;
};
