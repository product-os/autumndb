import { Kernel as CoreKernel } from './kernel';
import { backend as CoreBackend } from './backend';
import { Cache } from './cache';
import * as coreErrors from './errors';
import { CARDS } from './cards';

export * as cardMixins from './cards/mixins';
// TODO: why would external modules need to access the `BackendObject`?
export { CoreBackend, CoreKernel, coreErrors };

export const MemoryCache = Cache;
export const cards = CARDS;

export const create = async (context: any, cache: any, options: any) => {
	const backend = new CoreBackend(cache, coreErrors, options.backend);
	const kernel = new CoreKernel(backend);
	await kernel.initialize(context);
	return kernel;
};
