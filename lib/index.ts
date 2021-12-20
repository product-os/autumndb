import { LogContext } from '@balena/jellyfish-logger';
import { Cache as MemoryCache } from './cache';
import { CARDS } from './cards';
import { backend as CoreBackend, PostgresBackendOptions } from './backend';
import * as coreErrors from './errors';
import { Kernel as CoreKernel } from './kernel';

export * as cardMixins from './cards/mixins';
export {
	CoreBackend,
	coreErrors,
	CoreKernel,
	MemoryCache,
	PostgresBackendOptions,
};

export const cards = CARDS;

export const create = async (
	logContext: LogContext,
	cache: MemoryCache | null,
	options: PostgresBackendOptions,
) => {
	const backend = new CoreBackend(cache, coreErrors, options);
	const kernel = new CoreKernel(backend);
	await kernel.initialize(logContext);
	return kernel;
};
