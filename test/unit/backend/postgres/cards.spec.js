/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */
/* eslint-disable max-len */

const ava = require('ava')
const errors = require('../../../../lib/errors')
const cards = require('../../../../lib/backend/postgres/cards')
const {
	v4: uuid
} = require('uuid')
const utils = require('../../../../lib/utils')

ava.before((test) => {
	test.context.context = {
		id: `UNIT-TEST-${uuid()}`
	}
})

ava('Should be able to convert a type card field path to that of a normal card (depth=1)', (test) => {
	const from = [ 'data', 'schema', 'properties', 'name' ]
	const result = cards.fromTypePath(from)

	const expected = [ 'name' ]

	test.deepEqual(result, expected)
})

ava('Should be able to convert a type card field path to that of a normal card (depth=2)', (test) => {
	const from = [ 'data', 'schema', 'properties', 'data', 'properties', 'actor' ]
	const result = cards.fromTypePath(from)

	const expected = [ 'data', 'actor' ]

	test.deepEqual(result, expected)
})

ava('Should be able to convert a type card field path to that of a normal card (depth=3)', (test) => {
	const from = [ 'data', 'schema', 'properties', 'data', 'properties', 'payload', 'properties', 'message' ]
	const result = cards.fromTypePath(from)

	const expected = [ 'data', 'payload', 'message' ]

	test.deepEqual(result, expected)
})

ava('Should be able to find multiple full-text search fields at various depths from a schema', (test) => {
	const schema = {
		slug: 'test',
		type: 'test@1.0.0',
		version: '1.0.0',
		name: 'Test type',
		markers: [],
		tags: [],
		links: {},
		active: true,
		data: {
			schema: {
				type: 'object',
				required: [ 'version', 'data' ],
				properties: {
					version: {
						type: 'string',
						const: '1.0.0'
					},
					name: {
						type: 'string',
						fullTextSearch: true
					},
					tags: {
						type: 'array',
						items: {
							type: 'string'
						},
						fullTextSearch: true
					},
					data: {
						type: 'object',
						properties: {
							approvals: {
								type: 'array',
								items: {
									type: [ 'boolean', 'string' ]
								},
								fullTextSearch: true
							},
							observations: {
								anyOf: [
									{
										type: 'string',
										fullTextSearch: true
									},
									{
										type: 'array',
										items: {
											type: 'string'
										},
										fullTextSearch: true
									}
								]
							},
							category: {
								type: 'string',
								fullTextSearch: true
							},
							title: {
								type: 'string'
							},
							payload: {
								type: 'object',
								required: [ 'message' ],
								properties: {
									description: {
										type: 'string'
									},
									message: {
										type: 'string',
										format: 'markdown',
										fullTextSearch: true
									}
								}
							}
						}
					}
				}
			}
		}
	}
	const result = cards.parseFullTextSearchFields(test.context.context, schema, errors)

	const expected = [
		{
			path: [ 'name' ],
			isArray: false
		},
		{
			path: [ 'tags' ],
			isArray: true
		},
		{
			path: [ 'data', 'approvals' ],
			isArray: true
		},
		{
			path: [ 'data', 'observations' ],
			isArray: false
		},
		{
			path: [ 'data', 'category' ],
			isArray: false
		},
		{
			path: [ 'data', 'payload', 'message' ],
			isArray: false
		}
	]

	test.deepEqual(result, expected)
})

ava('Should error when an item does not have "string" as a type', (test) => {
	const schema = {
		slug: 'test',
		type: 'test@1.0.0',
		version: '1.0.0',
		name: 'Test type',
		markers: [],
		tags: [],
		links: {},
		active: true,
		data: {
			schema: {
				type: 'object',
				required: [ 'version', 'data' ],
				properties: {
					version: {
						type: 'string',
						const: '1.0.0'
					},
					data: {
						type: 'object',
						properties: {
							approved: {
								type: [ 'boolean', 'null' ],
								fullTextSearch: true
							}
						}
					}
				}
			}
		}
	}

	try {
		cards.parseFullTextSearchFields(test.context.context, schema, errors)
		test.fail('This code should not run')
	} catch (err) {
		test.pass()
	}
})

