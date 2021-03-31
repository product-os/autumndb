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

ava('parseVersion should parse valid version strings', (test) => {
	test.deepEqual(utils.parseVersion('1.2.3'), {
		major: 1,
		minor: 2,
		patch: 3,
		prerelease: '',
		build: '',
		latest: false
	})

	// TODO: Add tests that include build and prerelease

	test.deepEqual(utils.parseVersion('latest'), {
		major: 0,
		minor: 0,
		patch: 0,
		prerelease: '',
		build: '',
		latest: true
	})

	test.deepEqual(utils.parseVersion('1.0.0-alpha'), {
		major: 1,
		minor: 0,
		patch: 0,
		prerelease: 'alpha',
		build: '',
		latest: false
	})

	test.deepEqual(utils.parseVersion('1.0.0-alpha+001'), {
		major: 1,
		minor: 0,
		patch: 0,
		prerelease: 'alpha',
		build: '001',
		latest: false
	})

	test.deepEqual(utils.parseVersion('1.0.0+001'), {
		major: 1,
		minor: 0,
		patch: 0,
		prerelease: '',
		build: '001',
		latest: false
	})
})

ava('parseVersion should default to 0.0.0@latest on empty version string', (test) => {
	test.deepEqual(utils.parseVersion(), {
		major: 0,
		minor: 0,
		patch: 0,
		prerelease: '',
		build: '',
		latest: true
	})
})

ava('parseVersion should throw an error on invalid version string', (test) => {
	test.throws(() => {
		utils.parseVersion('foobar')
	}, {
		message: 'slug version suffix is invalid: foobar'
	})
})

ava('parseVersionedSlug should parse valid versioned slug strings', (test) => {
	const base = 'card'
	test.deepEqual(utils.parseVersionedSlug(`${base}@1`), {
		base,
		major: 1,
		minor: 0,
		patch: 0,
		prerelease: '',
		build: '',
		latest: false
	})

	test.deepEqual(utils.parseVersionedSlug(`${base}@1.1`), {
		base,
		major: 1,
		minor: 1,
		patch: 0,
		prerelease: '',
		build: '',
		latest: false
	})

	test.deepEqual(utils.parseVersionedSlug(`${base}@1.2.3`), {
		base,
		major: 1,
		minor: 2,
		patch: 3,
		prerelease: '',
		build: '',
		latest: false
	})

	test.deepEqual(utils.parseVersionedSlug(`${base}@1.2.3-alpha`), {
		base,
		major: 1,
		minor: 2,
		patch: 3,
		prerelease: 'alpha',
		build: '',
		latest: false
	})

	test.deepEqual(utils.parseVersionedSlug(`${base}@1.2.3-alpha+rev1`), {
		base,
		major: 1,
		minor: 2,
		patch: 3,
		prerelease: 'alpha',
		build: 'rev1',
		latest: false
	})

	test.deepEqual(utils.parseVersionedSlug(`${base}@1.2.3+rev1`), {
		base,
		major: 1,
		minor: 2,
		patch: 3,
		prerelease: '',
		build: 'rev1',
		latest: false
	})

	test.deepEqual(utils.parseVersionedSlug(`${base}@latest`), {
		base,
		major: 0,
		minor: 0,
		patch: 0,
		prerelease: '',
		build: '',
		latest: true
	})
})

ava.only('parseVersionedSlug should be case insensitive', (test) => {
	test.notThrows(() => {
		utils.parseVersionedSlug('foo-BAR@1.0.0')
	})
})
