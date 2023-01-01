import { defaultEnvironment as environment } from '@balena/jellyfish-environment';
import { randomUUID } from 'node:crypto';
import { PostgresBackend } from '../../../lib/backend';
import type { DatabaseBackend } from '../../../lib/backend/postgres/types';
import { Cache } from '../../../lib/cache';
import { Context } from '../../../lib/context';

export interface BackendContext {
	cache: Cache;
	context: Context;
	backend: DatabaseBackend;
	generateRandomSlug: typeof generateRandomSlug;
	generateRandomID: typeof generateRandomID;
}

export const generateRandomID = () => {
	return randomUUID();
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

	const suffix = options.suffix || randomUUID();
	const dbName = `test_${suffix.replace(/-/g, '_')}`;

	ctx.cache = new Cache(
		// TS-TODO: Fix this weird error about the "port" option
		Object.assign({}, environment.redis, {
			namespace: dbName,
		} as any),
	);

	if (ctx.cache) {
		await ctx.cache.connect();
	}

	const dbOptions = Object.assign({}, environment.database.options, {
		database: dbName,
	});

	ctx.backend = new PostgresBackend(ctx.cache, dbOptions);

	ctx.context = new Context({ id: `CORE-TEST-${randomUUID()}` }, ctx.backend);

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
