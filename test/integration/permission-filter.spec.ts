import { Context } from '../../lib/context';
import * as permissionFilter from '../../lib/permission-filter';
import { testUtils } from '../../lib';
import * as errors from '../../lib/errors';

let ctx: testUtils.TestContext;

beforeAll(async () => {
	ctx = await testUtils.newContext();
});

afterAll(async () => {
	await testUtils.destroyContext(ctx);
});

describe('permission-filter', () => {
	describe('.getSessionActor()', () => {
		test('should throw if the session is invalid', async () => {
			await expect(
				permissionFilter.getSessionActor(
					new Context(ctx.logContext),
					ctx.kernel.backend,
					'4a962ad9-20b5-4dd8-a707-bf819593cc84',
				),
			).rejects.toThrow(errors.JellyfishInvalidSession);
		});

		test('should throw if the session actor is invalid', async () => {
			const session = await ctx.kernel.insertCard(
				ctx.logContext,
				ctx.kernel.sessions!.admin,
				{
					slug: testUtils.generateRandomSlug({
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
				permissionFilter.getSessionActor(
					new Context(ctx.logContext),
					ctx.kernel.backend,
					session.id,
				),
			).rejects.toThrow(errors.JellyfishNoElement);
		});

		test('should get the session user and scope given the session did not expire', async () => {
			const result = await ctx.kernel.insertCard(
				ctx.logContext,
				ctx.kernel.sessions!.admin,
				{
					slug: testUtils.generateRandomSlug({
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
				ctx.logContext,
				ctx.kernel.sessions!.admin,
				{
					slug: testUtils.generateRandomSlug({
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
				new Context(ctx.logContext),
				ctx.kernel.backend,
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
				ctx.logContext,
				ctx.kernel.sessions!.admin,
				{
					slug: testUtils.generateRandomSlug({
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
				ctx.logContext,
				ctx.kernel.sessions!.admin,
				{
					slug: testUtils.generateRandomSlug({
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
				permissionFilter.getSessionActor(
					new Context(ctx.logContext),
					ctx.kernel.backend,
					session.id,
				),
			).rejects.toThrow(errors.JellyfishSessionExpired);
		});

		test('should throw if the session has been deleted', async () => {
			const user = await ctx.kernel.insertCard(
				ctx.logContext,
				ctx.kernel.sessions!.admin,
				{
					slug: testUtils.generateRandomSlug({
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

			const session = await ctx.kernel.insertCard(
				ctx.logContext,
				ctx.kernel.sessions!.admin,
				{
					slug: testUtils.generateRandomSlug({
						prefix: 'session-delete-test',
					}),
					active: false,
					type: 'session@1.0.0',
					version: '1.0.0',
					data: {
						actor: user.id,
					},
				},
			);

			await expect(
				permissionFilter.getSessionActor(
					new Context(ctx.logContext),
					ctx.kernel.backend,
					session.id,
				),
			).rejects.toThrow();
		});
	});
});
