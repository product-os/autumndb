import * as _ from 'lodash';
import { testUtils } from '../../../lib';
import type { UserContract, ViewContract } from '../../../lib/types';

let ctx: testUtils.TestContext;
let user: UserContract;

beforeAll(async () => {
	ctx = await testUtils.newContext();

	user = await ctx.createUser(testUtils.generateRandomId());
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

		const results = await ctx.kernel.query(
			ctx.logContext,
			{ actor: user },
			{
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
			},
		);
		expect(_.includes(_.map(results, 'slug'), view.slug)).toBe(true);
	});

	it('users should not be able to view other users contracts', async () => {
		const otherUser = await ctx.createUser(testUtils.generateRandomId());
		expect(otherUser.data.roles).toEqual(['user-community']);

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
			{ actor: otherUser },
			view.id,
		);
		expect(results).toEqual(null);
	});
});
