/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const ava = require('ava')
const helpers = require('../helpers')
const cards = require('../../../../lib/backend/postgres/cards')
const utils = require('../../../../lib/backend/postgres/utils')

ava.serial.before(helpers.before)
ava.serial.after(helpers.after)

ava('.createIndexConcurrently() should create indexes', async (test) => {
	const name = `${test.context.generateRandomSlug().replace(/-/g, '_')}_idx`
	await utils.createIndexConcurrently(test.context.context, test.context.backend.connection, cards.TABLE, name,
		'USING btree (updated_at)')

	const index = await test.context.backend.connection.one(`SELECT EXISTS (SELECT FROM pg_indexes WHERE indexname='${name}')`)
	test.truthy(index.exists)
})
