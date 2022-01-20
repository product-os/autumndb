import { ViewContract } from '@balena/jellyfish-types/build/core';
import * as _ from 'lodash';
import { testUtils } from '../../../lib';

let ctx: testUtils.TestContext;
let user: any;
let userSession: any;

beforeAll(async () => {
	ctx = await testUtils.newContext();

	const username = testUtils.generateRandomId();
	user = await ctx.kernel.insertContract(
		ctx.logContext,
		ctx.kernel.adminSession()!,
		{
			type: 'user@1.0.0',
			slug: `user-${username}`,
			data: {
				email: `${username}@example.com`,
				hash: 'foobar',
				roles: ['user-community'],
			},
		},
	);

	userSession = await ctx.kernel.insertContract(
		ctx.logContext,
		ctx.kernel.adminSession()!,
		{
			type: 'session@1.0.0',
			slug: `session-${user.slug}-${testUtils.generateRandomId()}`,
			data: {
				actor: user.id,
			},
		},
	);
});

afterAll(() => {
	return testUtils.destroyContext(ctx);
});

describe('role-user-community', () => {
	it('users should be able to query views', async () => {
		expect(user.data.roles).toEqual(['user-community']);

		await ctx.kernel.insertContract<ViewContract>(
			ctx.logContext,
			ctx.kernel.adminSession()!,
			{
				type: 'view@1.0.0',
				slug: 'view-foobar',
				name: 'foobar view',
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
		expect(_.includes(_.map(results, 'slug'), 'view-foobar')).toBe(true);
	});
});
