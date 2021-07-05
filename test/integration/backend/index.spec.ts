/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import * as _ from 'lodash';
import * as Bluebird from 'bluebird';
import * as errors from '../../../lib/errors';
import * as helpers from './helpers';
import { JSONSchema } from '@balena/jellyfish-types';
import { Contract } from '@balena/jellyfish-types/build/core';

let ctx: helpers.BackendContext;

beforeAll(async () => {
	ctx = await helpers.before();
});

afterAll(() => {
	return helpers.after(ctx);
});

describe('backend', () => {
	describe('.disconnect()', () => {
		it('should not throw if called multiple times', async () => {
			const localCTX = await helpers.before();

			await expect(
				(async () => {
					await localCTX.backend.disconnect(localCTX.context);
					await localCTX.backend.disconnect(localCTX.context);
					await localCTX.backend.disconnect(localCTX.context);
				})(),
			).resolves.not.toThrow();

			await helpers.after(localCTX);
		});

		it('should gracefully close streams', async () => {
			const localCTX = await helpers.before();

			await expect(
				(async () => {
					await localCTX.backend.stream(
						localCTX.context,
						{},
						{
							type: 'object',
						},
					);
					await localCTX.backend.disconnect(localCTX.context);
				})(),
			).resolves.not.toThrow();

			await helpers.after(localCTX);
		});
	});

	describe('.getElementsById()', () => {
		it('should return an empty array given one non-existent element', async () => {
			const result = await ctx.backend.getElementsById(ctx.context, [
				'4a962ad9-20b5-4dd8-a707-bf819593cc84',
			]);

			expect(result).toEqual([]);
		});

		it('should return a found element', async () => {
			const element = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				data: {},
				links: {},
				active: true,
			} as any);

			const result = await ctx.backend.getElementsById(ctx.context, [
				element.id,
			]);

			expect(result).toEqual([element]);
		});

		it('should omit not found elements', async () => {
			const element = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				linked_at: {},
				capabilities: [],
				created_at: new Date().toISOString(),
				data: {},
				links: {},
				active: true,
			} as any);

			const result = await ctx.backend.getElementsById(ctx.context, [
				element.id,
				'4a962ad9-20b5-4dd8-a707-bf819593cc84',
			]);

			expect(result).toEqual([element]);
		});

		it('.getElementsById() should get deterministic results', async () => {
			const element = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				tags: [],
				loop: null,
				linked_at: {},
				links: {},
				markers: [],
				requires: [],
				data: {},
				capabilities: [],
				created_at: new Date().toISOString(),
				active: true,
			} as any);

			const result1 = await ctx.backend.getElementsById(ctx.context, [
				element.id,
				'4a962ad9-20b5-4dd8-a707-bf819593cc84',
			]);

			const result2 = await ctx.backend.getElementsById(ctx.context, [
				element.id,
				'4a962ad9-20b5-4dd8-a707-bf819593cc84',
			]);

			const result3 = await ctx.backend.getElementsById(ctx.context, [
				element.id,
				'4a962ad9-20b5-4dd8-a707-bf819593cc84',
			]);

			expect(result1).toEqual(result2);
			expect(result2).toEqual(result3);
		});
	});

	describe('.getElementById()', () => {
		it('should return null if the element id is not present', async () => {
			const result = await ctx.backend.getElementById(
				ctx.context,
				ctx.generateRandomID(),
			);

			expect(result).toBeNull();
		});

		it('.getElementById() should not break the cache if trying to query a valid slug with it', async () => {
			const element = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				links: {},
				data: {},
				linked_at: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				active: true,
			} as any);

			const result1 = await ctx.backend.getElementById(
				ctx.context,
				element.slug,
			);

			expect(result1).toBeNull();

			const result2 = await ctx.backend.getElementBySlug(
				ctx.context,
				`${element.slug}@1.0.0`,
			);

			expect(result2).toEqual(element);
		});
	});

	describe('.getElementBySlug()', () => {
		it('should not break the cache if trying to query a valid id with it', async () => {
			const element = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				linked_at: {},
				links: {},
				tags: [],
				loop: null,
				data: {},
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				active: true,
			});

			const result1 = await ctx.backend.getElementBySlug(
				ctx.context,
				`${element.id}@${element.version}`,
			);

			expect(result1).toBeNull();

			const result2 = await ctx.backend.getElementById(ctx.context, element.id);

			expect(result2).toEqual(element);
		});

		it('should return null if the element slug is not present', async () => {
			const result = await ctx.backend.getElementBySlug(
				ctx.context,
				`${ctx.generateRandomSlug()}@1.0.0`,
			);

			expect(result).toBeNull();
		});

		it('should fetch an element given its slug', async () => {
			const element = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				linked_at: {},
				data: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				active: true,
			});

			const result = await ctx.backend.getElementBySlug(
				ctx.context,
				`${element.slug}@1.0.0`,
			);

			expect(result).toEqual(element);
		});

		it('should return null given the wrong version', async () => {
			const element = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				linked_at: {},
				data: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				active: true,
			});

			const result = await ctx.backend.getElementBySlug(
				ctx.context,
				`${element.slug}@2.0.0`,
			);

			expect(result).toBeNull();
		});

		it('should fetch an element given the correct version', async () => {
			const element = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				linked_at: {},
				data: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				active: true,
			});

			const result = await ctx.backend.getElementBySlug(
				ctx.context,
				`${element.slug}@1.0.0`,
			);

			expect(result).toEqual(element);
		});
	});

	describe('.insertElement()', () => {
		it('should not insert an element without a slug nor an id to an existing table', async () => {
			await expect(
				ctx.backend.insertElement(ctx.context, {
					version: '1.0.0',
					tags: [],
					loop: null,
					markers: [],
					data: {},
					links: {},
					requires: [],
					capabilities: [],
					linked_at: {},
					created_at: new Date().toISOString(),
					active: true,
				} as any),
			).rejects.toThrow(errors.JellyfishDatabaseError);
		});

		it('should not insert an element without a type', async () => {
			await expect(
				ctx.backend.insertElement(ctx.context, {
					slug: ctx.generateRandomSlug(),
					version: '1.0.0',
					tags: [],
					loop: null,
					markers: [],
					links: {},
					data: {},
					requires: [],
					capabilities: [],
					linked_at: {},
					created_at: new Date().toISOString(),
					active: true,
				} as any),
			).rejects.toThrow(errors.JellyfishDatabaseError);
		});

		it('should fail to insert an element with a very long slug', async () => {
			await expect(
				ctx.backend.insertElement(ctx.context, {
					slug: _.join(_.times(500, _.constant('x')), ''),
					version: '1.0.0',
					tags: [],
					loop: null,
					links: {},
					markers: [],
					requires: [],
					data: {},
					capabilities: [],
					linked_at: {},
					created_at: new Date().toISOString(),
					type: 'card@1.0.0',
					active: true,
				}),
			).rejects.toThrow(errors.JellyfishInvalidSlug);
		});

		it('should insert an element with a non-existent slug', async () => {
			const result = await ctx.backend.insertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				links: {},
				requires: [],
				data: {},
				linked_at: {},
				capabilities: [],
				created_at: new Date().toISOString(),
				active: true,
				type: 'card@1.0.0',
			});

			const element = await ctx.backend.getElementById(ctx.context, result.id);

			expect(element).toEqual(result);
		});

		it('should insert an element with a user defined id', async () => {
			const id = ctx.generateRandomID();
			const result = await ctx.backend.insertElement(ctx.context, {
				id,
				active: true,
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				data: {},
				markers: [],
				requires: [],
				linked_at: {},
				capabilities: [],
				created_at: new Date().toISOString(),
				type: 'card@1.0.0',
			});

			expect(result.id).toBe(id);

			const element = await ctx.backend.getElementById(ctx.context, result.id);

			expect(
				Object.assign({}, element, {
					id: result.id,
				}),
			).toEqual(result);
		});

		it('should fail to insert an element with an existent id', async () => {
			const result1 = await ctx.backend.insertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				active: true,
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				data: {},
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				type: 'card@1.0.0',
			});

			await expect(
				ctx.backend.insertElement(ctx.context, {
					id: result1.id,
					slug: ctx.generateRandomSlug(),
					version: '1.0.0',
					tags: [],
					loop: null,
					data: {},
					links: {},
					markers: [],
					requires: [],
					capabilities: [],
					linked_at: {},
					created_at: new Date().toISOString(),
					active: true,
					type: 'card@1.0.0',
				}),
			).rejects.toThrow(errors.JellyfishElementAlreadyExists);
		});

		it('should fail to insert an element with an existent slug', async () => {
			const result = await ctx.backend.insertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				data: {},
				links: {},
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				active: true,
				type: 'card@1.0.0',
			});

			await expect(
				ctx.backend.insertElement(ctx.context, {
					slug: result.slug,
					active: true,
					version: '1.0.0',
					tags: [],
					loop: null,
					links: {},
					markers: [],
					requires: [],
					data: {},
					capabilities: [],
					linked_at: {},
					created_at: new Date().toISOString(),
					type: 'card@1.0.0',
				}),
			).rejects.toThrow(errors.JellyfishElementAlreadyExists);
		});

		it('should fail to insert an element with a non-existent id but existent slug', async () => {
			const result = await ctx.backend.insertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				links: {},
				requires: [],
				data: {},
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				active: true,
				type: 'card@1.0.0',
			});

			const id = ctx.generateRandomID();
			expect(result.id).not.toBe(id);

			await expect(
				ctx.backend.insertElement(ctx.context, {
					id,
					type: 'card@1.0.0',
					version: '1.0.0',
					tags: [],
					loop: null,
					links: {},
					markers: [],
					data: {},
					requires: [],
					capabilities: [],
					linked_at: {},
					created_at: new Date().toISOString(),
					active: true,
					slug: result.slug,
				}),
			).rejects.toThrow(errors.JellyfishElementAlreadyExists);
		});

		it('should handle multiple parallel insertions on the same slug', async () => {
			const slug = ctx.generateRandomSlug();
			for (const time of _.range(200)) {
				const object = {
					slug,
					links: {},
					type: 'stress-test@1.0.0',
					version: '1.0.0',
					tags: [],
					loop: null,
					markers: [],
					linked_at: {},
					requires: [],
					capabilities: [],
					created_at: new Date().toISOString(),
					updated_at: null,
					active: true,
					data: {
						time,
					},
				};

				await expect(
					Bluebird.all([
						ctx.backend.insertElement(ctx.context, _.clone(object)),
						ctx.backend.insertElement(ctx.context, _.clone(object)),
						ctx.backend.insertElement(ctx.context, _.clone(object)),
						ctx.backend.insertElement(ctx.context, _.clone(object)),
					]),
				).rejects.toThrow(errors.JellyfishElementAlreadyExists);

				const results = await ctx.backend.query(
					ctx.context,
					{},
					{
						type: 'object',
						required: ['type', 'slug'],
						properties: {
							type: {
								type: 'string',
								const: object.type,
							},
							slug: {
								type: 'string',
								const: slug,
							},
						},
					},
				);

				expect(results).toHaveLength(1);
			}
		});
	});

	describe('.upsertElement()', () => {
		it('should not be able to change a slug', async () => {
			const slug1 = ctx.generateRandomSlug();
			const result1 = await ctx.backend.upsertElement(ctx.context, {
				type: 'card@1.0.0',
				slug: slug1,
				data: {
					hello: 'world',
				},
				linked_at: {},
				links: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				active: true,
			});

			await expect(
				ctx.backend.upsertElement(ctx.context, {
					id: result1.id,
					type: 'card@1.0.0',
					slug: ctx.generateRandomSlug(),
					links: {},
					linked_at: {},
					version: '1.0.0',
					tags: [],
					loop: null,
					markers: [],
					data: {
						hello: 'world2',
					},
					requires: [],
					capabilities: [],
					created_at: new Date().toISOString(),
					active: true,
				}),
			).rejects.toThrow();
		});

		it('should not insert an element without a type', async () => {
			await expect(
				ctx.backend.upsertElement(ctx.context, {
					slug: ctx.generateRandomSlug(),
					version: '1.0.0',
					tags: [],
					loop: null,
					markers: [],
					links: {},
					data: {},
					linked_at: {},
					requires: [],
					capabilities: [],
					created_at: new Date().toISOString(),
					active: true,
				} as any),
			).rejects.toThrow(errors.JellyfishDatabaseError);
		});

		it('should insert a card with a slug', async () => {
			const result = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				linked_at: {},
				data: {},
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				active: true,
			});

			expect(result.id).not.toBe('example');
			const element = await ctx.backend.getElementById(ctx.context, result.id);

			expect(element).toEqual(result);
		});

		it('should replace an element given the slug but no id', async () => {
			const result1 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				data: {},
				linked_at: {},
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				active: true,
			});

			const result2 = await ctx.backend.upsertElement(ctx.context, {
				slug: result1.slug,
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				linked_at: {},
				tags: [],
				loop: null,
				data: {},
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				active: true,
			});

			expect(result1.id).toBe(result2.id);
			const element = await ctx.backend.getElementById(ctx.context, result1.id);

			expect(element).toEqual(result2);
		});

		it('should let clients pick their own ids', async () => {
			const id = ctx.generateRandomID();
			const result = await ctx.backend.upsertElement(ctx.context, {
				id,
				type: 'card@1.0.0',
				active: true,
				slug: ctx.generateRandomSlug(),
				links: {},
				linked_at: {},
				data: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
			});

			expect(result.id).toBe(id);
			const element = await ctx.backend.getElementById(ctx.context, result.id);

			expect(
				Object.assign({}, element, {
					id: result.id,
				}),
			).toEqual(result);
		});

		it('should not be able to upsert without a slug nor an id', async () => {
			await expect(
				ctx.backend.upsertElement(ctx.context, {
					version: '1.0.0',
					tags: [],
					loop: null,
					data: {},
					markers: [],
					links: {},
					linked_at: {},
					requires: [],
					capabilities: [],
					created_at: new Date().toISOString(),
					active: true,
				} as any),
			).rejects.toThrow(errors.JellyfishDatabaseError);
		});

		it(
			'should not consider ids when inserting an element with an existing id' +
				', but matching the slug of another element',
			async () => {
				const result1 = await ctx.backend.upsertElement(ctx.context, {
					slug: ctx.generateRandomSlug(),
					active: true,
					version: '1.0.0',
					links: {},
					tags: [],
					loop: null,
					data: {},
					linked_at: {},
					markers: [],
					requires: [],
					capabilities: [],
					created_at: new Date().toISOString(),
					type: 'card@1.0.0',
				});

				const result2 = await ctx.backend.upsertElement(ctx.context, {
					slug: ctx.generateRandomSlug(),
					active: true,
					type: 'card@1.0.0',
					version: '1.0.0',
					links: {},
					tags: [],
					loop: null,
					linked_at: {},
					data: {},
					markers: [],
					requires: [],
					capabilities: [],
					created_at: new Date().toISOString(),
				});

				const result3 = await ctx.backend.upsertElement(ctx.context, {
					id: result2.id,
					slug: result1.slug,
					type: 'card@1.0.0',
					links: {},
					data: {},
					version: '1.0.0',
					linked_at: {},
					tags: [],
					loop: null,
					markers: [],
					requires: [],
					capabilities: [],
					created_at: new Date().toISOString(),
					active: true,
				});

				expect(result3).toEqual({
					id: result1.id,
					created_at: result3.created_at,
					updated_at: result3.updated_at,
					capabilities: [],
					active: true,
					name: null,
					type: 'card@1.0.0',
					linked_at: {},
					version: '1.0.0',
					links: {},
					tags: [],
					loop: null,
					markers: [],
					requires: [],
					data: {},
					slug: result1.slug,
				});
			},
		);

		it('should replace an element with an existing id and the slug of the same element', async () => {
			const result1 = await ctx.backend.upsertElement(ctx.context, {
				type: 'card@1.0.0',
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				links: {},
				data: {},
				tags: [],
				loop: null,
				linked_at: {},
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				active: true,
			});

			const result2 = await ctx.backend.upsertElement(ctx.context, {
				id: result1.id,
				type: 'card@1.0.0',
				slug: result1.slug,
				links: {},
				data: {},
				version: '1.0.0',
				linked_at: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				active: true,
			});

			expect(result1.id).toBe(result2.id);
			const element = await ctx.backend.getElementById(ctx.context, result1.id);

			expect(element).toEqual(result2);
		});

		it('should ignore the id when inserting an element with a non existing id and the slug of an element', async () => {
			const result1 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				data: {},
				tags: [],
				loop: null,
				markers: [],
				linked_at: {},
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				active: true,
			});

			const result2 = await ctx.backend.upsertElement(ctx.context, {
				id: '9af7cf33-1a29-4f0c-a73b-f6a2b149850c',
				slug: result1.slug,
				type: 'card@1.0.0',
				links: {},
				version: '1.0.0',
				linked_at: {},
				tags: [],
				loop: null,
				data: {},
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				active: true,
			});

			expect(result2.id).not.toBe('9af7cf33-1a29-4f0c-a73b-f6a2b149850c');
			expect(result2).toEqual({
				id: result1.id,
				created_at: result2.created_at,
				updated_at: result2.updated_at,
				links: {},
				name: null,
				version: '1.0.0',
				tags: [],
				loop: null,
				linked_at: {},
				data: {},
				markers: [],
				requires: [],
				capabilities: [],
				active: true,
				slug: result1.slug,
				type: 'card@1.0.0',
			});
		});

		it('should not insert an element with a non-matching id nor slug', async () => {
			await expect(
				ctx.backend.upsertElement(ctx.context, {
					id: '9af7cf33-1a29-4f0c-a73b-f6a2b149850c',
					version: '1.0.0',
					tags: [],
					loop: null,
					data: {},
					links: {},
					linked_at: {},
					markers: [],
					requires: [],
					capabilities: [],
					created_at: new Date().toISOString(),
					active: true,
				} as any),
			).rejects.toThrow(errors.JellyfishDatabaseError);
		});

		it('should handle multiple parallel insertions on the same slug', async () => {
			const slug = ctx.generateRandomSlug();
			for (const time of _.range(200)) {
				const object = {
					slug,
					active: true,
					version: '1.0.0',
					links: {},
					tags: [],
					loop: null,
					markers: [],
					linked_at: {},
					requires: [],
					capabilities: [],
					created_at: new Date().toISOString(),
					updated_at: null,
					type: 'stress-test@1.0.0',
					data: {
						time,
					},
				};

				await Bluebird.all([
					ctx.backend.upsertElement(ctx.context, _.clone(object)),
					ctx.backend.upsertElement(ctx.context, _.clone(object)),
					ctx.backend.upsertElement(ctx.context, _.clone(object)),
					ctx.backend.upsertElement(ctx.context, _.clone(object)),
					ctx.backend.upsertElement(ctx.context, _.clone(object)),
					ctx.backend.upsertElement(ctx.context, _.clone(object)),
					ctx.backend.upsertElement(ctx.context, _.clone(object)),
					ctx.backend.upsertElement(ctx.context, _.clone(object)),
				]);

				const results = await ctx.backend.query(
					ctx.context,
					{},
					{
						type: 'object',
						required: ['type'],
						properties: {
							slug: {
								type: 'string',
								const: slug,
							},
							type: {
								type: 'string',
								const: object.type,
							},
						},
					},
				);

				expect(results).toHaveLength(1);
			}
		});

		it('should created indexes for type cards with the indexed_fields field', async () => {
			const typeCard = {
				slug: 'test-link',
				type: 'type@1.0.0',
				version: '1.0.0',
				markers: [],
				tags: [],
				loop: null,
				links: {},
				active: true,
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				data: {
					schema: {
						type: 'object',
						properties: {
							name: {
								type: 'string',
							},
							slug: {
								type: 'string',
								pattern: '^link-[a-z0-9-]+$',
							},
							type: {
								type: 'string',
								enum: ['link', 'link@1.0.0'],
							},
							links: {
								type: 'object',
								additionalProperties: false,
								properties: {},
							},
							data: {
								type: 'object',
								properties: {
									inverseName: {
										type: 'string',
									},
									from: {
										type: 'object',
										required: ['id', 'type'],
										properties: {
											id: {
												type: 'string',
												format: 'uuid',
											},
											type: {
												type: 'string',
												pattern: '^[a-z0-9-]+@\\d+\\.\\d+\\.\\d+$',
											},
										},
									},
									to: {
										type: 'object',
										required: ['id', 'type'],
										properties: {
											id: {
												type: 'string',
												format: 'uuid',
											},
											type: {
												type: 'string',
												pattern: '^[a-z0-9-]+@\\d+\\.\\d+\\.\\d+$',
											},
										},
									},
								},
								required: ['inverseName', 'from', 'to'],
							},
						},
						required: ['name', 'type', 'links', 'data'],
					},
					indexed_fields: [['data.from.id', 'name', 'data.to.id']],
				},
				requires: [],
				capabilities: [],
			};

			await ctx.backend.upsertElement(ctx.context, typeCard);

			await Bluebird.delay(2000);

			const indexes = await ctx.backend.any(`
		SELECT * FROM pg_indexes WHERE tablename = 'cards';
	`);

			// Look for an index with the expected name
			const typeIndex = _.find(indexes, {
				indexname: `${typeCard.slug}__data_from_id__name__data_to_id__idx`,
			});

			expect(typeIndex).toBeTruthy();
		});
	});

	describe('.query()', () => {
		it('should correctly take string contraints on the uuid', async () => {
			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					additionalProperties: true,
					required: ['id'],
					properties: {
						id: {
							type: 'string',
							// TS-TODO: add typings for Regexp to JSONSchemaQL schemas
							regexp: {
								pattern: 'assume',
								flags: 'i',
							},
						} as any,
					},
				},
			);

			expect(results).toEqual([]);
		});

		it('should not throw "missing FROM-clause" error', async () => {
			await expect(
				ctx.backend.query(
					ctx.context,
					{},
					{
						type: 'object',
						anyOf: [
							{
								type: 'object',
								additionalProperties: false,
							},
							{
								$$links: {
									'is attached to': {
										type: 'object',
									},
								},
							},
						],
					},
				),
			).resolves.not.toThrow();
		});

		it('should query the database using JSON schema', async () => {
			const result1 = await ctx.backend.upsertElement(ctx.context, {
				type: 'example@1.0.0',
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				tags: [],
				loop: null,
				links: {},
				data: {
					test: 1,
				},
				markers: [],
				requires: [],
				linked_at: {},
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
			});

			await ctx.backend.upsertElement(ctx.context, {
				type: 'test@1.0.0',
				slug: ctx.generateRandomSlug(),
				links: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				data: {
					test: 2,
				},
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
			});

			const result2 = await ctx.backend.upsertElement(ctx.context, {
				type: 'example@1.0.0',
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				linked_at: {},
				requires: [],
				data: {
					test: 3,
				},
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
			});

			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					additionalProperties: true,
					properties: {
						id: {
							type: 'string',
						},
						active: {
							type: 'boolean',
						},
						slug: {
							type: 'string',
						},
						data: {
							type: 'object',
							required: ['test'],
							properties: {
								test: {
									type: 'number',
								},
							},
						},
						type: {
							type: 'string',
							pattern: '^example@1.0.0$',
						},
					},
					required: ['id', 'active', 'slug', 'data', 'type'],
				},
			);

			expect(_.sortBy(results, 'data.test')).toEqual([result1, result2]);
		});

		it('should escape malicious query keys', async () => {
			await expect(
				ctx.backend.query(
					ctx.context,
					{
						data: {
							"Robert'); DROP TABLE cards; --": {
								"Robert'); DROP TABLE cards; --": {},
							},
						},
					} as any,
					{
						type: 'object',
						properties: {
							data: {
								type: 'object',
								properties: {
									"Robert'); DROP TABLE cards; --": {
										type: 'object',
										properties: {
											"Robert'); DROP TABLE cards; --": {
												type: 'string',
												const: 'foo@1.0.0',
											},
										},
									},
								},
							},
						},
						required: ['data'],
					},
				),
			).resolves.not.toThrow();
		});

		it('should escape malicious query values', async () => {
			const injection = 'id FROM cards; DROP TABLE cards; COMMIT; SELECT *';
			await expect(
				ctx.backend.query(
					ctx.context,
					{
						[injection]: {},
					} as any,
					{
						type: 'object',
						properties: {
							[injection]: {
								type: 'string',
								const: 'foo@1.0.0',
							},
						},
						required: [injection],
					},
				),
			).rejects.toHaveProperty(
				'message',
				`column cards.${injection} does not exist`,
			);

			await expect(
				ctx.backend.query(
					ctx.context,
					{
						slug: {},
					},
					{
						type: 'object',
						properties: {
							slug: {
								type: 'string',
								const: "Robert'; DROP TABLE cards; --",
							},
						},
						required: ['slug'],
					},
				),
			).resolves.not.toThrow();

			await expect(
				ctx.backend.query(
					ctx.context,
					{
						name: {},
					} as any,
					{
						type: 'object',
						properties: {
							name: {
								type: 'string',
								const: "Robert'; DROP TABLE cards; --",
							},
						},
						required: ['name'],
					},
				),
			).resolves.not.toThrow();
		});

		it('should survive a deep schema', async () => {
			const generate = (
				times: number,
				seeds: string[],
				index = 0,
			): JSONSchema => {
				if (times === 0) {
					return {
						type: 'string',
						const: 'hello',
					};
				}

				const next = seeds[index % seeds.length];

				return {
					type: 'object',
					required: ['data'],
					properties: {
						data: {
							type: 'object',
							required: ['other', 'next'],
							properties: {
								other: {
									type: ['string', 'number'],
								},
								[next]: generate(times - 1, seeds, index + 1),
							},
						},
					},
				};
			};

			const results1 = await ctx.backend.query(
				ctx.context,
				{},
				generate(50, ['foo', 'bar']),
			);

			expect(results1).toEqual([]);

			const results2 = await ctx.backend.query(
				ctx.context,
				{},
				generate(80, ['foo', 'bar']),
			);

			expect(results2).toEqual([]);
		});

		it('should query an element by its id', async () => {
			const result = await ctx.backend.upsertElement(ctx.context, {
				type: 'example@1.0.0',
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				data: {
					test: 1,
				},
				markers: [],
				requires: [],
				linked_at: {},
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				slug: ctx.generateRandomSlug(),
				active: true,
			});

			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					properties: {
						id: {
							type: 'string',
							const: result.id,
						},
					},
					required: ['id'],
					additionalProperties: true,
				},
			);

			expect(results).toEqual([result]);
		});

		it('should fail to query an element by its id', async () => {
			const result = await ctx.backend.upsertElement(ctx.context, {
				type: 'example',
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				linked_at: {},
				data: {},
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				active: true,
			});

			const otherId = ctx.generateRandomID();
			expect(result.id).not.toBe(otherId);

			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					properties: {
						id: {
							type: 'string',
							const: otherId,
						},
					},
					required: ['id'],
				},
			);

			expect(results).toEqual([]);
		});

		it('should query an element by its slug', async () => {
			const result = await ctx.backend.upsertElement(ctx.context, {
				type: 'example@1.0.0',
				slug: ctx.generateRandomSlug(),
				links: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				data: {
					test: 1,
				},
				markers: [],
				requires: [],
				linked_at: {},
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
			});

			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					properties: {
						slug: {
							type: 'string',
							const: result.slug,
						},
					},
					required: ['slug'],
					additionalProperties: true,
				},
			);

			expect(results).toEqual([result]);
		});

		it('should fail to query an element by its slug', async () => {
			await ctx.backend.upsertElement(ctx.context, {
				type: 'example',
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				tags: [],
				loop: null,
				links: {},
				markers: [],
				requires: [],
				data: {
					test: 1,
				},
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
			});

			const results = await ctx.backend.query(
				ctx.context,
				{
					slug: {},
				},
				{
					type: 'object',
					properties: {
						slug: {
							type: 'string',
							const: 'xxxxxxxxx',
						},
					},
					required: ['slug'],
				},
			);

			expect(results).toEqual([]);
		});

		it('should handle integer float limits', async () => {
			const slug = ctx.generateRandomSlug();
			for (const index of _.range(0, 1000)) {
				await ctx.backend.insertElement(ctx.context, {
					type: 'card@1.0.0',
					slug: `${slug}-${index}`,
					version: '1.0.0',
					tags: [],
					loop: null,
					links: {},
					markers: [],
					linked_at: {},
					requires: [],
					capabilities: [],
					created_at: new Date().toISOString(),
					updated_at: null,
					active: true,
					data: {
						test: index,
					},
				});
			}

			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					additionalProperties: true,
					properties: {
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
					},
					required: ['type'],
				},
				{
					limit: 15.0,
				},
			);

			expect(results.length).toBe(15);
		});

		it('should throw given float limits', async () => {
			await expect(
				ctx.backend.query(
					ctx.context,
					{},
					{
						type: 'object',
						additionalProperties: true,
						properties: {
							type: {
								type: 'string',
								const: 'card@1.0.0',
							},
						},
						required: ['type'],
					},
					{
						limit: 59.8,
					},
				),
			).rejects.toThrow(errors.JellyfishInvalidLimit);
		});

		it('should apply a maximum limit by default', async () => {
			const slug = ctx.generateRandomSlug();
			for (const index of _.range(0, 1100)) {
				await ctx.backend.insertElement(ctx.context, {
					type: 'card@1.0.0',
					slug: `${slug}-${index}`,
					version: '1.0.0',
					tags: [],
					loop: null,
					links: {},
					markers: [],
					linked_at: {},
					requires: [],
					capabilities: [],
					created_at: new Date().toISOString(),
					updated_at: null,
					active: true,
					data: {
						test: index,
					},
				});
			}

			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					additionalProperties: true,
					properties: {
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
					},
					required: ['type'],
				},
			);

			expect(results.length).toBe(1000);
		});

		it('should return nothing given a zero limit', async () => {
			const slug = ctx.generateRandomSlug();
			for (const index of _.range(0, 1000)) {
				await ctx.backend.insertElement(ctx.context, {
					type: 'card@1.0.0',
					slug: `${slug}-${index}`,
					version: '1.0.0',
					tags: [],
					loop: null,
					links: {},
					markers: [],
					linked_at: {},
					requires: [],
					capabilities: [],
					created_at: new Date().toISOString(),
					updated_at: null,
					active: true,
					data: {
						test: index,
					},
				});
			}

			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					additionalProperties: true,
					properties: {
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
					},
					required: ['type'],
				},
				{
					limit: 0,
				},
			);

			expect(results.length).toBe(0);
		});

		it('should apply a maximum limit by default given sortBy', async () => {
			const slug = ctx.generateRandomSlug();
			for (const index of _.range(0, 1100)) {
				await ctx.backend.insertElement(ctx.context, {
					type: 'card@1.0.0',
					slug: `${slug}-${index}`,
					version: '1.0.0',
					tags: [],
					loop: null,
					links: {},
					markers: [],
					linked_at: {},
					requires: [],
					capabilities: [],
					created_at: new Date().toISOString(),
					updated_at: null,
					active: true,
					data: {
						test: index,
					},
				});
			}

			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					additionalProperties: true,
					properties: {
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
					},
					required: ['type'],
				},
				{
					sortBy: 'created_at',
				},
			);

			expect(results.length).toBe(1000);
		});

		it('should throw if limit is negative', async () => {
			await expect(
				ctx.backend.query(
					ctx.context,
					{},
					{
						type: 'object',
						additionalProperties: true,
						properties: {
							type: {
								type: 'string',
								const: 'card@1.0.0',
							},
						},
						required: ['type'],
					},
					{
						limit: -1,
					},
				),
			).rejects.toThrow(errors.JellyfishInvalidLimit);
		});

		it('should throw if limit is too large', async () => {
			await expect(
				ctx.backend.query(
					ctx.context,
					{},
					{
						type: 'object',
						additionalProperties: true,
						properties: {
							type: {
								type: 'string',
								const: 'card@1.0.0',
							},
						},
						required: ['type'],
					},
					{
						limit: 3000,
					},
				),
			).rejects.toThrow(errors.JellyfishInvalidLimit);
		});

		it('should throw if limit is Infinity', async () => {
			await expect(
				ctx.backend.query(
					ctx.context,
					{},
					{
						type: 'object',
						additionalProperties: true,
						properties: {
							type: {
								type: 'string',
								const: 'card@1.0.0',
							},
						},
						required: ['type'],
					},
					{
						limit: Infinity,
					},
				),
			).rejects.toThrow(errors.JellyfishInvalidLimit);
		});

		it('should throw if limit is -Infinity', async () => {
			await expect(
				ctx.backend.query(
					ctx.context,
					{},
					{
						type: 'object',
						additionalProperties: true,
						properties: {
							type: {
								type: 'string',
								const: 'card@1.0.0',
							},
						},
						required: ['type'],
					},
					{
						limit: -Infinity,
					},
				),
			).rejects.toThrow(errors.JellyfishInvalidLimit);
		});

		it('should throw if limit is NaN', async () => {
			await expect(
				ctx.backend.query(
					ctx.context,
					{},
					{
						type: 'object',
						additionalProperties: true,
						properties: {
							type: {
								type: 'string',
								const: 'card@1.0.0',
							},
						},
						required: ['type'],
					},
					{
						limit: NaN,
					},
				),
			).rejects.toThrow(errors.JellyfishInvalidLimit);
		});

		it('should be able to limit the results', async () => {
			const result1 = await ctx.backend.upsertElement(ctx.context, {
				type: 'card@1.0.0',
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				tags: [],
				loop: null,
				links: {},
				markers: [],
				linked_at: {},
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				data: {
					test: 1,
					timestamp: '2018-07-20T23:15:45.702Z',
				},
			});

			// To ensure the created_at dates are different
			await Bluebird.delay(10);

			const result2 = await ctx.backend.upsertElement(ctx.context, {
				type: 'card@1.0.0',
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				linked_at: {},
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				data: {
					test: 2,
					timestamp: '2018-08-20T23:15:45.702Z',
				},
			});

			// To ensure the created_at dates are different
			await Bluebird.delay(10);

			const result3 = await ctx.backend.upsertElement(ctx.context, {
				type: 'card@1.0.0',
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				linked_at: {},
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				data: {
					test: 3,
					timestamp: '2018-09-20T23:15:45.702Z',
				},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					additionalProperties: true,
					properties: {
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
						slug: {
							type: 'string',
							enum: [result1.slug, result2.slug, result3.slug],
						},
					},
					required: ['type', 'slug'],
				},
				{
					sortBy: 'created_at',
					limit: 2,
				},
			);

			expect(_.sortBy(results, ['data', 'test'])).toEqual([result1, result2]);
		});

		it('should be able to skip the results', async () => {
			const result1 = await ctx.backend.upsertElement(ctx.context, {
				type: 'card@1.0.0',
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				linked_at: {},
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				data: {
					test: 1,
					timestamp: '2018-07-20T23:15:45.702Z',
				},
			});

			// To ensure the created_at dates are different
			await Bluebird.delay(10);

			const result2 = await ctx.backend.upsertElement(ctx.context, {
				type: 'card@1.0.0',
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				linked_at: {},
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				data: {
					test: 2,
					timestamp: '2018-08-20T23:15:45.702Z',
				},
			});

			// To ensure the created_at dates are different
			await Bluebird.delay(10);

			const result3 = await ctx.backend.upsertElement(ctx.context, {
				type: 'card@1.0.0',
				slug: ctx.generateRandomSlug(),
				links: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				linked_at: {},
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				data: {
					test: 3,
					timestamp: '2018-09-20T23:15:45.702Z',
				},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					additionalProperties: true,
					properties: {
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
						slug: {
							type: 'string',
							enum: [result1.slug, result2.slug, result3.slug],
						},
					},
					required: ['type', 'slug'],
				},
				{
					sortBy: 'created_at',
					skip: 2,
				},
			);

			expect(_.sortBy(results, ['data', 'test'])).toEqual([result3]);
		});

		it('should be able to skip the results of a one-element query', async () => {
			const card = await ctx.backend.upsertElement(ctx.context, {
				type: 'card@1.0.0',
				slug: ctx.generateRandomSlug(),
				links: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				linked_at: {},
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				data: {
					test: 1,
					timestamp: '2018-07-20T23:15:45.702Z',
				},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{
					id: {},
				},
				{
					type: 'object',
					properties: {
						id: {
							type: 'string',
							const: card.id,
						},
					},
					required: ['id'],
				},
				{
					skip: 1,
				},
			);

			expect(results).toEqual([]);
		});

		it('should not skip the results of a one-element query if skip is set to zero', async () => {
			const card = await ctx.backend.upsertElement(ctx.context, {
				type: 'card@1.0.0',
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				linked_at: {},
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				data: {
					test: 1,
					timestamp: '2018-07-20T23:15:45.702Z',
				},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{
					id: {},
				},
				{
					type: 'object',
					additionalProperties: false,
					properties: {
						id: {
							type: 'string',
							const: card.id,
						},
					},
					required: ['id'],
				},
				{
					skip: 0,
				},
			);

			expect(results).toEqual([
				{
					id: card.id,
				},
			]);
		});

		it('should be able to limit the results of a one-element query to 0', async () => {
			const card = await ctx.backend.upsertElement(ctx.context, {
				type: 'card@1.0.0',
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				data: {
					test: 1,
					timestamp: '2018-07-20T23:15:45.702Z',
				},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{
					id: {},
				},
				{
					type: 'object',
					properties: {
						id: {
							type: 'string',
							const: card.id,
						},
					},
					required: ['id'],
				},
				{
					limit: 0,
				},
			);

			expect(results).toEqual([]);
		});

		it('should not omit the results of a one-element query if limit is set to one', async () => {
			const card = await ctx.backend.upsertElement(ctx.context, {
				type: 'card@1.0.0',
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				linked_at: {},
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				data: {
					test: 1,
					timestamp: '2018-07-20T23:15:45.702Z',
				},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{
					id: {},
				},
				{
					type: 'object',
					additionalProperties: false,
					properties: {
						id: {
							type: 'string',
							const: card.id,
						},
					},
					required: ['id'],
				},
				{
					limit: 1,
				},
			);

			expect(results).toEqual([
				{
					id: card.id,
				},
			]);
		});

		it('should be able to limit and skip the results', async () => {
			const result1 = await ctx.backend.upsertElement(ctx.context, {
				type: 'card@1.0.0',
				slug: ctx.generateRandomSlug({
					prefix: 'foo',
				}),
				version: '1.0.0',
				tags: [],
				loop: null,
				links: {},
				markers: [],
				requires: [],
				linked_at: {},
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				data: {
					test: 1,
					timestamp: '2018-07-20T23:15:45.702Z',
				},
			});

			const result2 = await ctx.backend.upsertElement(ctx.context, {
				type: 'card@1.0.0',
				slug: ctx.generateRandomSlug({
					prefix: 'bar',
				}),
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				data: {
					test: 2,
					timestamp: '2018-08-20T23:15:45.702Z',
				},
			});

			const result3 = await ctx.backend.upsertElement(ctx.context, {
				type: 'card@1.0.0',
				slug: ctx.generateRandomSlug({
					prefix: 'baz',
				}),
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				linked_at: {},
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				data: {
					test: 3,
					timestamp: '2018-09-20T23:15:45.702Z',
				},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					additionalProperties: true,
					properties: {
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
						slug: {
							type: 'string',
							anyOf: [
								{
									const: result1.slug,
								},
								{
									const: result2.slug,
								},
								{
									const: result3.slug,
								},
							],
						},
					},
					required: ['type', 'slug'],
				},
				{
					skip: 1,
					limit: 1,
				},
			);

			expect(_.sortBy(results, ['data', 'test'])).toEqual([result2]);
		});

		it('should be able to sort the query using a key', async () => {
			const card1 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				tags: [],
				loop: null,
				links: {},
				markers: [],
				linked_at: {},
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				name: 'd',
				active: true,
				data: {},
			});

			const card2 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				active: true,
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				name: 'a',
				data: {},
			});

			const card3 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				linked_at: {},
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				name: 'c',
				data: {},
			});

			const card4 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				links: {},
				active: true,
				version: '1.0.0',
				tags: [],
				loop: null,
				linked_at: {},
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				name: 'b',
				data: {},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					additionalProperties: true,
					properties: {
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
						slug: {
							type: 'string',
							enum: [card1.slug, card2.slug, card3.slug, card4.slug],
						},
					},
					required: ['type', 'slug'],
				},
				{
					sortBy: 'name',
				},
			);

			expect(results).toEqual([card2, card4, card3, card1]);
		});

		it('should be able to sort the query in descending order', async () => {
			const card1 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				linked_at: {},
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				name: 'd',
				data: {},
			});

			const card2 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				linked_at: {},
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				name: 'a',
				data: {},
			});

			const card3 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				linked_at: {},
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				name: 'c',
				data: {},
			});

			const card4 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				links: {},
				linked_at: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				name: 'b',
				active: true,
				data: {},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					additionalProperties: true,
					properties: {
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
						slug: {
							type: 'string',
							enum: [card1.slug, card2.slug, card3.slug, card4.slug],
						},
					},
					required: ['type', 'slug'],
				},
				{
					sortBy: 'name',
					sortDir: 'desc',
				},
			);

			expect(results).toEqual([card1, card3, card4, card2]);
		});

		it('should be able to sort the query using an array of keys', async () => {
			const card1 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				data: {
					code: 'd',
				},
			});

			const card2 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				linked_at: {},
				updated_at: null,
				active: true,
				data: {
					code: 'a',
				},
			});

			const card3 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				data: {
					code: 'c',
				},
			});

			const card4 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				data: {
					code: 'b',
				},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					additionalProperties: true,
					properties: {
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
						slug: {
							type: 'string',
							enum: [card1.slug, card2.slug, card3.slug, card4.slug],
						},
					},
					required: ['type', 'slug'],
				},
				{
					sortBy: ['data', 'code'],
				},
			);

			expect(results).toEqual([card2, card4, card3, card1]);
		});

		it('should apply sort before skip', async () => {
			const card1 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				name: 'd',
				data: {},
			});

			const card2 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				linked_at: {},
				updated_at: null,
				active: true,
				name: 'a',
				data: {},
			});

			const card3 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				linked_at: {},
				updated_at: null,
				active: true,
				name: 'c',
				data: {},
			});

			const card4 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				linked_at: {},
				updated_at: null,
				active: true,
				name: 'b',
				data: {},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					additionalProperties: true,
					properties: {
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
						slug: {
							type: 'string',
							enum: [card1.slug, card2.slug, card3.slug, card4.slug],
						},
					},
					required: ['type', 'slug'],
				},
				{
					sortBy: 'name',
					skip: 2,
				},
			);

			expect(results).toEqual([card3, card1]);
		});

		it('should apply sort before limit', async () => {
			const card1 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				name: 'd',
				data: {},
			});

			const card2 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				name: 'a',
				data: {},
			});

			const card3 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				name: 'c',
				data: {},
			});

			const card4 = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'card@1.0.0',
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				name: 'b',
				data: {},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					additionalProperties: true,
					properties: {
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
						slug: {
							type: 'string',
							enum: [card1.slug, card2.slug, card3.slug, card4.slug],
						},
					},
					required: ['type', 'slug'],
				},
				{
					sortBy: 'name',
					limit: 2,
				},
			);

			expect(results).toEqual([card2, card4]);
		});

		it('should escape malicious sortBy statements', async () => {
			const injection = 'created_at; DROP TABLE cards; --';
			await expect(
				ctx.backend.query(
					ctx.context,
					{},
					{
						type: 'object',
						additionalProperties: true,
						properties: {
							type: {
								type: 'string',
								const: 'card@1.0.0',
							},
						},
						required: ['type'],
					},
					{
						sortBy: [injection],
					},
				),
			).rejects.toHaveProperty(
				'message',
				`column cards.${injection} does not exist`,
			);
		});

		it('should correctly honour top level additionalProperties: true', async () => {
			const user1 = await ctx.backend.insertElement(ctx.context, {
				slug: ctx.generateRandomSlug({
					prefix: 'user-b',
				}),
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				data: {},
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				type: 'user@1.0.0',
			});

			const user2 = await ctx.backend.insertElement(ctx.context, {
				slug: ctx.generateRandomSlug({
					prefix: 'user-a',
				}),
				active: true,
				links: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				data: {},
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				type: 'user@1.0.0',
			});

			const results1 = await ctx.backend.query(
				ctx.context,
				{
					slug: {},
					type: {},
				} as any,
				{
					type: 'object',
					anyOf: [
						{
							type: 'object',
							properties: {
								slug: {
									type: 'string',
								},
							},
							required: ['slug'],
						},
					],
					required: ['type'],
					additionalProperties: false,
					properties: {
						type: {
							type: 'string',
							const: 'user@1.0.0',
						},
					},
				},
			);

			const results2 = await ctx.backend.query(
				ctx.context,
				{
					type: {},
					slug: {},
				} as any,
				{
					type: 'object',
					anyOf: [
						{
							type: 'object',
							properties: {
								slug: {
									type: 'string',
								},
							},
							required: ['slug'],
						},
					],
					required: ['type'],
					additionalProperties: true,
					properties: {
						type: {
							type: 'string',
							const: 'user@1.0.0',
						},
					},
				},
			);

			const results3 = await ctx.backend.query(
				ctx.context,
				{
					type: {},
					slug: {},
				} as any,
				{
					type: 'object',
					anyOf: [
						{
							type: 'object',
							additionalProperties: false,
							properties: {
								slug: {
									type: 'string',
								},
							},
							required: ['slug'],
						},
					],
					required: ['type'],
					additionalProperties: true,
					properties: {
						type: {
							type: 'string',
							const: 'user@1.0.0',
						},
					},
				},
			);

			const results4 = await ctx.backend.query(
				ctx.context,
				{
					type: {},
					slug: {},
				} as any,
				{
					type: 'object',
					anyOf: [
						{
							type: 'object',
							additionalProperties: true,
							properties: {
								slug: {
									type: 'string',
								},
							},
							required: ['slug'],
						},
					],
					required: ['type'],
					additionalProperties: false,
					properties: {
						type: {
							type: 'string',
							const: 'user@1.0.0',
						},
					},
				},
			);

			expect(_.sortBy(results1, 'slug')).toEqual([
				{
					slug: user2.slug,
					type: 'user@1.0.0',
				},
				{
					slug: user1.slug,
					type: 'user@1.0.0',
				},
			]);

			expect(_.sortBy(results2, 'slug')).toEqual([user2, user1]);
			expect(_.sortBy(results3, 'slug')).toEqual([
				{
					slug: user2.slug,
				},
				{
					slug: user1.slug,
				},
			]);
			expect(_.sortBy(results4, 'slug')).toEqual([
				{
					slug: user2.slug,
					type: 'user@1.0.0',
				},
				{
					slug: user1.slug,
					type: 'user@1.0.0',
				},
			]);
		});

		it('should resolve "limit" after resolving links', async () => {
			const thread1 = await ctx.backend.upsertElement(ctx.context, {
				type: 'thread@1.0.0',
				slug: ctx.generateRandomSlug(),
				links: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				linked_at: {},
				updated_at: null,
				active: true,
				data: {},
			});

			const thread2 = await ctx.backend.upsertElement(ctx.context, {
				type: 'thread@1.0.0',
				slug: ctx.generateRandomSlug(),
				links: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				data: {},
			});

			const message = await ctx.backend.upsertElement(ctx.context, {
				type: 'message@1.0.0',
				slug: ctx.generateRandomSlug(),
				links: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				data: {
					payload: 'foo',
					count: 1,
				},
			});

			const link = await ctx.backend.upsertElement(ctx.context, {
				type: 'link@1.0.0',
				slug: `link-${message.slug}-is-attached-to-${thread2.slug}`,
				links: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				linked_at: {},
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: message.id,
						type: message.type,
					},
					to: {
						id: thread2.id,
						type: thread2.type,
					},
				},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					additionalProperties: true,
					required: ['type', 'slug'],
					$$links: {
						'has attached element': {
							type: 'object',
							additionalProperties: true,
						},
					},
					properties: {
						type: {
							type: 'string',
							const: 'thread@1.0.0',
						},
						slug: {
							type: 'string',
							enum: [thread1.slug, thread2.slug],
						},
					},
				},
				{
					limit: 1,
				},
			);

			expect(results).toEqual([
				{
					id: thread2.id,
					active: true,
					capabilities: [],
					created_at: thread2.created_at,
					updated_at: thread2.updated_at,
					linked_at: {
						'has attached element': link.created_at,
					},
					markers: [],
					name: null,
					requires: [],
					tags: [],
					loop: null,
					version: '1.0.0',
					type: thread2.type,
					slug: thread2.slug,
					links: results[0].links,
					data: {},
				},
			]);
		});

		it('should correctly build a JSONB object with no selected properties', async () => {
			const card = await ctx.backend.upsertElement(ctx.context, {
				type: 'card@1.0.0',
				slug: ctx.generateRandomSlug(),
				links: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				linked_at: {},
				updated_at: null,
				active: true,
				data: {
					test: {
						content: 0,
					},
				},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					properties: {
						id: {
							const: card.id,
						},
						data: {
							properties: {
								test: {
									additionalProperties: false,
								},
							},
						},
					},
				},
			);

			expect(results).toEqual([
				{
					id: card.id,
					active: true,
					capabilities: [],
					created_at: card.created_at,
					updated_at: card.updated_at,
					linked_at: {},
					markers: [],
					name: null,
					requires: [],
					tags: [],
					loop: null,
					version: '1.0.0',
					type: card.type,
					slug: card.slug,
					links: {},
					data: {
						test: {},
					},
				},
			]);
		});

		it('should be able to query using links', async () => {
			const thread1 = await ctx.backend.upsertElement(ctx.context, {
				type: 'thread@0.0.0',
				slug: ctx.generateRandomSlug(),
				links: {},
				version: '0.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				data: {},
			});

			const thread2 = await ctx.backend.upsertElement(ctx.context, {
				type: 'thread@0.0.0',
				slug: ctx.generateRandomSlug(),
				links: {},
				version: '0.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				data: {},
			});

			const thread3 = await ctx.backend.upsertElement(ctx.context, {
				type: 'thread@0.0.0',
				slug: ctx.generateRandomSlug(),
				links: {},
				version: '0.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				data: {},
			});

			const message1 = await ctx.backend.upsertElement(ctx.context, {
				type: 'message@0.0.0',
				slug: ctx.generateRandomSlug(),
				links: {},
				active: true,
				version: '0.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				data: {
					payload: 'foo',
					count: 1,
				},
			});

			await ctx.backend.upsertElement(ctx.context, {
				type: 'link@0.0.0',
				slug: `link-${message1.slug}-is-attached-to-${thread1.slug}`,
				links: {},
				version: '0.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: message1.id,
						type: message1.type,
					},
					to: {
						id: thread1.id,
						type: thread1.type,
					},
				},
			});

			const message2 = await ctx.backend.upsertElement(ctx.context, {
				type: 'message@0.0.0',
				slug: ctx.generateRandomSlug(),
				links: {},
				version: '0.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				data: {
					payload: 'bar',
					count: 2,
				},
			});

			await ctx.backend.upsertElement(ctx.context, {
				type: 'link@0.0.0',
				slug: `link-${message2.slug}-is-attached-to-${thread1.slug}`,
				links: {},
				version: '0.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: message2.id,
						type: message2.type,
					},
					to: {
						id: thread1.id,
						type: thread1.type,
					},
				},
			});

			const message3 = await ctx.backend.upsertElement(ctx.context, {
				type: 'message@0.0.0',
				slug: ctx.generateRandomSlug(),
				links: {},
				version: '0.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				data: {
					payload: 'baz',
					count: 3,
				},
			});

			await ctx.backend.upsertElement(ctx.context, {
				type: 'link@0.0.0',
				slug: `link-${message3.slug}-is-attached-to-${thread2.slug}`,
				links: {},
				version: '0.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: message3.id,
						type: message3.type,
					},
					to: {
						id: thread2.id,
						type: thread2.type,
					},
				},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{
					type: {},
					links: {
						'is attached to': {
							id: {},
							type: {},
							slug: {},
						},
					},
					data: {},
				} as any,
				{
					type: 'object',
					required: ['type', 'links', 'data'],
					$$links: {
						'is attached to': {
							type: 'object',
							required: ['id', 'type', 'slug'],
							properties: {
								id: {
									type: 'string',
								},
								type: {
									type: 'string',
									const: 'thread@0.0.0',
								},
								slug: {
									type: 'string',
									enum: [thread1.slug, thread2.slug, thread3.slug],
								},
							},
							additionalProperties: false,
						},
					},
					additionalProperties: false,
					properties: {
						type: {
							type: 'string',
							const: 'message@0.0.0',
						},
						links: {
							type: 'object',
							additionalProperties: true,
						},
						data: {
							type: 'object',
							required: ['count', 'payload'],
							properties: {
								count: {
									type: 'number',
								},
								payload: {
									type: 'string',
								},
							},
						},
					},
				},
				{
					sortBy: ['data', 'count'],
				},
			);

			expect(results).toEqual([
				{
					type: 'message@0.0.0',
					links: {
						'is attached to': [
							{
								id: thread1.id,
								type: 'thread@0.0.0',
								slug: thread1.slug,
							},
						],
					},
					data: {
						count: 1,
						payload: 'foo',
					},
				},
				{
					type: 'message@0.0.0',
					links: {
						'is attached to': [
							{
								id: thread1.id,
								type: 'thread@0.0.0',
								slug: thread1.slug,
							},
						],
					},
					data: {
						count: 2,
						payload: 'bar',
					},
				},
				{
					type: 'message@0.0.0',
					links: {
						'is attached to': [
							{
								id: thread2.id,
								type: 'thread@0.0.0',
								slug: thread2.slug,
							},
						],
					},
					data: {
						count: 3,
						payload: 'baz',
					},
				},
			]);
		});

		it('should be able to query using links when getting an element by id', async () => {
			const thread = await ctx.backend.upsertElement(ctx.context, {
				type: 'thread@0.0.0',
				links: {},
				version: '0.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				slug: ctx.generateRandomSlug(),
				active: true,
				data: {
					description: 'lorem ipsum dolor sit amet',
				},
			});

			const message = await ctx.backend.upsertElement(ctx.context, {
				type: 'message@0.0.0',
				links: {},
				slug: ctx.generateRandomSlug(),
				version: '0.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				data: {
					payload: 'foo',
				},
			});

			const link = await ctx.backend.upsertElement(ctx.context, {
				type: 'link@0.0.0',
				links: {},
				version: '0.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				slug: `link-${message.slug}-has-attached-element-${thread.slug}`,
				active: true,
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: message.id,
						type: message.type,
					},
					to: {
						id: thread.id,
						type: thread.type,
					},
				},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{
					links: {
						'is attached to': {},
					},
					id: {},
					data: {},
					type: {},
				} as any,
				{
					type: 'object',
					required: ['type', 'links', 'data'],
					$$links: {
						'is attached to': {
							type: 'object',
							additionalProperties: true,
						},
					},
					additionalProperties: false,
					properties: {
						links: {
							type: 'object',
							additionalProperties: true,
						},
						id: {
							type: 'string',
							const: message.id,
						},
						data: {
							type: 'object',
							additionalProperties: true,
						},
						type: {
							type: 'string',
						},
					},
				},
			);

			expect(results).toEqual([
				{
					id: message.id,
					type: 'message@0.0.0',
					links: {
						'is attached to': [
							{
								active: true,
								name: null,
								slug: thread.slug,
								data: {
									description: 'lorem ipsum dolor sit amet',
								},
								created_at: thread.created_at,
								updated_at: thread.updated_at,
								linked_at: {
									'has attached element': link.created_at,
								},
								markers: [],
								requires: [],
								tags: [],
								loop: null,
								version: '0.0.0',
								capabilities: [],
								id: thread.id,
								links: results[0].links['is attached to'][0].links,
								type: 'thread@0.0.0',
							},
						],
					},
					data: {
						payload: 'foo',
					},
				},
			]);
		});

		it('should be able to query using links when getting an element by slug', async () => {
			const thread = await ctx.backend.upsertElement(ctx.context, {
				type: 'thread@0.0.0',
				slug: ctx.generateRandomSlug(),
				version: '0.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				data: {
					description: 'lorem ipsum dolor sit amet',
				},
			});

			const message = await ctx.backend.upsertElement(ctx.context, {
				slug: ctx.generateRandomSlug(),
				type: 'message@0.0.0',
				version: '0.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				data: {
					payload: 'foo',
				},
			});

			const link = await ctx.backend.upsertElement(ctx.context, {
				type: 'link@0.0.0',
				slug: `link-${message.slug}-is-attached-to-${thread.slug}`,
				version: '0.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				linked_at: {},
				updated_at: null,
				active: true,
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: message.id,
						type: message.type,
					},
					to: {
						id: thread.id,
						type: thread.type,
					},
				},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{
					slug: {},
					type: {},
					links: {
						'is attached to': {},
					},
					data: {},
				} as any,
				{
					type: 'object',
					required: ['type', 'links', 'data'],
					$$links: {
						'is attached to': {
							type: 'object',
							additionalProperties: true,
						},
					},
					additionalProperties: false,
					properties: {
						links: {
							type: 'object',
							additionalProperties: true,
						},
						slug: {
							type: 'string',
							const: message.slug,
						},
						data: {
							type: 'object',
							additionalProperties: true,
						},
						type: {
							type: 'string',
						},
					},
				},
			);

			expect(results).toEqual([
				{
					slug: message.slug,
					type: 'message@0.0.0',
					links: {
						'is attached to': [
							{
								slug: thread.slug,
								active: true,
								name: null,
								data: {
									description: 'lorem ipsum dolor sit amet',
								},
								id: thread.id,
								created_at: thread.created_at,
								updated_at: thread.updated_at,
								linked_at: {
									'has attached element': link.created_at,
								},
								capabilities: [],
								markers: [],
								requires: [],
								tags: [],
								loop: null,
								version: '0.0.0',
								links: results[0].links['is attached to'][0].links,
								type: 'thread@0.0.0',
							},
						],
					},
					data: {
						payload: 'foo',
					},
				},
			]);
		});

		it('should be able to query using links and an inverse name', async () => {
			const thread = await ctx.backend.upsertElement(ctx.context, {
				type: 'thread@1.0.0',
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				data: {
					description: 'lorem ipsum dolor sit amet',
				},
			});

			const message1 = await ctx.backend.upsertElement(ctx.context, {
				type: 'message@1.0.0',
				slug: ctx.generateRandomSlug({
					prefix: 'a',
				}),
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				data: {
					payload: 'foo',
				},
			});

			const message2 = await ctx.backend.upsertElement(ctx.context, {
				type: 'message@1.0.0',
				slug: ctx.generateRandomSlug({
					prefix: 'b',
				}),
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				data: {
					payload: 'bar',
				},
			});

			const link1 = await ctx.backend.upsertElement(ctx.context, {
				type: 'link@1.0.0',
				slug: `link-${message1.slug}-is-attached-to-${thread.slug}`,
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: message1.id,
						type: message1.type,
					},
					to: {
						id: thread.id,
						type: thread.type,
					},
				},
			});

			const link2 = await ctx.backend.upsertElement(ctx.context, {
				type: 'link@1.0.0',
				slug: `link-${message2.slug}-is-attached-to-${thread.slug}`,
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: message2.id,
						type: message2.type,
					},
					to: {
						id: thread.id,
						type: thread.type,
					},
				},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{
					id: {},
					type: {},
					links: {
						'has attached element': {},
					},
					data: {},
				} as any,
				{
					type: 'object',
					required: ['type', 'links', 'data'],
					$$links: {
						'has attached element': {
							type: 'object',
							additionalProperties: true,
						},
					},
					additionalProperties: false,
					properties: {
						links: {
							type: 'object',
							additionalProperties: true,
						},
						id: {
							type: 'string',
							const: thread.id,
						},
						data: {
							type: 'object',
							additionalProperties: true,
						},
						type: {
							type: 'string',
						},
					},
				},
			);

			results[0].links['has attached element'].sort(
				(cardA: Contract, cardB: Contract) => {
					if (cardA.slug > cardB.slug) {
						return -1;
					} else if (cardA.slug === cardB.slug) {
						return 0;
					}
					return 1;
				},
			);

			expect(results).toEqual([
				{
					id: thread.id,
					type: 'thread@1.0.0',
					links: {
						'has attached element': [
							{
								active: true,
								slug: message2.slug,
								id: message2.id,
								name: null,
								created_at: message2.created_at,
								updated_at: message2.updated_at,
								linked_at: {
									'is attached to': link2.created_at,
								},
								capabilities: [],
								markers: [],
								requires: [],
								tags: [],
								loop: null,
								version: '1.0.0',
								links: results[0].links['has attached element'][1].links,
								type: 'message@1.0.0',
								data: {
									payload: 'bar',
								},
							},
							{
								active: true,
								slug: message1.slug,
								id: message1.id,
								name: null,
								created_at: message1.created_at,
								updated_at: message1.updated_at,
								linked_at: {
									'is attached to': link1.created_at,
								},
								capabilities: [],
								markers: [],
								requires: [],
								tags: [],
								loop: null,
								version: '1.0.0',
								links: results[0].links['has attached element'][0].links,
								type: 'message@1.0.0',
								data: {
									payload: 'foo',
								},
							},
						],
					},
					data: {
						description: 'lorem ipsum dolor sit amet',
					},
				},
			]);
		});

		it('.query() should omit a result if a link does not match', async () => {
			const thread = await ctx.backend.upsertElement(ctx.context, {
				type: 'thread@1.0.0',
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				data: {},
			});

			const foo = await ctx.backend.upsertElement(ctx.context, {
				type: 'foo@1.0.0',
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				data: {},
			});

			const message1 = await ctx.backend.upsertElement(ctx.context, {
				type: 'message@1.0.0',
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				tags: [],
				loop: null,
				links: {},
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				data: {
					payload: 'foo',
				},
			});

			const link1 = await ctx.backend.upsertElement(ctx.context, {
				type: 'link@1.0.0',
				slug: `link-${message1.slug}-is-attached-to-${thread.slug}`,
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: message1.id,
						type: message1.type,
					},
					to: {
						id: thread.id,
						type: thread.type,
					},
				},
			});

			const message2 = await ctx.backend.upsertElement(ctx.context, {
				type: 'message@1.0.0',
				slug: ctx.generateRandomSlug(),
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				data: {
					payload: 'bar',
				},
			});

			await ctx.backend.upsertElement(ctx.context, {
				type: 'link@1.0.0',
				slug: `link-${message2.slug}-is-attached-to-${foo.slug}`,
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: message2.id,
						type: message2.type,
					},
					to: {
						id: foo.id,
						type: foo.type,
					},
				},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{
					type: {},
					data: {},
					links: {
						'is attached to': {},
					},
				},
				{
					type: 'object',
					required: ['type', 'links', 'data'],
					$$links: {
						'is attached to': {
							type: 'object',
							required: ['id', 'type'],
							properties: {
								id: {
									type: 'string',
									const: thread.id,
								},
								type: {
									type: 'string',
									const: 'thread@1.0.0',
								},
							},
						},
					},
					additionalProperties: false,
					properties: {
						type: {
							type: 'string',
							const: 'message@1.0.0',
						},
						links: {
							type: 'object',
							additionalProperties: true,
						},
						data: {
							type: 'object',
							required: ['payload'],
							properties: {
								payload: {
									type: 'string',
								},
							},
						},
					},
				},
			);

			expect(results).toEqual([
				{
					type: 'message@1.0.0',
					links: {
						'is attached to': [
							{
								active: true,
								data: {},
								name: null,
								id: thread.id,
								created_at: thread.created_at,
								updated_at: thread.updated_at,
								linked_at: {
									'has attached element': link1.created_at,
								},
								capabilities: [],
								markers: [],
								requires: [],
								tags: [],
								loop: null,
								version: '1.0.0',
								links: results[0].links['is attached to'][0].links,
								slug: thread.slug,
								type: 'thread@1.0.0',
							},
						],
					},
					data: {
						payload: 'foo',
					},
				},
			]);
		});
	});

	describe('links', () => {
		it('adding a link should update the linked_at field', async () => {
			const thread = await ctx.backend.upsertElement(ctx.context, {
				type: 'thread@1.0.0',
				slug: ctx.generateRandomSlug(),
				links: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				data: {},
			});

			const message = await ctx.backend.upsertElement(ctx.context, {
				type: 'message@1.0.0',
				slug: ctx.generateRandomSlug(),
				links: {},
				active: true,
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				linked_at: {},
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				data: {},
			});

			const link = await ctx.backend.upsertElement(ctx.context, {
				type: 'link@1.0.0',
				slug: `link-${message.slug}-is-attached-to-${thread.slug}`,
				links: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: message.id,
						type: message.type,
					},
					to: {
						id: thread.id,
						type: thread.type,
					},
				},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					properties: {
						id: {
							type: 'string',
							const: thread.id,
						},
					},
					additionalProperties: true,
				},
			);

			expect(results[0]).toEqual({
				active: true,
				capabilities: [],
				created_at: thread.created_at,
				data: {},
				id: thread.id,
				linked_at: {
					'has attached element': link.created_at,
				},
				links: results[0].links,
				markers: [],
				name: null,
				requires: [],
				slug: thread.slug,
				tags: [],
				loop: null,
				type: thread.type,
				updated_at: thread.updated_at,
				version: '1.0.0',
			});

			const results2 = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					properties: {
						id: {
							type: 'string',
							const: message.id,
						},
					},
					additionalProperties: true,
				},
			);

			expect(results2[0]).toEqual({
				active: true,
				capabilities: [],
				created_at: message.created_at,
				data: {},
				id: message.id,
				linked_at: {
					'is attached to': link.created_at,
				},
				links: results2[0].links,
				markers: [],
				name: null,
				requires: [],
				slug: message.slug,
				tags: [],
				loop: null,
				type: message.type,
				updated_at: message.updated_at,
				version: '1.0.0',
			});
		});

		it('adding a link should augment an existing linked_at field', async () => {
			const thread = await ctx.backend.upsertElement(ctx.context, {
				type: 'thread@1.0.0',
				slug: ctx.generateRandomSlug(),
				links: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				data: {},
			});

			const message = await ctx.backend.upsertElement(ctx.context, {
				type: 'message@1.0.0',
				slug: ctx.generateRandomSlug(),
				links: {},
				active: true,
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				linked_at: {},
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				data: {},
			});

			const link = await ctx.backend.upsertElement(ctx.context, {
				type: 'link@1.0.0',
				slug: `link-${message.slug}-is-attached-to-${thread.slug}`,
				links: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: message.id,
						type: message.type,
					},
					to: {
						id: thread.id,
						type: thread.type,
					},
				},
			});

			const message2 = await ctx.backend.upsertElement(ctx.context, {
				type: 'message@1.0.0',
				slug: ctx.generateRandomSlug(),
				links: {},
				active: true,
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				data: {},
			});

			const link2 = await ctx.backend.upsertElement(ctx.context, {
				type: 'link@1.0.0',
				slug: `link-${message2.slug}-is-attached-to-${thread.slug}`,
				links: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				active: true,
				name: 'card belongs to thread',
				data: {
					inverseName: 'thread has card',
					from: {
						id: message2.id,
						type: message2.type,
					},
					to: {
						id: thread.id,
						type: thread.type,
					},
				},
			});

			const results = await ctx.backend.query(
				ctx.context,
				{},
				{
					type: 'object',
					properties: {
						id: {
							type: 'string',
							const: thread.id,
						},
					},
					additionalProperties: true,
				},
			);

			expect(results[0]).toEqual({
				active: true,
				capabilities: [],
				created_at: thread.created_at,
				data: {},
				id: thread.id,
				linked_at: {
					'has attached element': link.created_at,
					'thread has card': link2.created_at,
				},
				links: results[0].links,
				markers: [],
				name: null,
				requires: [],
				slug: thread.slug,
				tags: [],
				loop: null,
				type: thread.type,
				updated_at: thread.updated_at,
				version: '1.0.0',
			});
		});
	});

	describe('.stream()', () => {
		it('should report back new elements that match a certain type', async (done) => {
			const randString = ctx.generateRandomSlug();
			const emitter = await ctx.backend.stream(
				ctx.context,
				{
					type: {},
					data: {},
				},
				{
					type: 'object',
					additionalProperties: false,
					properties: {
						type: {
							type: 'string',
							const: 'foo@1.0.0',
						},
						data: {
							type: 'object',
							required: ['test'],
							properties: {
								test: {
									type: 'string',
									const: randString,
								},
							},
						},
					},
					required: ['type'],
				},
			);

			emitter.on('data', (change) => {
				expect(change.type).toBe('insert');
				expect(change.after).toEqual({
					type: 'foo@1.0.0',
					data: {
						test: randString,
					},
				});

				emitter.close();
			});

			emitter.on('error', done);
			emitter.on('closed', done);

			Bluebird.all([
				ctx.backend.insertElement(ctx.context, {
					type: 'foo@1.0.0',
					version: '1.0.0',
					tags: [],
					loop: null,
					links: {},
					markers: [],
					requires: [],
					capabilities: [],
					linked_at: {},
					created_at: new Date().toISOString(),
					updated_at: null,
					active: true,
					slug: ctx.generateRandomSlug(),
					data: {
						test: randString,
					},
				}),
				ctx.backend.insertElement(ctx.context, {
					type: 'bar@1.0.0',
					version: '1.0.0',
					tags: [],
					loop: null,
					links: {},
					markers: [],
					requires: [],
					capabilities: [],
					created_at: new Date().toISOString(),
					updated_at: null,
					linked_at: {},
					active: true,
					slug: ctx.generateRandomSlug(),
					data: {
						test: randString,
					},
				}),
			]);
		});

		it('should report back changes to certain elements', async (done) => {
			const slug1 = ctx.generateRandomSlug();
			const slug2 = ctx.generateRandomSlug();

			await ctx.backend.insertElement(ctx.context, {
				type: 'foo@1.0.0',
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				slug: slug1,
				data: {
					test: 1,
				},
			});

			await ctx.backend.insertElement(ctx.context, {
				type: 'bar@1.0.0',
				version: '1.0.0',
				tags: [],
				loop: null,
				links: {},
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				slug: slug2,
				data: {
					test: 1,
				},
			});

			const emitter = await ctx.backend.stream(
				ctx.context,
				{
					slug: {},
					type: {},
					data: {},
				},
				{
					type: 'object',
					additionalProperties: false,
					properties: {
						slug: {
							type: 'string',
							enum: [slug1, slug2],
						},
						type: {
							type: 'string',
							const: 'foo@1.0.0',
						},
						data: {
							type: 'object',
							required: ['test'],
							properties: {
								test: {
									type: 'number',
								},
							},
						},
					},
					required: ['type', 'slug'],
				},
			);

			emitter.on('data', (change) => {
				if (change.type === 'insert') {
					return;
				}

				expect(change.type).toBe('update');
				expect(change.after).toEqual({
					slug: slug1,
					type: 'foo@1.0.0',
					data: {
						test: 2,
					},
				});

				emitter.close();
			});

			emitter.on('error', (error) => {
				done(error);
			});

			emitter.on('closed', () => {
				done();
			});

			await ctx.backend.upsertElement(ctx.context, {
				slug: slug1,
				version: '1.0.0',
				tags: [],
				loop: null,
				links: {},
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				active: true,
				type: 'foo@1.0.0',
				data: {
					test: 2,
				},
			});
			await ctx.backend.upsertElement(ctx.context, {
				slug: slug2,
				active: true,
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				type: 'bar@1.0.0',
				data: {
					test: 2,
				},
			});
		});

		it('should report back changes to large elements', async (done) => {
			const slug = ctx.generateRandomSlug();
			await ctx.backend.insertElement(ctx.context, {
				type: 'foo@1.0.0',
				active: true,
				links: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				slug,
				data: {
					test: new Array(5000).join('foobar'),
				},
			});

			const emitter = await ctx.backend.stream(
				ctx.context,
				{
					slug: {},
					type: {},
					data: {},
				},
				{
					type: 'object',
					additionalProperties: false,
					properties: {
						slug: {
							type: 'string',
							const: slug,
						},
						type: {
							type: 'string',
							const: 'foo@1.0.0',
						},
						data: {
							type: 'object',
							required: ['test'],
							properties: {
								test: {
									type: 'string',
								},
							},
						},
					},
					required: ['type', 'slug'],
				},
			);

			emitter.on('data', (change) => {
				// Livefeeds are asynchronous and can pick up a change a
				// moment after the insertion, so there exist the
				// possibility that we get the initial insert event here,
				// and if so its fine to ignore, as it doesn't affect
				// the semantics of the tests.
				if (
					change.type === 'insert' &&
					_.isEqual(change.after, {
						slug,
						type: 'foo@1.0.0',
						data: {
							test: new Array(5000).join('foobar'),
						},
					})
				) {
					return;
				}

				expect(change.type).toBe('update');
				expect(change.after).toEqual({
					slug,
					type: 'foo@1.0.0',
					data: {
						test: new Array(5000).join('bazbuzz'),
					},
				});

				emitter.close();
			});

			emitter.on('error', (error) => {
				done(error);
			});

			emitter.on('closed', () => {
				done();
			});

			ctx.backend.upsertElement(ctx.context, {
				slug,
				active: true,
				version: '1.0.0',
				links: {},
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				type: 'foo@1.0.0',
				data: {
					test: new Array(5000).join('bazbuzz'),
				},
			});
		});

		it('should close without finding anything', async (done) => {
			const emitter = await ctx.backend.stream(
				ctx.context,
				{
					slug: {},
				},
				{
					type: 'object',
					properties: {
						slug: {
							type: 'string',
							const: ctx.generateRandomSlug(),
						},
					},
					required: ['slug'],
				},
			);
			emitter.on('error', done);
			emitter.on('closed', done);
			emitter.close();
		});

		it('should set "before" to null if it previously did not match the schema', async (done) => {
			const slug = ctx.generateRandomSlug();
			await ctx.backend.insertElement(ctx.context, {
				slug,
				active: true,
				links: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				created_at: new Date().toISOString(),
				updated_at: null,
				linked_at: {},
				type: 'foo@1.0.0',
				data: {
					test: '1',
				},
			});
			const emitter = await ctx.backend.stream(
				ctx.context,
				{
					slug: {},
					type: {},
					data: {},
				},
				{
					type: 'object',
					additionalProperties: false,
					properties: {
						slug: {
							type: 'string',
							const: slug,
						},
						type: {
							type: 'string',
							const: 'foo@1.0.0',
						},
						data: {
							type: 'object',
							required: ['test'],
							properties: {
								test: {
									type: 'number',
								},
							},
						},
					},
					required: ['slug', 'type', 'data'],
				},
			);

			emitter.on('data', (change) => {
				expect(change.after).toEqual({
					slug,
					type: 'foo@1.0.0',
					data: {
						test: 1,
					},
				});

				emitter.close();
			});

			emitter.on('error', done);

			emitter.on('closed', done);

			ctx.backend.upsertElement(ctx.context, {
				slug,
				active: true,
				links: {},
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				updated_at: null,
				type: 'foo@1.0.0',
				data: {
					test: 1,
				},
			});
		});

		it(
			'should filter the "before" section of a change',
			async (done) => {
				const slug = ctx.generateRandomSlug();

				await ctx.backend.insertElement(ctx.context, {
					type: 'foo@1.0.0',
					active: true,
					links: {},
					version: '1.0.0',
					tags: [],
					loop: null,
					markers: [],
					requires: [],
					capabilities: [],
					linked_at: {},
					created_at: new Date().toISOString(),
					updated_at: null,
					slug,
					data: {
						test: 1,
						extra: true,
					},
				});

				const emitter = await ctx.backend.stream(
					ctx.context,
					{
						slug: {},
						type: {},
						data: {},
					},
					{
						type: 'object',
						additionalProperties: false,
						properties: {
							slug: {
								type: 'string',
								const: slug,
							},
							type: {
								type: 'string',
								const: 'foo@1.0.0',
							},
							data: {
								type: 'object',
								required: ['test'],
								additionalProperties: false,
								properties: {
									test: {
										type: 'number',
									},
								},
							},
						},
						required: ['type', 'slug'],
					},
				);

				emitter.on('data', (change) => {
					// Livefeeds are asynchronous and can pick up a change a
					// moment after the insertion, so there exist the
					// possibility that we get the initial insert event here,
					// and if so its fine to ignore, as it doesn't affect
					// the semantics of the tests.
					if (
						change.type === 'insert' &&
						_.isEqual(change.after, {
							type: 'foo@1.0.0',
							slug,
							data: {
								test: 1,
							},
						})
					) {
						return;
					}

					expect(change.after).toEqual({
						slug,
						type: 'foo@1.0.0',
						data: {
							test: 2,
						},
					});

					emitter.close();
				});

				emitter.on('error', done);
				emitter.on('closed', done);

				await ctx.backend.upsertElement(ctx.context, {
					slug,
					version: '1.0.0',
					tags: [],
					loop: null,
					links: {},
					markers: [],
					requires: [],
					capabilities: [],
					created_at: new Date().toISOString(),
					linked_at: {},
					updated_at: null,
					active: true,
					type: 'foo@1.0.0',
					data: {
						test: 2,
						extra: true,
					},
				});
			},
			10 * 1000,
		);

		it('should throw if the schema is invalid', async () => {
			await expect(
				ctx.backend.stream(
					ctx.context,
					{},
					{
						type: 'object',
						properties: {
							type: {
								type: 'string',
								enum: ['thread', 'thread'],
							},
						},
					},
				),
			).rejects.toThrow();
		});
	});
});