ava('Should error when an array does not have "string" as a type', (test) => {
	const schema = {
		slug: 'test',
		type: 'test@1.0.0',
		version: '1.0.0',
		name: 'Test type',
		markers: [],
		tags: [],
		links: {},
		active: true,
		data: {
			schema: {
				type: 'object',
				required: [ 'version', 'data' ],
				properties: {
					version: {
						type: 'string',
						const: '1.0.0'
					},
					data: {
						type: 'object',
						properties: {
							approved: {
								type: 'array',
								items: {
									type: [ 'boolean', 'null' ]
								},
								fullTextSearch: true
							}
						}
					}
				}
			}
		}
	}

	try {
		cards.parseFullTextSearchFields(test.context.context, schema, errors)
		test.fail('This code should not run')
	} catch (err) {
		test.pass()
	}
})

ava('Should error when a combinator non-array child does not have "string" as a type', (test) => {
	const schema = {
		slug: 'test',
		type: 'test@1.0.0',
		version: '1.0.0',
		name: 'Test type',
		markers: [],
		tags: [],
		links: {},
		active: true,
		data: {
			schema: {
				type: 'object',
				required: [ 'version', 'data' ],
				properties: {
					version: {
						type: 'string',
						const: '1.0.0'
					},
					data: {
						type: 'object',
						properties: {
							observations: {
								anyOf: [
									{
										type: [ 'boolean', 'null' ],
										fullTextSearch: true
									}
								]
							}
						}
					}
				}
			}
		}
	}

	try {
		cards.parseFullTextSearchFields(test.context.context, schema, errors)
		test.fail('This code should not run')
	} catch (err) {
		test.pass()
	}
})

ava('Should error when a combinator array child does not have "string" as a type', (test) => {
	const schema = {
		slug: 'test',
		type: 'test@1.0.0',
		version: '1.0.0',
		name: 'Test type',
		markers: [],
		tags: [],
		links: {},
		active: true,
		data: {
			schema: {
				type: 'object',
				required: [ 'version', 'data' ],
				properties: {
					version: {
						type: 'string',
						const: '1.0.0'
					},
					data: {
						type: 'object',
						properties: {
							observations: {
								anyOf: [
									{
										type: 'array',
										items: {
											type: [ 'boolean', 'null' ]
										},
										fullTextSearch: true
									}
								]
							}
						}
					}
				}
			}
		}
	}

	try {
		cards.parseFullTextSearchFields(test.context.context, schema, errors)
		test.fail('This code should not run')
	} catch (err) {
		test.pass()
	}
})

ava('Should be able to generate patch update statements for JSONB field deletions', (test) => {
	const before = {
		id: uuid(),
		slug: 'test',
		type: 'test@1.0.0',
		name: 'test',
		data: {
			foo: 'bar',
			oldString: 'test',
			oldArray: [
				'test'
			],
			oldObject: {
				description: 'test'
			},
			payload: {
				bar: 'baz',
				oldString: 'test',
				oldArray: [
					'test'
				],
				oldObject: {
					description: 'test'
				}
			}
		}
	}

	const after = {
		id: before.id,
		slug: 'test',
		type: 'test@1.0.0',
		name: 'test',
		data: {
			foo: 'bar',
			payload: {
				bar: 'baz'
			}
		}
	}

	test.deepEqual(cards.toPatchUpdates(after, utils.getPatchDiff(before, after)), [
		{
			text: 'UPDATE cards SET data = data #- \'{"oldString"}\' WHERE id=$1',
			values: [
				after.id
			]
		},
		{
			text: 'UPDATE cards SET data = data #- \'{"oldArray"}\' WHERE id=$1',
			values: [
				after.id
			]
		},
		{
			text: 'UPDATE cards SET data = data #- \'{"oldObject"}\' WHERE id=$1',
			values: [
				after.id
			]
		},
		{
			text: 'UPDATE cards SET data = data #- \'{"payload", "oldString"}\' WHERE id=$1',
			values: [
				after.id
			]
		},
		{
			text: 'UPDATE cards SET data = data #- \'{"payload", "oldArray"}\' WHERE id=$1',
			values: [
				after.id
			]
		},
		{
			text: 'UPDATE cards SET data = data #- \'{"payload", "oldObject"}\' WHERE id=$1',
			values: [
				after.id
			]
		}
	])
})

