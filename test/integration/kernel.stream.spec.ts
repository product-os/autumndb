/* tslint:disable no-floating-promises */
import * as Bluebird from 'bluebird';
import { once } from 'events';
import * as _ from 'lodash';
import { randomUUID } from 'node:crypto';
import { testUtils } from '../../lib';
import type { JsonSchema } from '../../lib/types';
import type { Stream } from '../../lib/backend/postgres/streams';
import { createRelationships } from './create-relationships';
import { setTimeout as delay } from 'timers/promises';

let ctx: testUtils.TestContext;

beforeAll(async () => {
	ctx = await testUtils.newContext();
	await createRelationships(ctx);
});

afterAll(async () => {
	await testUtils.destroyContext(ctx);
});

describe('Kernel', () => {
	describe('.stream()', () => {
		it('should include data if additionalProperties true', (done) => {
			const slug = testUtils.generateRandomSlug({
				prefix: 'contract',
			});

			ctx.kernel
				.stream(ctx.logContext, ctx.kernel.adminSession()!, {
					type: 'object',
					additionalProperties: true,
					required: ['slug', 'active', 'type'],
					properties: {
						slug: {
							type: 'string',
							const: slug,
						},
						active: {
							type: 'boolean',
							const: true,
						},
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
					},
				})
				.then((emitter: Stream) => {
					emitter.on('error', done);
					emitter.on('closed', done);

					emitter.on('data', (change) => {
						expect(change).toEqual({
							id: change.after.id,
							type: 'insert',
							contractType: 'card@1.0.0',
							after: {
								id: change.after.id,
								slug,
								type: 'card@1.0.0',
								active: true,
								version: '1.0.0',
								tags: [],
								loop: null,
								name: null,
								markers: [],
								created_at: change.after.created_at,
								updated_at: null,
								linked_at: {},
								links: {},
								requires: [],
								capabilities: [],
								data: {
									test: 1,
								},
							},
						});

						emitter.close();
					});

					ctx.kernel.insertContract(
						ctx.logContext,
						ctx.kernel.adminSession()!,
						{
							slug,
							type: 'card@1.0.0',
							data: {
								test: 1,
							},
						},
					);
				});
		});

		it('should report back new elements that match a certain slug', (done) => {
			const slug = testUtils.generateRandomSlug({
				prefix: 'contract',
			});

			ctx.kernel
				.stream(ctx.logContext, ctx.kernel.adminSession()!, {
					type: 'object',
					additionalProperties: false,
					properties: {
						type: {
							type: 'string',
						},
						slug: {
							type: 'string',
							const: slug,
						},
						active: {
							type: 'boolean',
						},
						links: {
							type: 'object',
						},
						tags: {
							type: 'array',
						},
						data: {
							type: 'object',
							properties: {
								test: {
									type: 'number',
								},
							},
						},
					},
					required: ['slug'],
				})
				.then((emitter: Stream) => {
					emitter.on('data', (change) => {
						expect(change.after).toEqual({
							id: change.id,
							type: 'card@1.0.0',
							slug,
							active: true,
							links: {},
							tags: [],
							data: {
								test: 1,
							},
						});

						emitter.close();
					});

					emitter.on('error', done);
					emitter.on('closed', done);

					ctx.kernel.insertContract(
						ctx.logContext,
						ctx.kernel.adminSession()!,
						{
							slug,
							type: 'card@1.0.0',
							version: '1.0.0',
							data: {
								test: 1,
							},
						},
					);

					ctx.kernel.insertContract(
						ctx.logContext,
						ctx.kernel.adminSession()!,
						{
							type: 'card@1.0.0',
							data: {
								test: 2,
							},
						},
					);
				});
		});

		it('should filter contracts by the options.mask schema if set', async () => {
			const scope = randomUUID();
			const schema: JsonSchema = {
				required: ['data'],
				properties: {
					data: {
						required: ['scope'],
						properties: {
							scope: {
								const: scope,
							},
						},
					},
				},
			};

			const contract1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						scope,
						status: 'open',
						order: 0,
					},
				},
			);

			const contract2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						scope,
						status: 'closed',
						order: 1,
					},
				},
			);

			const stream = await ctx.kernel.stream(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				schema,
			);

			const queryWithoutMaskId = randomUUID();
			const queryWithMaskId = randomUUID();

			stream.on('dataset', async (payload) => {
				if (payload.id === queryWithoutMaskId) {
					expect(payload.cards).toEqual([contract1, contract2]);

					const mask: JsonSchema = {
						type: 'object',
						properties: {
							data: {
								properties: {
									status: {
										const: 'open',
									},
								},
							},
						},
					};

					stream.emit('query', {
						id: queryWithMaskId,
						schema,
						options: {
							mask,
						},
					});
				} else if (payload.id === queryWithMaskId) {
					expect(payload.cards).toEqual([contract1]);
					stream.close();
				}
			});

			stream.emit('query', {
				id: queryWithoutMaskId,
				schema,
				options: { sortBy: ['data', 'order'] },
			});

			await once(stream, 'closed');
		});

		it('should report back elements of a certain type', async () => {
			const slug = testUtils.generateRandomSlug();

			const emitter = await ctx.kernel.stream(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'object',
					additionalProperties: false,
					properties: {
						slug: {
							type: 'string',
						},
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
						data: {
							type: 'object',
							properties: {
								email: {
									type: 'string',
								},
							},
							required: ['email'],
						},
					},
					required: ['type'],
				},
			);

			const result = await new Promise<any>(async (resolve, reject) => {
				emitter.on('data', (change) => {
					emitter.close();
					resolve(change);
				});

				emitter.on('error', reject);

				ctx.kernel.insertContract(ctx.logContext, ctx.kernel.adminSession()!, {
					type: 'card@1.0.0',
					data: {
						test: 1,
					},
				});
				ctx.kernel.insertContract(ctx.logContext, ctx.kernel.adminSession()!, {
					slug,
					type: 'card@1.0.0',
					data: {
						email: 'johndoe@example.com',
					},
				});
			});

			expect(result.after).toEqual({
				id: result.id,
				slug,
				type: 'card@1.0.0',
				data: {
					email: 'johndoe@example.com',
				},
			});
		});

		it('should be able to attach a large number of streams', async () => {
			const slug = testUtils.generateRandomSlug();
			const schema: JsonSchema = {
				type: 'object',
				additionalProperties: false,
				properties: {
					slug: {
						type: 'string',
					},
					type: {
						type: 'string',
						const: 'card@1.0.0',
					},
					data: {
						type: 'object',
						properties: {
							email: {
								type: 'string',
							},
						},
						required: ['email'],
					},
				},
				required: ['type'],
			};

			const times = 400;

			const streams = await Bluebird.all(
				_.times(times, () => {
					return ctx.kernel.stream(
						ctx.logContext,
						ctx.kernel.adminSession()!,
						schema,
					);
				}),
			);

			const promises = streams.map((emitter) => {
				return new Bluebird((resolve, reject) => {
					let result: any = null;

					emitter.on('data', (change) => {
						result = change;
						setTimeout(() => {
							emitter.close();
						}, 200);
					});

					emitter.on('error', reject);
					emitter.on('closed', () => {
						return resolve(result);
					});
				});
			});

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug,
					type: 'card@1.0.0',
					data: {
						email: 'johndoe@example.com',
					},
				},
			);

			const results = await Bluebird.all(promises);

			expect(
				results.map((result: any) => {
					return _.omit(result, ['id', 'after.id', 'after.slug']);
				}),
			).toEqual(
				_.times(
					times,
					_.constant({
						type: 'insert',
						contractType: 'card@1.0.0',
						after: {
							type: 'card@1.0.0',
							data: {
								email: 'johndoe@example.com',
							},
						},
					}),
				),
			);
		});

		it('should close without finding anything', (done) => {
			ctx.kernel
				.stream(ctx.logContext, ctx.kernel.adminSession()!, {
					type: 'object',
					properties: {
						slug: {
							type: 'string',
							const: testUtils.generateRandomSlug(),
						},
					},
					required: ['slug'],
				})
				.then((emitter: Stream) => {
					emitter.on('error', done);
					emitter.on('closed', done);
					emitter.close();
				});
		});

		it('should report back inactive elements', (done) => {
			const slug = testUtils.generateRandomSlug();

			ctx.kernel
				.stream(ctx.logContext, ctx.kernel.adminSession()!, {
					type: 'object',
					additionalProperties: false,
					properties: {
						slug: {
							type: 'string',
							const: slug,
						},
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
					},
					required: ['type'],
				})
				.then((emitter: Stream) => {
					emitter.on('data', (change) => {
						expect(change.after).toEqual({
							id: change.id,
							type: 'card@1.0.0',
							slug,
						});

						emitter.close();
					});

					emitter.on('error', done);
					emitter.on('closed', done);

					ctx.kernel.insertContract(
						ctx.logContext,
						ctx.kernel.adminSession()!,
						{
							slug,
							active: false,
							type: 'card@1.0.0',
							data: {
								test: 2,
							},
						},
					);
				});
		});

		it('should be able to resolve links on an update to the base contract', async () => {
			const slug = testUtils.generateRandomSlug();

			const emitter = await ctx.kernel.stream(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					$$links: {
						'is attached to': {
							type: 'object',
							additionalProperties: false,
							properties: {
								slug: {
									type: 'string',
								},
							},
						},
					},
					type: 'object',
					additionalProperties: false,
					properties: {
						slug: {
							type: 'string',
							const: slug,
						},
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
					},
					required: ['type', 'links'],
				},
			);

			const contract1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug,
					type: 'card@1.0.0',
					version: '1.0.0',
					data: {
						test: 1,
					},
				},
			);

			const contract2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					active: false,
					type: 'card@1.0.0',
					data: {
						test: 2,
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'link@1.0.0',
					name: 'is attached to',
					data: {
						inverseName: 'has attached element',
						from: {
							id: contract1.id,
							type: contract1.type,
						},
						to: {
							id: contract2.id,
							type: contract2.type,
						},
					},
				},
			);

			const result = await new Promise<any>(async (resolve, reject) => {
				emitter.on('data', (change) => {
					emitter.close();
					resolve(change);
				});

				emitter.on('error', reject);

				await ctx.kernel.patchContractBySlug(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					`${contract1.slug}@${contract1.version}`,
					[
						{
							op: 'replace',
							path: '/data/test',
							value: 3,
						},
					],
				);
			});

			expect(result.after).toEqual({
				id: result.id,
				type: 'card@1.0.0',
				slug,
				links: {
					'is attached to': [
						{
							slug: contract2.slug,
						},
					],
				},
			});
		});

		it('should be able to resolve links when a new link is added', async () => {
			const slug = testUtils.generateRandomSlug();
			const emitter = await ctx.kernel.stream(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					$$links: {
						'is attached to': {
							type: 'object',
							additionalProperties: false,
							properties: {
								slug: {
									type: 'string',
								},
							},
						},
					},
					type: 'object',
					additionalProperties: false,
					properties: {
						slug: {
							type: 'string',
							const: slug,
						},
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
					},
					required: ['type', 'links'],
				},
			);

			const contract1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug,
					type: 'card@1.0.0',
					data: {
						test: 1,
					},
				},
			);

			const contract2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					active: false,
					type: 'card@1.0.0',
					data: {
						test: 2,
					},
				},
			);

			const result = await new Promise<any>((resolve, reject) => {
				emitter.on('data', (change) => {
					resolve(change);
					emitter.close();
				});

				emitter.on('error', reject);

				ctx.kernel.insertContract(ctx.logContext, ctx.kernel.adminSession()!, {
					slug: `link-${contract1.slug}-is-attached-to-${contract2.slug}`,
					type: 'link@1.0.0',
					name: 'is attached to',
					data: {
						inverseName: 'has attached element',
						from: {
							id: contract1.id,
							type: contract1.type,
						},
						to: {
							id: contract2.id,
							type: contract2.type,
						},
					},
				});
			});

			expect(result.after).toEqual({
				id: result.id,
				type: 'card@1.0.0',
				slug,
				links: {
					'is attached to': [
						{
							slug: contract2.slug,
						},
					],
				},
			});
		});

		it('should be able to resolve links when subsequent links of the same verb are added', async () => {
			const slug = testUtils.generateRandomSlug();

			// Create the base contract, and two additional contracts to link to
			const contract1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug,
					type: 'card@1.0.0',
					data: {
						test: 1,
					},
				},
			);

			const contract2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						test: 2,
					},
				},
			);

			const contract3 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						test: 3,
					},
				},
			);

			// Create the first link between contract 1 and contract 2
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `link-${contract1.slug}-is-attached-to-${contract2.slug}`,
					type: 'link@1.0.0',
					name: 'is attached to',
					data: {
						inverseName: 'has attached element',
						from: {
							id: contract1.id,
							type: contract1.type,
						},
						to: {
							id: contract2.id,
							type: contract2.type,
						},
					},
				},
			);

			// Create the second link between contract 2 and contract 3
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'link@1.0.0',
					name: 'is attached to',
					data: {
						inverseName: 'has attached element',
						from: {
							id: contract2.id,
							type: contract2.type,
						},
						to: {
							id: contract3.id,
							type: contract3.type,
						},
					},
				},
			);

			const emitter = await ctx.kernel.stream(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					$$links: {
						'is attached to': {
							type: 'object',
							additionalProperties: false,
							properties: {
								slug: {
									type: 'string',
								},
							},
						},
					},
					type: 'object',
					additionalProperties: false,
					properties: {
						slug: {
							type: 'string',
							const: slug,
						},
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
					},
					required: ['type', 'links'],
				},
			);

			const result = await new Promise<any>(async (resolve, reject) => {
				emitter.on('data', (change) => {
					resolve(change.after);
				});

				emitter.on('error', reject);

				// Insert a second link between contract 1 and contract 3 - this should trigger a stream update
				ctx.kernel.insertContract(ctx.logContext, ctx.kernel.adminSession()!, {
					type: 'link@1.0.0',
					name: 'is attached to',
					data: {
						inverseName: 'has attached element',
						from: {
							id: contract1.id,
							type: contract1.type,
						},
						to: {
							id: contract3.id,
							type: contract3.type,
						},
					},
				});
			});

			// Link data can come in an indeterminate sort order, so we sort it here for convenience
			result.links['is attached to'] = _.sortBy(
				result.links['is attached to'],
				'slug',
			);

			expect(result).toEqual({
				type: 'card@1.0.0',
				id: contract1.id,
				slug,
				links: {
					'is attached to': _.sortBy(
						[
							{
								slug: contract3.slug,
							},
							{
								slug: contract2.slug,
							},
						],
						'slug',
					),
				},
			});
			emitter.close();
		});

		test('should be able to resolve links on an update to the linked contract', (done) => {
			const slug = testUtils.generateRandomSlug();

			ctx.kernel
				.stream(ctx.logContext, ctx.kernel.adminSession()!, {
					$$links: {
						'is attached to': {
							type: 'object',
							additionalProperties: false,
							properties: {
								slug: true,
							},
						},
					},
					type: 'object',
					additionalProperties: false,
					properties: {
						slug: {
							const: slug,
						},
						type: {
							const: 'card@1.0.0',
						},
						links: true,
					},
				})
				.then(async (emitter: Stream) => {
					const contract1 = await ctx.kernel.insertContract(
						ctx.logContext,
						ctx.kernel.adminSession()!,
						{
							slug,
							type: 'card@1.0.0',
							version: '1.0.0',
							data: {
								test: 1,
							},
						},
					);

					const contract2 = await ctx.kernel.insertContract(
						ctx.logContext,
						ctx.kernel.adminSession()!,
						{
							active: false,
							type: 'card@1.0.0',
							data: {
								test: 2,
							},
						},
					);

					await ctx.kernel.insertContract(
						ctx.logContext,
						ctx.kernel.adminSession()!,
						{
							slug: `link-${contract1.slug}-is-attached-to-${contract2.slug}`,
							type: 'link@1.0.0',
							name: 'is attached to',
							data: {
								inverseName: 'has attached element',
								from: {
									id: contract1.id,
									type: contract1.type,
								},
								to: {
									id: contract2.id,
									type: contract2.type,
								},
							},
						},
					);

					emitter.on('data', (change) => {
						expect(change.after).toEqual({
							id: change.id,
							slug,
							type: 'card@1.0.0',
							links: {
								'is attached to': [
									{
										slug: contract2.slug,
									},
								],
							},
						});

						emitter.close();
					});

					emitter.on('error', done);
					emitter.on('closed', done);

					ctx.kernel.patchContractBySlug(
						ctx.logContext,
						ctx.kernel.adminSession()!,
						`${contract2.slug}@${contract1.version}`,
						[
							{
								op: 'replace',
								path: '/data/test',
								value: 3,
							},
						],
					);
				});
		});

		it('should send the unmatch event when a previously matching contract does not match anymore', async () => {
			const slug = testUtils.generateRandomSlug();
			const stream = await ctx.kernel.stream(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					additionalProperties: false,
					properties: {
						slug: {
							const: slug,
						},
						data: {
							properties: {
								status: {
									const: 'open',
								},
							},
						},
					},
				},
			);

			let id: string | null = null;
			let stage = 0;
			stream.on('data', async (change) => {
				if (stage === 0) {
					id = change.id;
					expect(change).toEqual({
						id,
						type: 'insert',
						contractType: 'card@1.0.0',
						after: {
							slug,
							id,
							data: {
								status: 'open',
							},
							type: 'card@1.0.0',
						},
					});

					stage = 1;
					await ctx.kernel.patchContractBySlug(
						ctx.logContext,
						ctx.kernel.adminSession()!,
						`${slug}@1.0.0`,
						[
							{
								op: 'replace',
								path: '/data/status',
								value: 'closed',
							},
						],
					);
				} else {
					expect(change).toEqual({
						id,
						type: 'unmatch',
						contractType: 'card@1.0.0',
						after: null,
					});

					stream.close();
				}
			});

			const end = once(stream, 'closed');

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug,
					type: 'card@1.0.0',
					data: {
						status: 'open',
					},
				},
			);

			await end;
		});

		it('should send the dataset event on a query request and support the unmatch event for these contracts', async () => {
			const slug = testUtils.generateRandomSlug();
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug,
					type: 'card@1.0.0',
					data: {
						status: 'open',
					},
				},
			);

			const stream = await ctx.kernel.stream(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					additionalProperties: false,
					properties: {
						slug: {
							const: slug,
						},
						data: {
							properties: {
								status: {
									const: 'open',
								},
							},
						},
					},
				},
			);

			let stage = 0;
			const queryId = randomUUID();

			stream.on('dataset', async (payload) => {
				expect(stage).toEqual(0);
				expect(payload).toEqual({
					id: queryId,
					cards: [contract],
				});

				stage = 1;
				await ctx.kernel.patchContractBySlug(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					`${slug}@1.0.0`,
					[
						{
							op: 'replace',
							path: '/data/status',
							value: 'closed',
						},
					],
				);
			});

			stream.on('data', (change) => {
				expect(stage).toEqual(1);
				expect(change).toEqual({
					id: contract.id,
					type: 'unmatch',
					contractType: 'card@1.0.0',
					after: null,
				});

				stream.close();
			});

			stream.emit('query', {
				id: queryId,
				schema: {
					properties: {
						slug: {
							const: slug,
						},
					},
				},
			});

			await once(stream, 'closed');
		});

		it('issue #1128: should be able to query for two nested optional links', async () => {
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: testUtils.generateRandomSlug(),
					type: 'card@1.0.0',
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					properties: {
						id: {
							const: contract.id,
						},
					},
					anyOf: [
						{
							$$links: {
								'is attached to': {
									anyOf: [
										{
											$$links: {
												'is attached to': {},
											},
										},
										true,
									],
								},
							},
						},
						true,
					],
				},
			);

			expect(results).toEqual([contract]);
		});

		it('should respond to an unmatch update to the linked contract', async () => {
			const slug = testUtils.generateRandomSlug();

			const contract1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug,
					type: 'card@1.0.0',
					version: '1.0.0',
					data: {
						test: 1,
					},
				},
			);

			const contract2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					active: false,
					type: 'card@1.0.0',
					data: {
						test: 2,
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'link@1.0.0',
					name: 'is attached to',
					data: {
						inverseName: 'has attached element',
						from: {
							id: contract1.id,
							type: contract1.type,
						},
						to: {
							id: contract2.id,
							type: contract2.type,
						},
					},
				},
			);

			const stream = await ctx.kernel.stream(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					$$links: {
						'is attached to': {
							type: 'object',
							additionalProperties: false,
							properties: {
								type: {
									const: 'card@1.0.0',
								},
								slug: {
									type: 'string',
								},
								data: {
									type: 'object',
									properties: {
										test: {
											const: 2,
										},
									},
								},
							},
						},
					},
					type: 'object',
					additionalProperties: false,
					properties: {
						slug: {
							type: 'string',
							const: slug,
						},
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
					},
				},
			);

			const result: any = await new Promise(async (resolve, reject) => {
				stream.on('data', (change) => {
					resolve(change);
				});

				stream.on('error', reject);

				ctx.kernel.patchContractBySlug(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					`${contract2.slug}@${contract2.version}`,
					[
						{
							op: 'replace',
							path: '/data/test',
							value: 3,
						},
					],
				);
			});

			expect(result.id).toEqual(contract1.id);
			expect(result.type).toEqual('unmatch');
		});

		it('should gracefully handle disconnects', async () => {
			const slug = testUtils.generateRandomSlug({
				prefix: 'contract',
			});

			const emitter = await ctx.kernel.stream(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'object',
					additionalProperties: false,
					properties: {
						type: {
							type: 'string',
						},
						slug: {
							type: 'string',
							const: slug,
						},
						active: {
							type: 'boolean',
						},
						links: {
							type: 'object',
						},
						tags: {
							type: 'array',
						},
						data: {
							type: 'object',
							properties: {
								test: {
									type: 'number',
								},
							},
						},
					},
					required: ['slug'],
				},
			);

			ctx.kernel.insertContract(ctx.logContext, ctx.kernel.adminSession()!, {
				slug,
				type: 'card@1.0.0',
				version: '1.0.0',
				data: {
					test: 1,
				},
			});

			ctx.kernel.insertContract(ctx.logContext, ctx.kernel.adminSession()!, {
				type: 'card@1.0.0',
				data: {
					test: 2,
				},
			});

			await delay(1);

			await ctx.kernel.disconnect(ctx.logContext);
			await emitter.close();
		});
	});
});
