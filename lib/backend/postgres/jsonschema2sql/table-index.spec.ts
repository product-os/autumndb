/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import { generateTypeIndexPredicate, getFieldType } from './table-index';

describe('getFieldType()', () => {
	it('should accurately get field types from a contract type schema', () => {
		const type = 'message';
		const schema = {
			slug: 'foobar',
			type: 'type@1.0.0',
			data: {
				schema: {
					type: 'object',
					properties: {
						data: {
							type: 'object',
							properties: {
								payload: {
									type: 'object',
									required: ['message'],
									properties: {
										mentionsUser: {
											type: 'array',
											items: {
												type: 'string',
											},
										},
										message: {
											type: 'string',
											format: 'markdown',
											fullTextSearch: true,
										},
									},
								},
							},
						},
					},
				},
			},
		};

		expect(getFieldType(type, schema, 'data')).toEqual('object');
		expect(getFieldType(type, schema, 'data.payload')).toEqual('object');
		expect(getFieldType(type, schema, 'data.payload.message')).toEqual(
			'string',
		);
		expect(getFieldType(type, schema, 'data.payload.mentionsUser')).toEqual(
			'array',
		);
	});

	it('should throw error when no type is found', () => {
		expect.hasAssertions();
		try {
			getFieldType(
				'message',
				{
					slug: 'foobar',
					type: 'foobar@1.0.0',
					data: {},
				},
				'data.payload.message',
			);
		} catch (error) {
			expect(error.message).toEqual(
				'Could not find type for field data.payload.message on message',
			);
		}
	});
});

describe('generateTypeIndexPredicate()', () => {
	it('should generate the correct predicate for a top level field', () => {
		const schema = {
			slug: 'foobar',
			type: 'type@1.0.0',
			data: {
				schema: {
					type: 'object',
					properties: {
						name: {
							type: 'string',
						},
					},
					required: ['name'],
				},
				indexed_fields: [['name']],
			},
		};
		const predicate = generateTypeIndexPredicate(
			schema.data.indexed_fields[0],
			schema,
		);
		expect(predicate).toEqual(
			`USING btree (name) WHERE type='${schema.slug}@1.0.0'`,
		);
	});

	it('should generate the correct predicate for multiple top level fields', () => {
		const schema = {
			slug: 'foobar',
			type: 'type@1.0.0',
			data: {
				schema: {
					type: 'object',
					properties: {
						name: {
							type: 'string',
						},
						slug: {
							type: 'string',
						},
					},
					required: ['name', 'slug'],
				},
				indexed_fields: [['name', 'slug']],
			},
		};

		const predicate = generateTypeIndexPredicate(
			schema.data.indexed_fields[0],
			schema,
		);
		expect(predicate).toEqual(
			`USING btree (name,slug) WHERE type='${schema.slug}@1.0.0'`,
		);
	});

	it('should generate the correct predicate for a top level array field', () => {
		const schema = {
			slug: 'foobar',
			type: 'type@1.0.0',
			data: {
				schema: {
					type: 'object',
					properties: {
						tags: {
							type: 'array',
							items: {
								type: 'string',
							},
						},
					},
					required: ['tags'],
				},
				indexed_fields: [['tags']],
			},
		};
		const predicate = generateTypeIndexPredicate(
			schema.data.indexed_fields[0],
			schema,
		);
		expect(predicate).toEqual(
			`USING gin (tags) WHERE type='${schema.slug}@1.0.0'`,
		);
	});

	it('should generate the correct predicate for a JSONB field', () => {
		const schema = {
			slug: 'foobar',
			type: 'type@1.0.0',
			data: {
				schema: {
					type: 'object',
					properties: {
						data: {
							type: 'object',
							properties: {
								name: {
									type: 'string',
								},
							},
							required: ['name'],
						},
					},
					required: ['data'],
				},
				indexed_fields: [['data.name']],
			},
		};
		const predicate = generateTypeIndexPredicate(
			schema.data.indexed_fields[0],
			schema,
		);
		expect(predicate).toEqual(
			`USING btree (((data#>>'{"name"}')::text)) WHERE type='${schema.slug}@1.0.0'`,
		);
	});

	it('should generate the correct predicate for multiple JSONB fields', () => {
		const schema = {
			slug: 'foobar',
			type: 'type@1.0.0',
			data: {
				schema: {
					type: 'object',
					properties: {
						name: {
							type: 'string',
						},
						slug: {
							type: 'string',
						},
					},
					required: ['name', 'slug'],
				},
				indexed_fields: [['name', 'slug']],
			},
		};

		const predicate = generateTypeIndexPredicate(
			schema.data.indexed_fields[0],
			schema,
		);
		expect(predicate).toEqual(
			`USING btree (name,slug) WHERE type='${schema.slug}@1.0.0'`,
		);
	});

	it('should generate the correct predicate for a JSONB array field', () => {
		const schema = {
			slug: 'foobar',
			type: 'type@1.0.0',
			data: {
				schema: {
					type: 'object',
					properties: {
						data: {
							type: 'object',
							properties: {
								tags: {
									type: 'array',
									items: {
										type: 'string',
									},
								},
							},
							required: ['tags'],
						},
					},
					required: ['data'],
				},
				indexed_fields: [['data.tags']],
			},
		};
		const predicate = generateTypeIndexPredicate(
			schema.data.indexed_fields[0],
			schema,
		);
		expect(predicate).toEqual(
			`USING gin ((data#>'{"tags"}')) WHERE type='${schema.slug}@1.0.0'`,
		);
	});
});
