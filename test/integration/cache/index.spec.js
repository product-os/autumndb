/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const ava = require('ava')
const helpers = require('../helpers')

ava.serial.after(helpers.after)
ava.serial.before(helpers.before)

ava('.set() should be able to retrieve item by id', async (test) => {
	const element1 = {
		id: helpers.generateRandomID(),
		version: '1.0.0',
		slug: helpers.generateRandomSlug()
	}

	await test.context.cache.set('test', element1)

	const el = await test.context.cache.getById('test', element1.id)

	test.deepEqual(element1, el.element)
})

ava('.set() should be able to retrieve item by slug', async (test) => {
	const element1 = {
		id: helpers.generateRandomID(),
		version: '1.0.0',
		slug: helpers.generateRandomSlug()
	}

	await test.context.cache.set('test', element1)

	const el = await test.context.cache.getBySlug(
		'test', element1.slug, element1.version)

	test.deepEqual(element1, el.element)
})

ava('.set() should not be able to retrieve item by slug given the wrong version', async (test) => {
	const element1 = {
		id: helpers.generateRandomID(),
		version: '1.0.0',
		slug: helpers.generateRandomSlug()
	}

	await test.context.cache.set('test', element1)

	const el = await test.context.cache.getBySlug(
		'test', element1.slug, '2.0.0')

	test.falsy(el.hit)
	test.falsy(el.element)
})

ava('.setMissingId() should prevent card from being fetched by ID', async (test) => {
	const element1 = {
		id: helpers.generateRandomID(),
		version: '1.0.0',
		slug: helpers.generateRandomSlug()
	}

	await test.context.cache.set('test', element1)
	await test.context.cache.setMissingId('test', element1.id)
	const el = await test.context.cache.getById('test', element1.id)

	test.truthy(el.hit)
	test.falsy(el.element)
})

ava('.setMissingSlug() should prevent card from being fetched by slug', async (test) => {
	const element1 = {
		id: helpers.generateRandomID(),
		version: '1.0.0',
		slug: helpers.generateRandomSlug()
	}

	await test.context.cache.set('test', element1)
	await test.context.cache.setMissingSlug(
		'test', element1.slug, element1.version)
	const el = await test.context.cache.getBySlug(
		'test', element1.slug, element1.version)

	test.truthy(el.hit)
	test.falsy(el.element)
})

ava('.setMissingSlug() should not prevent other versions from being fetched by slug', async (test) => {
	const element1 = {
		id: helpers.generateRandomID(),
		version: '1.0.0',
		slug: helpers.generateRandomSlug()
	}

	const element2 = {
		id: helpers.generateRandomID(),
		version: '1.0.1',
		slug: element1.slug
	}

	await test.context.cache.set('test', element1)
	await test.context.cache.set('test', element2)
	await test.context.cache.setMissingSlug(
		'test', element1.slug, element1.version)

	const result1 = await test.context.cache.getBySlug(
		'test', element2.slug, element2.version)
	test.truthy(result1.hit)
	test.deepEqual(result1.element, element2)

	const result2 = await test.context.cache.getBySlug(
		'test', element1.slug, element1.version)
	test.truthy(result2.hit)
	test.falsy(result2.element)
})

ava('.getById() should get the correct element', async (test) => {
	const element1 = {
		id: helpers.generateRandomID(),
		version: '1.0.0',
		slug: helpers.generateRandomSlug()
	}

	const element2 = {
		id: helpers.generateRandomID(),
		version: '1.0.0',
		slug: helpers.generateRandomSlug()
	}

	await test.context.cache.set('test', element1)
	await test.context.cache.set('test', element2)

	const el1 = await test.context.cache.getById('test', element1.id)
	const el2 = await test.context.cache.getById('test', element2.id)

	test.deepEqual(element1, el1.element)
	test.deepEqual(element2, el2.element)
})

ava('.getBySlug() should get the correct element', async (test) => {
	const element1 = {
		id: helpers.generateRandomID(),
		version: '1.0.0',
		slug: helpers.generateRandomSlug()
	}

	const element2 = {
		id: helpers.generateRandomID(),
		version: '1.0.0',
		slug: helpers.generateRandomSlug()
	}

	await test.context.cache.set('test', element1)
	await test.context.cache.set('test', element2)

	const el1 = await test.context.cache.getBySlug(
		'test', element1.slug, element1.version)
	const el2 = await test.context.cache.getBySlug(
		'test', element2.slug, element2.version)

	test.deepEqual(element1, el1.element)
	test.deepEqual(element2, el2.element)
})

ava('.unset() should remove an element from the cache', async (test) => {
	const element1 = {
		id: helpers.generateRandomID(),
		version: '1.0.0',
		slug: helpers.generateRandomSlug()
	}

	const element2 = {
		id: helpers.generateRandomID(),
		version: '1.0.0',
		slug: helpers.generateRandomSlug()
	}

	await test.context.cache.set('test', element1)
	await test.context.cache.set('test', element2)

	await test.context.cache.unset(element1)
	const el1 = await test.context.cache.getBySlug(
		'test', element1.slug, element1.version)
	const el2 = await test.context.cache.getBySlug(
		'test', element2.slug, element2.version)

	/* eslint-disable no-undefined */
	test.deepEqual(undefined, el1.element)
	test.deepEqual(element2, el2.element)
})
