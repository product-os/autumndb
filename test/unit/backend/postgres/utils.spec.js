/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const ava = require('ava')
const utils = require('../../../../lib/backend/postgres/utils')
const {
	v4: uuid
} = require('uuid')

ava.before((test) => {
	test.context.context = {
		id: `UNIT-TEST-${uuid()}`
	}
})

ava('isIgnorableInitError should return true for expected codes', (test) => {
	test.truthy(utils.isIgnorableInitError('23505'))
	test.truthy(utils.isIgnorableInitError('42P07'))
})

ava('isIgnorableInitError should return false for unexpected codes', (test) => {
	test.falsy(utils.isIgnorableInitError('08000'))
})
