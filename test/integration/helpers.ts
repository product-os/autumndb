/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import * as helpers from './backend/helpers';
import { Kernel } from '../../lib/kernel';

export interface KernelContext extends helpers.BackendContext {
	kernel: Kernel;
}

export const before = async (
	options: { suffix?: string; skipConnect?: boolean } = {},
): Promise<KernelContext> => {
	const ctx: helpers.BackendContext & Partial<KernelContext> =
		await helpers.before({
			skipConnect: true,
			suffix: options.suffix,
		});

	if (options.suffix) {
		await ctx.backend.connect(ctx.context);
		await ctx.backend.reset(ctx.context);
	}

	ctx.kernel = new Kernel(ctx.backend);
	await ctx.kernel.initialize(ctx.context);

	return ctx as KernelContext;
};

export const after = async (ctx: KernelContext) => {
	await ctx.backend.drop(ctx.context);
	await ctx.kernel.disconnect(ctx.context);
	await helpers.after(ctx);
};
