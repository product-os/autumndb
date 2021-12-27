import * as helpers from './helpers';

let ctx: helpers.CoreTestContext;

/*
 * Tests in this spec file actively disconnect the server. As such they are
 * seperated from other kernel tests, as each test requires a new connection to
 * be established
 */
beforeEach(async () => {
	ctx = await helpers.before();
});

afterEach(async () => {
	await helpers.after(ctx);
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
