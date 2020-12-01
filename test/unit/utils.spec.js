/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */
/* eslint-disable max-len */

const _ = require('lodash')
const ava = require('ava')
const {
	v4: uuid
} = require('uuid')
const utils = require('../../lib/utils')

ava.before((test) => {
	test.context.context = {
		id: `UNIT-TEST-${uuid()}`
	}
})

ava('.getPatchDiff() should be able to generate diff between two objects', (test) => {
	const before = {
		id: uuid(),
		slug: 'test',
		type: 'test@1.0.0',
		name: 'foo',
		tags: [
			'foo',
			'bar'
		],
		data: {
			name: 'foo',
			tags: [
				'foo'
			],
			oldArray: [
				'foo'
			],
			complexOne: [
				{
					foo: 'bar'
				}
			],
			complexTwo: [
				{
					deepArray: [
						'foo',
						{
							foo: 'bar'
						}
					]
				}
			],
			complexThree: [
				{
					foo: 'bar',
					buz: 'baz'
				}
			],
			complexFour: [
				{
					foo: {
						buz: 'bar'
					}
				}
			]
		}
	}

	const after = {
		id: before.id,
		slug: 'test',
		type: 'test@1.0.0',
		name: 'bar',
		tags: [
			'baz'
		],
		data: {
			name: 'bar',
			tags: [
				'foo',
				'bar'
			],
			newArray: [
				'baz'
			],
			complexOne: [
				{
					foo: 'baz'
				}
			],
			complexTwo: [
				{
					deepArray: [
						'foo',
						{
							foo: 'baz'
						}
					]
				}
			],
			complexThree: [
				{
					foo: 'bar'
				}
			],
			complexFour: [
				{
					foo: {
						buz: 'baz'
					}
				}
			],
			complexFive: [
				{
					foo: 'bar'
				}
			]
		}
	}

	test.deepEqual(utils.getPatchDiff(before, after), {
		name: {
			type: 'update',
			value: 'bar'
		},
		tags: {
			type: 'update',
			value: [
				'baz'
			]
		},
		'data.name': {
			type: 'update',
			value: 'bar'
		},
		'data.tags': {
			type: 'update',
			value: [
				'foo',
				'bar'
			]
		},
		'data.oldArray': {
			type: 'delete'
		},
		'data.complexOne': {
			type: 'update',
			value: [
				{
					foo: 'baz'
				}
			]
		},
		'data.complexTwo': {
			type: 'update',
			value: [
				{
					deepArray: [
						'foo',
						{
							foo: 'baz'
						}
					]
				}
			]
		},
		'data.complexThree': {
			type: 'delete'
		},
		'data.complexFour': {
			type: 'update',
			value: [
				{
					foo: {
						buz: 'baz'
					}
				}
			]
		},
		'data.newArray': {
			type: 'add',
			value: [
				'baz'
			]
		},
		'data.complexFive': {
			type: 'add',
			value: [
				{
					foo: 'bar'
				}
			]
		}
	})
})

ava('.getParentArray() should return an empty array if element does not exist within an array', (test) => {
	const object = {
		id: uuid(),
		slug: 'test',
		type: 'test@1.0.0',
		name: 'foo',
		data: {
			name: 'foo',
			0: {
				name: 'foo',
				0: 'bar'
			}
		}
	}

	test.true(_.isEmpty(utils.getParentArray(object, [ 'name' ])))
	test.true(_.isEmpty(utils.getParentArray(object, [ 'data', 'name' ])))
	test.true(_.isEmpty(utils.getParentArray(object, [ 'data', 0, 'name' ])))
	test.true(_.isEmpty(utils.getParentArray(object, [ 'data', 0, 0 ])))
})

ava('.getParentArray() should return path to parent array if element exists within an array', (test) => {
	const object = {
		id: uuid(),
		slug: 'test',
		type: 'test@1.0.0',
		name: 'foo',
		tags: [
			'foo',
			'bar'
		],
		data: {
			name: 'foo',
			tags: [
				'foo',
				'bar'
			],
			complex: [
				{
					foo: 'bar',
					users: [
						'foo',
						'bar'
					]
				}
			]
		}
	}

	test.deepEqual(utils.getParentArray(object, [ 'tags', 0 ]), [ 'tags' ])
	test.deepEqual(utils.getParentArray(object, [ 'tags', 1 ]), [ 'tags' ])
	test.deepEqual(utils.getParentArray(object, [ 'data', 'tags', 0 ]), [ 'data', 'tags' ])
	test.deepEqual(utils.getParentArray(object, [ 'data', 'tags', 1 ]), [ 'data', 'tags' ])
	test.deepEqual(utils.getParentArray(object, [ 'data', 'complex', 0, 'foo' ]), [ 'data', 'complex' ])
	test.deepEqual(utils.getParentArray(object, [ 'data', 'complex', 0, 'users', 0 ]), [ 'data', 'complex' ])
	test.deepEqual(utils.getParentArray(object, [ 'data', 'complex', 0, 'users', 1 ]), [ 'data', 'complex' ])
})
