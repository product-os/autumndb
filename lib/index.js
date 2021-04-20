/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const Kernel = require('./kernel')
const Backend = require('./backend')
const Cache = require('./cache')
const errors = require('./errors')
const cards = require('./cards')
const cardMixins = require('./cards/mixins')

exports.MemoryCache = Cache
exports.cards = cards
exports.cardMixins = cardMixins

exports.create = async (context, cache, options) => {
	const backend = new Backend(cache, errors, options.backend)
	const kernel = new Kernel(backend)
	await kernel.initialize(context)
	return kernel
}

// TODO: A number of jellyfish modules import these objects from subpaths, which is an abomination.
// It also makes converting said modules to typescript much more difficult.
// Once everything is converted to typescript this situation needs to be straightened out.
exports.Backend = Backend
exports.errors = errors
exports.Kernel = Kernel
