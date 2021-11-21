import * as helpers from './helpers';

let ctx: helpers.KernelContext;

/*
 * Tests in this spec file actively disconnect the server. As such they are
 * seperated from other kernel tests, as each test requires a new connection to
 * be established
 */
beforeEach(async () => {
	ctx = await helpers.before();
});

afterEach(() => {
	return helpers.after(ctx);
});

describe('Kernel', () => {
	describe('.disconnect()', () => {
		it('should be able to disconnect the kernel multiple times without errors', async () => {
			await expect(
				(async () => {
					await ctx.kernel.disconnect(ctx.context);
					await ctx.kernel.disconnect(ctx.context);
					await ctx.kernel.disconnect(ctx.context);
				})(),
			).resolves.not.toThrow();
		});

		it('.disconnect() should gracefully close streams', async () => {
			await expect(
				(async () => {
					await ctx.kernel.stream(ctx.context, ctx.kernel.sessions!.admin, {
						type: 'object',
					});
					await ctx.kernel.disconnect(ctx.context);
				})(),
			).resolves.not.toThrow();
		});
	});
});
