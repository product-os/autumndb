import { generateTypeIndexPredicate, isArrayField } from './table-index';

describe('isArrayField()', () => {
	it('should accurately parse field types from a contract type schema', () => {
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

		expect(isArrayField(schema, 'data')).toEqual(false);
		expect(isArrayField(schema, 'data.payload')).toEqual(false);
		expect(isArrayField(schema, 'data.payload.message')).toEqual(false);
		expect(isArrayField(schema, 'data.payload.mentionsUser')).toEqual(true);
	});
});

describe('generateTypeIndexPredicate()', () => {
	it('should generate the correct predicate for a top level field', () => {
		const schema = {
			slug: 'foobar',
			type: 'type@1.0.0',
			version: '1.0.1',
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
			`USING btree (name) WHERE type='${schema.slug}@${schema.version}'`,
		);
	});

	it('should generate the correct predicate for multiple top level fields', () => {
		const schema = {
			slug: 'foobar',
			type: 'type@1.0.0',
			version: '1.0.1',
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
			`USING btree (name,slug) WHERE type='${schema.slug}@${schema.version}'`,
		);
	});

	it('should generate the correct predicate for a top level array field', () => {
		const schema = {
			slug: 'foobar',
			type: 'type@1.0.0',
			version: '1.0.1',
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
			`USING gin (tags) WHERE type='${schema.slug}@${schema.version}'`,
		);
	});

	it('should generate the correct predicate for a JSONB field', () => {
		const schema = {
			slug: 'foobar',
			type: 'type@1.0.0',
			version: '1.0.1',
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
			`USING btree (((data#>>'{"name"}')::text)) WHERE type='${schema.slug}@${schema.version}'`,
		);
	});

	it('should generate the correct predicate for multiple JSONB fields', () => {
		const schema = {
			slug: 'foobar',
			type: 'type@1.0.0',
			version: '1.0.1',
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
			`USING btree (name,slug) WHERE type='${schema.slug}@${schema.version}'`,
		);
	});

	it('should generate the correct predicate for a JSONB array field', () => {
		const schema = {
			slug: 'foobar',
			type: 'type@1.0.0',
			version: '1.0.1',
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
			`USING gin ((data#>'{"tags"}')) WHERE type='${schema.slug}@${schema.version}'`,
		);
	});
});
