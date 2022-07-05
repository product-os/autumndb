import * as _ from 'lodash';
import { testUtils } from '../../../lib';
import type { ViewContract } from '../../../lib/types';

let ctx: testUtils.TestContext;
let user: any;
let userSession: any;

beforeAll(async () => {
	ctx = await testUtils.newContext();

	user = await ctx.createUser(testUtils.generateRandomId());
	userSession = await ctx.createSession(user);
});

afterAll(() => {
	return testUtils.destroyContext(ctx);
});

describe('role-user-community', () => {
	it('users should be able to query views', async () => {
		expect(user.data.roles).toEqual(['user-community']);

		const view = await ctx.kernel.insertContract<ViewContract>(
			ctx.logContext,
			ctx.kernel.adminSession()!,
			{
				type: 'view@1.0.0',
				data: {
					actor: user.id,
				},
			},
		);

		const results = await ctx.kernel.query(ctx.logContext, userSession.id, {
			type: 'object',
			required: ['type', 'slug'],
			additionalProperties: true,
			properties: {
				type: {
					type: 'string',
					const: 'view@1.0.0',
				},
				slug: {
					type: 'string',
				},
			},
		});
		expect(_.includes(_.map(results, 'slug'), view.slug)).toBe(true);
	});

	it('users should not be able to view other users contracts', async () => {
		const otherUser = await ctx.createUser(testUtils.generateRandomId());
		expect(otherUser.data.roles).toEqual(['user-community']);
		const otherUserSession = await ctx.createSession(otherUser);

		const view = await ctx.kernel.insertContract<ViewContract>(
			ctx.logContext,
			ctx.kernel.adminSession()!,
			{
				type: 'view@1.0.0',
				data: {
					actor: user.id,
				},
				markers: [user.slug],
			},
		);

		const results = await ctx.kernel.getContractById(
			ctx.logContext,
			otherUserSession.id,
			view.id,
		);
		expect(results).toEqual(null);
	});
});