ava('Should be able to generate patch UPDATE statements for JSONB field additions', (test) => {
	const before = {
		id: uuid(),
		slug: 'test',
		type: 'test@1.0.0',
		name: 'test',
		data: {
			foo: 'bar',
			payload: {
				bar: 'baz'
			}
		}
	}

	const after = {
		id: before.id,
		slug: 'test',
		type: 'test@1.0.0',
		name: 'test',
		data: {
			foo: 'bar',
			newString: 'test',
			newArray: [
				'test'
			],
			newObject: {
				description: 'test'
			},
			payload: {
				bar: 'baz',
				newString: 'test',
				newArray: [
					'test'
				],
				newObject: {
					description: 'test'
				}
			}
		}
	}

	test.deepEqual(cards.toPatchUpdates(after, utils.getPatchDiff(before, after)), [
		{
			text: 'UPDATE cards SET data = data || $1::jsonb WHERE id=$2',
			values: [
				'{"payload":{"newObject":{"description":"test"}},"newString":"test","newArray":["test"],"newObject":{"description":"test"}}',
				after.id
			]
		}
	])
})

ava('Should be able to generate patch UPDATE statements for field updates', (test) => {
	const before = {
		id: uuid(),
		slug: 'test',
		type: 'test@1.0.0',
		name: 'foo',
		tags: [
			'foo'
		],
		data: {
			name: 'foo',
			tags: [
				'foo'
			],
			payload: {
				name: 'foo',
				tags: [
					'foo'
				]
			}
		}
	}

	const after = {
		id: before.id,
		slug: 'test',
		type: 'test@1.0.0',
		name: 'bar',
		tags: [
			'bar',
			'baz'
		],
		data: {
			name: 'bar',
			tags: [
				'bar',
				'baz'
			],
			payload: {
				name: 'bar',
				tags: [
					'bar',
					'baz'
				]
			}
		}
	}

	test.deepEqual(cards.toPatchUpdates(after, utils.getPatchDiff(before, after)), [
		{
			text: 'UPDATE cards SET name=$1, tags=$2, data = data || $3::jsonb WHERE id=$4',
			values: [
				'bar',
				[
					'bar',
					'baz'
				],
				'{"name":"bar","tags":["bar","baz"],"payload":{"tags":["bar","baz"]}}',
				after.id
			]
		}
	])
})

ava('Should be able to generate patch UPDATE statements for mixed field changes', (test) => {
	const before = {
		id: uuid(),
		slug: 'test',
		type: 'test@1.0.0',
		name: 'foo',
		data: {
			name: 'foo',
			oldArray: [
				'foo'
			]
		}
	}

	const after = {
		id: before.id,
		slug: 'test',
		type: 'test@1.0.0',
		name: 'bar',
		data: {
			name: 'bar',
			newArray: [
				'bar',
				'baz'
			]
		}
	}

	test.deepEqual(cards.toPatchUpdates(after, utils.getPatchDiff(before, after)), [
		{
			text: 'UPDATE cards SET data = data #- \'{"oldArray"}\' WHERE id=$1',
			values: [
				after.id
			]
		},
		{
			text: 'UPDATE cards SET name=$1, data = data || $2::jsonb WHERE id=$3',
			values: [
				'bar',
				'{"name":"bar","newArray":["bar","baz"]}',
				after.id
			]
		}
	])
})
