/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import * as permissionFilter from '../../lib/permission-filter';
import * as errors from '../../lib/errors';
import * as helpers from './helpers';

let ctx: helpers.KernelContext;

beforeAll(async () => {
	ctx = await helpers.before();
});

afterAll(() => {
	return helpers.after(ctx);
});

describe('permission-filter', () => {
	describe('.getSessionActor()', () => {
		test('should throw if the session is invalid', async () => {
			await expect(
				permissionFilter.getSessionActor(
					ctx.context,
					ctx.backend,
					'4a962ad9-20b5-4dd8-a707-bf819593cc84',
				),
			).rejects.toThrow(errors.JellyfishInvalidSession);
		});

		test('should throw if the session actor is invalid', async () => {
			const session = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug: ctx.generateRandomSlug({
						prefix: 'session',
					}),
					type: 'session@1.0.0',
					version: '1.0.0',
					data: {
						actor: '4a962ad9-20b5-4dd8-a707-bf819593cc84',
					},
				},
			);

			await expect(
				permissionFilter.getSessionActor(ctx.context, ctx.backend, session.id),
			).rejects.toThrow(errors.JellyfishNoElement);
		});

		test('should get the session user and scope given the session did not expire', async () => {
			const result = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug: ctx.generateRandomSlug({
						prefix: 'user',
					}),
					type: 'user@1.0.0',
					version: '1.0.0',
					data: {
						email: 'johndoe@example.com',
						hash: 'PASSWORDLESS',
						roles: ['foo', 'bar'],
					},
				},
			);

			const date = new Date();
			date.setDate(date.getDate() + 1);
			const sessionScope = {
				type: 'object',
				properties: {
					type: {
						anyOf: [
							{
								type: 'string',
								const: 'message@1.0.0',
							},
						],
					},
				},
			};

			const session = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug: ctx.generateRandomSlug({
						prefix: 'session',
					}),
					type: 'session@1.0.0',
					version: '1.0.0',
					data: {
						actor: result.id,
						expiration: date.toISOString(),
						scope: sessionScope,
					},
				},
			);

			const { actor, scope } = await permissionFilter.getSessionActor(
				ctx.context,
				ctx.backend,
				session.id,
			);

			expect(actor).toEqual(
				Object.assign(
					{
						id: result.id,
					},
					actor,
				),
			);
			expect(scope).toEqual(sessionScope);
		});

		test('should throw if the session expired', async () => {
			const user = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug: ctx.generateRandomSlug({
						prefix: 'user',
					}),
					type: 'user@1.0.0',
					version: '1.0.0',
					data: {
						email: 'johndoe@example.com',
						hash: 'PASSWORDLESS',
						roles: ['foo', 'bar'],
					},
				},
			);

			const date = new Date();
			date.setDate(date.getDate() - 1);

			const session = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug: ctx.generateRandomSlug({
						prefix: 'session',
					}),
					type: 'session@1.0.0',
					version: '1.0.0',
					data: {
						actor: user.id,
						expiration: date.toISOString(),
					},
				},
			);

			await expect(
				permissionFilter.getSessionActor(ctx.context, ctx.backend, session.id),
			).rejects.toThrow(errors.JellyfishSessionExpired);
		});
	});
});
