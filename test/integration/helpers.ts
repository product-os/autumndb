import { defaultEnvironment } from '@balena/jellyfish-environment';
import type { LogContext } from '@balena/jellyfish-logger';
import { v4 as uuid } from 'uuid';
import { generateRandomSlug, generateRandomID } from './backend/helpers';
import { Cache } from '../../lib/cache';
import { Kernel } from '../../lib/kernel';

export interface CoreTestContext {
	logContext: LogContext;
	cache: Cache;
	kernel: Kernel;
	generateRandomSlug: typeof generateRandomSlug;
	generateRandomID: typeof generateRandomID;
}

export const before = async (
	options: { suffix?: string; skipConnect?: boolean } = {},
): Promise<CoreTestContext> => {
	const suffix = options.suffix || uuid();
	const dbName = `test_${suffix.replace(/-/g, '_')}`;

	const cache = new Cache(
		Object.assign({}, defaultEnvironment.redis, {
			namespace: dbName,
		} as any),
	);
	await cache.connect();

	const logContext = { id: `CORE-TEST-${uuid()}` };

	const kernel = await Kernel.withPostgres(
		logContext,
		cache,
		Object.assign({}, defaultEnvironment.database.options, {
			database: dbName,
		}),
	);

	return {
		logContext,
		cache,
		kernel,
		generateRandomID,
		generateRandomSlug,
	};
};

export const after = async (context: CoreTestContext) => {
	await context.kernel.drop(context.logContext);
	await context.kernel.disconnect(context.logContext);
	await context.cache.disconnect();
};
