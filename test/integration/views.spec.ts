/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import * as views from '../../lib/views';
import { CARDS } from '../../lib/cards';
import * as helpers from './helpers';

let ctx: helpers.KernelContext;

beforeAll(async () => {
	ctx = await helpers.before();
});

afterAll(() => {
	return helpers.after(ctx);
});

describe('views', () => {
	describe('.getSchema()', () => {
		test('should return null if the card is not a view', () => {
			const schema = views.getSchema(CARDS['user-admin']);
			expect(schema).toEqual(null);
		});

		test('should preserve template interpolations in user properties', () => {
			const schema = views.getSchema(
				ctx.kernel.defaults({
					type: 'view@1.0.0',
					data: {
						schema: {
							type: 'object',
							properties: {
								foo: {
									type: 'string',
									const: {
										$eval: 'user.slug',
									},
								},
							},
							required: ['foo'],
						},
					},
				}),
			);

			expect(schema).toEqual({
				type: 'object',
				properties: {
					foo: {
						type: 'string',
						const: {
							$eval: 'user.slug',
						},
					},
				},
				required: ['foo'],
			});
		});

		test('should preserve template interpolations in schema properties', () => {
			const schema = views.getSchema(
				ctx.kernel.defaults({
					type: 'view@1.0.0',
					version: '1.0.0',
					data: {
						schema: {
							type: 'object',
							properties: {
								foo: {
									type: {
										$eval: 'user.type',
									},
								},
							},
							required: ['foo'],
						},
					},
				}),
			);

			expect(schema).toEqual({
				type: 'object',
				properties: {
					foo: {
						type: {
							$eval: 'user.type',
						},
					},
				},
				required: ['foo'],
			});
		});

		test('should return a schema given a view card with two conjunctions', () => {
			const schema = views.getSchema(
				ctx.kernel.defaults({
					type: 'view@1.0.0',
					version: '1.0.0',
					data: {
						allOf: [
							{
								name: 'foo',
								schema: {
									type: 'object',
									properties: {
										foo: {
											type: 'string',
											minLength: 1,
										},
									},
									required: ['foo'],
								},
							},
							{
								name: 'bar',
								schema: {
									type: 'object',
									properties: {
										foo: {
											type: 'string',
											maxLength: 5,
										},
									},
									required: ['foo'],
								},
							},
						],
					},
				}),
			);

			expect(schema).toEqual({
				type: 'object',
				additionalProperties: true,
				properties: {
					foo: {
						type: 'string',
						minLength: 1,
						maxLength: 5,
					},
				},
				required: ['foo'],
			});
		});

		test('should return a schema given a view card with two conjunctions and empty disjunctions', () => {
			const schema = views.getSchema(
				ctx.kernel.defaults({
					type: 'view@1.0.0',
					version: '1.0.0',
					data: {
						anyOf: [],
						allOf: [
							{
								name: 'foo',
								schema: {
									type: 'object',
									properties: {
										foo: {
											type: 'string',
											minLength: 1,
										},
									},
									required: ['foo'],
								},
							},
							{
								name: 'bar',
								schema: {
									type: 'object',
									properties: {
										foo: {
											type: 'string',
											maxLength: 5,
										},
									},
									required: ['foo'],
								},
							},
						],
					},
				}),
			);

			expect(schema).toEqual({
				type: 'object',
				additionalProperties: true,
				properties: {
					foo: {
						type: 'string',
						minLength: 1,
						maxLength: 5,
					},
				},
				required: ['foo'],
			});
		});

		test('should return a schema given a view card with two disjunctions', () => {
			const schema = views.getSchema(
				ctx.kernel.defaults({
					type: 'view@1.0.0',
					version: '1.0.0',
					data: {
						anyOf: [
							{
								name: 'foo',
								schema: {
									type: 'object',
									properties: {
										type: {
											type: 'string',
											const: 'view',
										},
									},
									required: ['type'],
								},
							},
							{
								name: 'bar',
								schema: {
									type: 'object',
									properties: {
										type: {
											type: 'string',
											const: 'action',
										},
									},
									required: ['type'],
								},
							},
						],
					},
				}),
			);

			expect(schema).toEqual({
				type: 'object',
				additionalProperties: true,
				anyOf: [
					{
						type: 'object',
						properties: {
							type: {
								type: 'string',
								const: 'view',
							},
						},
						required: ['type'],
					},
					{
						type: 'object',
						properties: {
							type: {
								type: 'string',
								const: 'action',
							},
						},
						required: ['type'],
					},
				],
			});
		});

		test('should return a schema given a view card with two disjunctions and empty conjunctions', () => {
			const schema = views.getSchema(
				ctx.kernel.defaults({
					type: 'view@1.0.0',
					version: '1.0.0',
					data: {
						allOf: [],
						anyOf: [
							{
								name: 'foo',
								schema: {
									type: 'object',
									properties: {
										type: {
											type: 'string',
											const: 'view',
										},
									},
									required: ['type'],
								},
							},
							{
								name: 'bar',
								schema: {
									type: 'object',
									properties: {
										type: {
											type: 'string',
											const: 'action',
										},
									},
									required: ['type'],
								},
							},
						],
					},
				}),
			);

			expect(schema).toEqual({
				type: 'object',
				additionalProperties: true,
				anyOf: [
					{
						type: 'object',
						properties: {
							type: {
								type: 'string',
								const: 'view',
							},
						},
						required: ['type'],
					},
					{
						type: 'object',
						properties: {
							type: {
								type: 'string',
								const: 'action',
							},
						},
						required: ['type'],
					},
				],
			});
		});

		test('should return a schema given a view card with two disjunctions and two conjunctions', () => {
			const schema = views.getSchema(
				ctx.kernel.defaults({
					type: 'view@1.0.0',
					version: '1.0.0',
					data: {
						anyOf: [
							{
								name: 'foo',
								schema: {
									type: 'object',
									properties: {
										type: {
											type: 'string',
											const: 'view@1.0.0',
										},
									},
									required: ['type'],
								},
							},
							{
								name: 'bar',
								schema: {
									type: 'object',
									properties: {
										type: {
											type: 'string',
											const: 'action',
										},
									},
									required: ['type'],
								},
							},
						],
						allOf: [
							{
								name: 'foo',
								schema: {
									type: 'object',
									properties: {
										foo: {
											type: 'string',
											minLength: 1,
										},
									},
									required: ['foo'],
								},
							},
							{
								name: 'bar',
								schema: {
									type: 'object',
									properties: {
										foo: {
											type: 'string',
											maxLength: 5,
										},
									},
									required: ['foo'],
								},
							},
						],
					},
				}),
			);

			expect(schema).toEqual({
				type: 'object',
				additionalProperties: true,
				properties: {
					foo: {
						type: 'string',
						minLength: 1,
						maxLength: 5,
					},
				},
				required: ['foo'],
				anyOf: [
					{
						type: 'object',
						properties: {
							type: {
								type: 'string',
								const: 'view@1.0.0',
							},
						},
						required: ['type'],
					},
					{
						type: 'object',
						properties: {
							type: {
								type: 'string',
								const: 'action',
							},
						},
						required: ['type'],
					},
				],
			});
		});

		test('should return null given a view card with no filters', () => {
			const schema = views.getSchema({
				type: 'view@1.0.0',
				version: '1.0.0',
				data: {},
			});

			expect(schema).toEqual(null);
		});
	});
});
