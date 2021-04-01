/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const {
	v4: uuid
} = require('uuid')
const Backend = require('../../../lib/backend')
const environment = require('@balena/jellyfish-environment').defaultEnvironment
const Cache = require('../../../lib/cache')
const errors = require('../../../lib/errors')
const helpers = require('../helpers')

exports.before = async (test, options = {}) => {
	const suffix = options.suffix || uuid()
	const dbName = `test_${suffix.replace(/-/g, '_')}`

	test.context.cache = new Cache(
		Object.assign({}, environment.redis, {
			namespace: dbName
		}))

	test.context.context = {
		id: `CORE-TEST-${uuid()}`
	}

	if (test.context.cache) {
		await test.context.cache.connect(test.context.context)
	}

	test.context.backend = new Backend(
		test.context.cache,
		errors,
		Object.assign({}, environment.database.options, {
			database: dbName
		}))

	if (options.skipConnect) {
		return
	}

	await test.context.backend.connect(test.context.context)
	test.context.generateRandomSlug = helpers.generateRandomSlug
	test.context.generateRandomID = helpers.generateRandomID
}

exports.after = async (test) => {
	/*
	 * We can just disconnect and not destroy the whole
	 * database as test databases are destroyed before
	 * the next test run anyways.
	 */
	await test.context.backend.disconnect(test.context.context)

	if (test.context.cache) {
		await test.context.cache.disconnect()
	}
}
