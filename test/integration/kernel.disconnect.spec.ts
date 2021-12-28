import { testUtils } from '../../lib';

let ctx: testUtils.TestContext;

beforeAll(async () => {
	ctx = await testUtils.newContext();
});

afterAll(async () => {
	await testUtils.destroyContext(ctx);
});

describe('Kernel', () => {
	describe('.disconnect()', () => {
		it('should be able to disconnect the kernel multiple times without errors', async () => {
			await expect(
				(async () => {
					await ctx.kernel.disconnect(ctx.logContext);
					await ctx.kernel.disconnect(ctx.logContext);
					await ctx.kernel.disconnect(ctx.logContext);
				})(),
			).resolves.not.toThrow();
		});

		it('.disconnect() should gracefully close streams', async () => {
			await expect(
				(async () => {
					await ctx.kernel.stream(ctx.logContext, ctx.kernel.sessions!.admin, {
						type: 'object',
					});
					await ctx.kernel.disconnect(ctx.logContext);
				})(),
			).resolves.not.toThrow();
		});
	});
});
