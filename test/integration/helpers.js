/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const {
	v4: uuid
} = require('uuid')
const helpers = require('./backend/helpers')
const Kernel = require('../../lib/kernel')

exports.generateRandomID = () => {
	return uuid()
}

exports.generateRandomSlug = (options = {}) => {
	const slug = exports.generateRandomID()
	if (options.prefix) {
		return `${options.prefix}-${slug}`
	}

	return slug
}

exports.before = async (test, options = {}) => {
	await helpers.before(test, {
		skipConnect: true,
		suffix: options.suffix
	})

	if (options.suffix) {
		await test.context.backend.connect(test.context.context)
		await test.context.backend.reset(test.context.context)
	}

	test.context.kernel = new Kernel(test.context.backend)
	await test.context.kernel.initialize(test.context.context)
	test.context.generateRandomSlug = exports.generateRandomSlug
}

exports.after = async (test) => {
	await test.context.backend.drop(test.context.context)
	await test.context.kernel.disconnect(test.context.context)
	await helpers.after(test)
}
