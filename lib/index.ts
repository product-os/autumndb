/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import { Kernel as CoreKernel } from './kernel';
import { backend as CoreBackend } from './backend';
import { Cache } from './cache';
import * as coreErrors from './errors';
import { CARDS } from './cards';
export * as cardMixins from './cards/mixins';

export const MemoryCache = Cache;
export const cards = CARDS;

exports.create = async (context: any, cache: any, options: any) => {
	const backend = new CoreBackend(cache, coreErrors, options.backend);
	const kernel = new CoreKernel(backend);
	await kernel.initialize(context);
	return kernel;
};

// TODO: A number of jellyfish modules import these objects from subpaths, which is an abomination.
// It also makes converting said modules to typescript much more difficult.
// Once everything is converted to typescript this situation needs to be straightened out.
export const Backend = CoreBackend;
export const errors = coreErrors;
export const Kernel = CoreKernel;
