import { randomUUID } from 'node:crypto';
import * as cards from '../../../../lib/backend/postgres/cards';
import { Context } from '../../../../lib/context';

const TEST_CONTEXT = new Context({ id: `UNIT-TEST-${randomUUID()}` });

describe('cards', () => {
	describe('.fromTypePath()', () => {
		it('should be able to convert a type card field path to that of a normal card (depth=1)', () => {
			const from = ['data', 'schema', 'properties', 'name'];
			const result = cards.fromTypePath(from);

			const expected = ['name'];

			expect(result).toEqual(expected);
		});

		it('Should be able to convert a type card field path to that of a normal card (depth=2)', () => {
			const from = [
				'data',
				'schema',
				'properties',
				'data',
				'properties',
				'actor',
			];
			const result = cards.fromTypePath(from);

			const expected = ['data', 'actor'];

			expect(result).toEqual(expected);
		});

		it('should be able to convert a type card field path to that of a normal card (depth=3)', () => {
			const from = [
				'data',
				'schema',
				'properties',
				'data',
				'properties',
				'payload',
				'properties',
				'message',
			];
			const result = cards.fromTypePath(from);

			const expected = ['data', 'payload', 'message'];

			expect(result).toEqual(expected);
		});
	});

	describe('.parseFullTextSearchFields()', () => {
		it('should be able to find multiple full-text search fields at various depths from a schema', () => {
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
						required: ['version', 'data'],
						properties: {
							version: {
								type: 'string',
								const: '1.0.0',
							},
							name: {
								type: 'string',
								fullTextSearch: true,
							},
							tags: {
								type: 'array',
								items: {
									type: 'string',
								},
								fullTextSearch: true,
							},
							data: {
								type: 'object',
								properties: {
									approvals: {
										type: 'array',
										items: {
											type: ['boolean', 'string'],
										},
										fullTextSearch: true,
									},
									observations: {
										anyOf: [
											{
												type: 'string',
												fullTextSearch: true,
											},
											{
												type: 'array',
												items: {
													type: 'string',
												},
												fullTextSearch: true,
											},
										],
									},
									category: {
										type: 'string',
										fullTextSearch: true,
									},
									title: {
										type: 'string',
									},
									payload: {
										type: 'object',
										required: ['message'],
										properties: {
											description: {
												type: 'string',
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

			const result = cards.parseFullTextSearchFields(
				TEST_CONTEXT,
				// TS-TODO: Fix this "any" cast
				schema as any,
			);

			const expected = [
				{
					path: ['name'],
					isArray: false,
				},
				{
					path: ['tags'],
					isArray: true,
				},
				{
					path: ['data', 'approvals'],
					isArray: true,
				},
				{
					path: ['data', 'observations'],
					isArray: false,
				},
				{
					path: ['data', 'category'],
					isArray: false,
				},
				{
					path: ['data', 'payload', 'message'],
					isArray: false,
				},
			];

			expect(result).toEqual(expected);
		});

		it('should error when an item does not have "string" as a type', () => {
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
						required: ['version', 'data'],
						properties: {
							version: {
								type: 'string',
								const: '1.0.0',
							},
							data: {
								type: 'object',
								properties: {
									approved: {
										type: ['boolean', 'null'],
										fullTextSearch: true,
									},
								},
							},
						},
					},
				},
			};

			expect(() => {
				// TS-TODO: fix schema casting
				cards.parseFullTextSearchFields(TEST_CONTEXT, schema as any);
			}).toThrow();
		});

		it('should error when an array does not have "string" as a type', () => {
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
						required: ['version', 'data'],
						properties: {
							version: {
								type: 'string',
								const: '1.0.0',
							},
							data: {
								type: 'object',
								properties: {
									approved: {
										type: 'array',
										items: {
											type: ['boolean', 'null'],
										},
										fullTextSearch: true,
									},
								},
							},
						},
					},
				},
			};

			expect(() => {
				// TS-TODO: fix schema casting
				cards.parseFullTextSearchFields(TEST_CONTEXT, schema as any);
			}).toThrow();
		});

		it('should error when a combinator non-array child does not have "string" as a type', () => {
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
						required: ['version', 'data'],
						properties: {
							version: {
								type: 'string',
								const: '1.0.0',
							},
							data: {
								type: 'object',
								properties: {
									observations: {
										anyOf: [
											{
												type: ['boolean', 'null'],
												fullTextSearch: true,
											},
										],
									},
								},
							},
						},
					},
				},
			};

			expect(() => {
				// TS-TODO: fix schema casting
				cards.parseFullTextSearchFields(TEST_CONTEXT, schema as any);
			}).toThrow();
		});

		it('should error when a combinator array child does not have "string" as a type', () => {
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
						required: ['version', 'data'],
						properties: {
							version: {
								type: 'string',
								const: '1.0.0',
							},
							data: {
								type: 'object',
								properties: {
									observations: {
										anyOf: [
											{
												type: 'array',
												items: {
													type: ['boolean', 'null'],
												},
												fullTextSearch: true,
											},
										],
									},
								},
							},
						},
					},
				},
			};

			expect(() => {
				// TS-TODO: fix schema casting
				cards.parseFullTextSearchFields(TEST_CONTEXT, schema as any);
			}).toThrow();
		});
	});

	describe('.parseVersionedSlug()', () => {
		it('should parse valid versioned slug strings', () => {
			const base = 'card';
			expect(cards.parseVersionedSlug(`${base}@1`)).toEqual({
				base,
				major: 1,
				minor: 0,
				patch: 0,
				prerelease: '',
				build: '',
				latest: false,
			});

			expect(cards.parseVersionedSlug(`${base}@1.1`)).toEqual({
				base,
				major: 1,
				minor: 1,
				patch: 0,
				prerelease: '',
				build: '',
				latest: false,
			});

			expect(cards.parseVersionedSlug(`${base}@1.2.3`)).toEqual({
				base,
				major: 1,
				minor: 2,
				patch: 3,
				prerelease: '',
				build: '',
				latest: false,
			});

			expect(cards.parseVersionedSlug(`${base}@1.2.3-alpha`)).toEqual({
				base,
				major: 1,
				minor: 2,
				patch: 3,
				prerelease: 'alpha',
				build: '',
				latest: false,
			});

			expect(cards.parseVersionedSlug(`${base}@1.2.3-alpha+rev1`)).toEqual({
				base,
				major: 1,
				minor: 2,
				patch: 3,
				prerelease: 'alpha',
				build: 'rev1',
				latest: false,
			});

			expect(cards.parseVersionedSlug(`${base}@1.2.3+rev1`)).toEqual({
				base,
				major: 1,
				minor: 2,
				patch: 3,
				prerelease: '',
				build: 'rev1',
				latest: false,
			});

			expect(cards.parseVersionedSlug(`${base}@latest`)).toEqual({
				base,
				major: 0,
				minor: 0,
				patch: 0,
				prerelease: '',
				build: '',
				latest: true,
			});
		});

		it('should be case insensitive', () => {
			expect(() => {
				cards.parseVersionedSlug('foo-BAR@1.0.0');
			}).not.toThrow();
		});
	});
});
