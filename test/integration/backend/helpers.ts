import { v4 as uuid } from 'uuid';
import { backend as Backend } from '../../../lib/backend';
import { defaultEnvironment as environment } from '@balena/jellyfish-environment';
import { Cache } from '../../../lib/cache';
import * as errors from '../../../lib/errors';
import { Context } from '../../../lib/context';
import { DatabaseBackend } from '../../../lib/backend/postgres/types';

export interface BackendContext {
	cache: Cache;
	context: Context;
	backend: DatabaseBackend;
	generateRandomSlug: typeof generateRandomSlug;
	generateRandomID: typeof generateRandomID;
}

export const generateRandomID = () => {
	return uuid();
};

export const generateRandomSlug = (options: { prefix?: string } = {}) => {
	const slug = generateRandomID();
	if (options.prefix) {
		return `${options.prefix}-${slug}`;
	}

	return slug;
};

export const before = async (
	options: { suffix?: string; skipConnect?: boolean } = {},
): Promise<BackendContext> => {
	const ctx: Partial<BackendContext> = {};

	const suffix = options.suffix || uuid();
	const dbName = `test_${suffix.replace(/-/g, '_')}`;

	ctx.cache = new Cache(
		// TS-TODO: Fix this weird error about the "port" option
		Object.assign({}, environment.redis, {
			namespace: dbName,
		} as any),
	);

	ctx.context = new Context({ id: `CORE-TEST-${uuid()}` });

	if (ctx.cache) {
		await ctx.cache.connect();
	}

	ctx.backend = new Backend(
		ctx.cache,
		errors,
		Object.assign({}, environment.database.options, {
			database: dbName,
		}),
	);

	ctx.generateRandomSlug = generateRandomSlug;
	ctx.generateRandomID = generateRandomID;

	if (options.skipConnect) {
		return ctx as BackendContext;
	}

	await ctx.backend.connect(ctx.context);

	return ctx as BackendContext;
};

export const after = async (ctx: BackendContext) => {
	/*
	 * We can just disconnect and not destroy the whole
	 * database as test databases are destroyed before
	 * the next test run anyways.
	 */
	await ctx.backend.disconnect(ctx.context);

	if (ctx.cache) {
		await ctx.cache.disconnect();
	}
};
