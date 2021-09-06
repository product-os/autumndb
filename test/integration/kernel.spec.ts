/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import * as _ from 'lodash';
import * as Bluebird from 'bluebird';
import { v4 as uuid } from 'uuid';
import * as errors from '../../lib/errors';
import { CARDS } from '../../lib/cards';
import * as helpers from './helpers';
import { once } from 'events';
import { Contract } from '@balena/jellyfish-types/build/core';
import { JSONSchema } from '@balena/jellyfish-types';
import { strict as assert } from 'assert';

let ctx: helpers.KernelContext;

beforeAll(async () => {
	ctx = await helpers.before();
});

afterAll(() => {
	return helpers.after(ctx);
});

describe('Kernel', () => {
	describe('contracts', () => {
		for (const key of Object.keys(CARDS)) {
			it(`should contain the ${key} contract by default`, async () => {
				const card = await CARDS[key];
				card.name = _.isString(card.name) ? card.name : null;
				const element = await ctx.kernel.getCardBySlug(
					ctx.context,
					ctx.kernel.sessions!.admin,
					`${card.slug}@${card.version}`,
				);
				expect(card).toEqual(
					_.omit(element, ['created_at', 'id', 'updated_at', 'linked_at']),
				);
			});
		}
	});

	describe('.patchCardBySlug()', () => {
		it('should throw an error if the element does not exist', async () => {
			const slug = `${ctx.generateRandomSlug({
				prefix: 'foobarbaz',
			})}@1.0.0`;
			await expect(
				ctx.kernel.patchCardBySlug(
					ctx.context,
					ctx.kernel.sessions!.admin,
					slug,
					[
						{
							op: 'replace',
							path: '/active',
							value: false,
						},
					],
				),
			).rejects.toThrow(errors.JellyfishNoElement);
		});

		it('should apply a single operation', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					tags: [],
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			await ctx.kernel.patchCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
				[
					{
						op: 'replace',
						path: '/data/foo',
						value: 'baz',
					},
				],
			);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
			);

			expect(result).toEqual({
				id: card.id,
				active: true,
				name: null,
				capabilities: [],
				created_at: card.created_at,
				linked_at: card.linked_at,
				links: card.links,
				markers: card.markers,
				requires: card.requires,
				slug: card.slug,
				updated_at: result!.updated_at,
				tags: [],
				loop: null,
				type: 'card@1.0.0',
				version: '1.0.0',
				data: {
					foo: 'baz',
				},
			});
		});

		it('should add an element to an array', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			await ctx.kernel.patchCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
				[
					{
						op: 'add',
						path: '/markers/0',
						value: 'test',
					},
				],
			);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
			);

			expect(result).toEqual({
				id: card.id,
				active: true,
				name: null,
				capabilities: [],
				created_at: card.created_at,
				linked_at: card.linked_at,
				links: {},
				markers: ['test'],
				requires: [],
				slug: card.slug,
				updated_at: result!.updated_at,
				tags: [],
				loop: null,
				type: 'card@1.0.0',
				version: '1.0.0',
				data: {
					foo: 'bar',
				},
			});
		});

		it('should delete a property inside data', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						'foo/bla': 'bar',
						bar: 'baz',
					},
				},
			);

			await ctx.kernel.patchCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
				[
					{
						op: 'remove',
						path: '/data/foo~1bla',
					},
				],
			);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
			);

			expect(result).toEqual({
				id: card.id,
				active: true,
				name: null,
				capabilities: [],
				created_at: card.created_at,
				linked_at: card.linked_at,
				links: card.links,
				markers: card.markers,
				requires: card.requires,
				slug: card.slug,
				updated_at: result!.updated_at,
				tags: [],
				loop: null,
				type: 'card@1.0.0',
				version: '1.0.0',
				data: {
					bar: 'baz',
				},
			});
		});

		it('should apply more than one operation', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			await ctx.kernel.patchCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
				[
					{
						op: 'add',
						path: '/data/foo',
						value: {},
					},
					{
						op: 'add',
						path: '/data/foo/bar',
						value: 'baz',
					},
					{
						op: 'add',
						path: '/data/foo/qux',
						value: 1,
					},
				],
			);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
			);

			expect(result).toEqual({
				id: card.id,
				active: true,
				name: null,
				capabilities: [],
				created_at: card.created_at,
				linked_at: card.linked_at,
				links: card.links,
				markers: card.markers,
				requires: card.requires,
				slug: card.slug,
				updated_at: result!.updated_at,
				tags: [],
				loop: null,
				type: 'card@1.0.0',
				version: '1.0.0',
				data: {
					foo: {
						qux: 1,
						bar: 'baz',
					},
				},
			});
		});

		it('should not be able to delete an id', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const patched = await ctx.kernel.patchCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
				[
					{
						op: 'remove',
						path: '/id',
					},
				],
			);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
			);

			expect(patched).toEqual(card);
			expect(result).toEqual(card);
		});

		it('should not be able to delete a top level property', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			await expect(
				ctx.kernel.patchCardBySlug(
					ctx.context,
					ctx.kernel.sessions!.admin,
					`${card.slug}@${card.version}`,
					[
						{
							op: 'remove',
							path: '/tags',
						},
					],
				),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
			);

			expect(result).toEqual(card);
		});

		it('should throw given an operation without a path', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			await expect(
				ctx.kernel.patchCardBySlug(
					ctx.context,
					ctx.kernel.sessions!.admin,
					`${card.slug}@${card.version}`,
					[
						{
							op: 'add',
							value: 'foo',
						},
					] as any,
				),
			).rejects.toThrow(errors.JellyfishInvalidPatch);
		});

		it('should throw if the patch does not match', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			await expect(
				ctx.kernel.patchCardBySlug(
					ctx.context,
					ctx.kernel.sessions!.admin,
					`${card.slug}@${card.version}`,
					[
						{
							op: 'remove',
							path: '/data/hello',
						},
					],
				),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
			);

			expect(result).toEqual(card);
		});

		it('should throw if adding to non existent property', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			await expect(
				ctx.kernel.patchCardBySlug(
					ctx.context,
					ctx.kernel.sessions!.admin,
					`${card.slug}@${card.version}`,
					[
						{
							op: 'add',
							path: '/data/hello/world',
							value: 1,
						},
					],
				),
			).rejects.toThrow(errors.JellyfishInvalidPatch);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
			);

			expect(result).toEqual(card);
		});

		it('should throw given an invalid operation', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			await expect(
				ctx.kernel.patchCardBySlug(
					ctx.context,
					ctx.kernel.sessions!.admin,
					`${card.slug}@${card.version}`,
					[
						{
							op: 'bar',
							path: '/data/foo',
							value: 1,
						} as any,
					],
				),
			).rejects.toThrow(errors.JellyfishInvalidPatch);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
			);

			expect(result).toEqual(card);
		});

		it('should not apply half matching patches', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			await expect(
				ctx.kernel.patchCardBySlug(
					ctx.context,
					ctx.kernel.sessions!.admin,
					`${card.slug}@${card.version}`,
					[
						{
							op: 'add',
							path: '/data/test',
							value: 2,
						},
						{
							op: 'add',
							path: '/data/hello/world',
							value: 1,
						},
					],
				),
			).rejects.toThrow(errors.JellyfishInvalidPatch);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
			);

			expect(result).toEqual(card);
		});

		it('should not break the type schema', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'user@1.0.0',
					data: {
						email: 'johndoe@example.com',
						hash: 'PASSWORDLESS',
						roles: [],
					},
				},
			);

			await expect(
				ctx.kernel.patchCardBySlug(
					ctx.context,
					ctx.kernel.sessions!.admin,
					`${card.slug}@${card.version}`,
					[
						{
							op: 'remove',
							path: '/data/roles',
						},
					],
				),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
			);

			expect(result).toEqual(card);
		});

		it('should apply a no-op patch', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const patched = await ctx.kernel.patchCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
				[
					{
						op: 'replace',
						path: '/data/foo',
						value: 'bar',
					},
				],
			);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
			);

			expect(patched).toEqual(card);
			expect(result).toEqual(card);
		});

		it('should apply an empty set of patches', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const patched = await ctx.kernel.patchCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
				[],
			);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
			);

			expect(patched).toEqual(card);
			expect(result).toEqual(card);
		});

		it('should ignore changes to read-only properties', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const patched = await ctx.kernel.patchCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
				[
					{
						op: 'add',
						path: '/links/foo',
						value: 'bar',
					},
					{
						op: 'replace',
						path: '/created_at',
						value: new Date().toISOString(),
					},
					{
						op: 'add',
						path: '/linked_at/foo',
						value: 'bar',
					},
				],
			);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
			);

			expect(patched).toEqual(card);
			expect(result).toEqual(card);
		});

		it('should be able to patch cards hidden to the user', async () => {
			const slug = ctx.generateRandomSlug({
				prefix: 'user-johndoe',
			});
			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `role-${slug}`,
				type: 'role@1.0.0',
				data: {
					read: {
						type: 'object',
						properties: {
							slug: {
								type: 'string',
								const: ['user', 'type'],
							},
							type: {
								type: 'string',
								const: 'type@1.0.0',
							},
							data: {
								type: 'object',
								additionalProperties: true,
							},
						},
						required: ['slug', 'type', 'data'],
					},
				},
			});

			const userCard = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug,
					type: 'user@1.0.0',
					data: {
						email: 'johndoe@example.com',
						hash: 'PASSWORDLESS',
						roles: [],
					},
				},
			);

			const session = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'session@1.0.0',
					data: {
						actor: userCard.id,
					},
				},
			);

			expect(
				await ctx.kernel.getCardBySlug(
					ctx.context,
					session.id,
					`${userCard.slug}@${userCard.version}`,
				),
			).toBeFalsy();

			await expect(
				ctx.kernel.patchCardBySlug(
					ctx.context,
					session.id,
					`${userCard.slug}@${userCard.version}`,
					[
						{
							op: 'add',
							path: '/data/foo',
							value: 'bar',
						},
					],
				),
			).rejects.toThrow(errors.JellyfishNoElement);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${userCard.slug}@${userCard.version}`,
			);

			expect(result).toEqual(userCard);
		});

		it('should not allow updates in hidden fields', async () => {
			const slug = ctx.generateRandomSlug({
				prefix: 'user-johndoe',
			});
			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `role-${slug}`,
				type: 'role@1.0.0',
				version: '1.0.0',
				data: {
					read: {
						type: 'object',
						anyOf: [
							{
								required: ['slug', 'type', 'data'],
								properties: {
									slug: {
										type: 'string',
									},
									type: {
										type: 'string',
										const: 'user@1.0.0',
									},
									data: {
										type: 'object',
										required: ['email'],
										additionalProperties: false,
										properties: {
											email: {
												type: 'string',
											},
										},
									},
								},
							},
							{
								required: ['slug', 'type', 'data'],
								properties: {
									slug: {
										type: 'string',
										enum: ['user', 'type'],
									},
									type: {
										type: 'string',
										const: 'type@1.0.0',
									},
									data: {
										type: 'object',
										additionalProperties: true,
									},
								},
							},
						],
					},
				},
			});

			const userCard = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug,
					type: 'user@1.0.0',
					data: {
						email: 'johndoe@example.com',
						hash: 'PASSWORDLESS',
						roles: [],
					},
				},
			);

			const session = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'session@1.0.0',
					data: {
						actor: userCard.id,
					},
				},
			);

			const filteredUser = await ctx.kernel.getCardBySlug(
				ctx.context,
				session.id,
				`${userCard.slug}@${userCard.version}`,
			);

			expect(filteredUser!.data).toEqual({
				email: 'johndoe@example.com',
			});

			await expect(
				ctx.kernel.patchCardBySlug(
					ctx.context,
					session.id,
					`${userCard.slug}@${userCard.version}`,
					[
						{
							op: 'replace',
							path: '/data/roles',
							value: ['admin'],
						},
					],
				),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${userCard.slug}@${userCard.version}`,
			);

			expect(result).toEqual(userCard);
		});

		it('should not return the full card', async () => {
			const slug = ctx.generateRandomSlug({
				prefix: 'user-johndoe',
			});
			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `role-${slug}`,
				type: 'role@1.0.0',
				version: '1.0.0',
				data: {
					read: {
						type: 'object',
						anyOf: [
							{
								required: ['slug', 'type', 'data'],
								properties: {
									slug: {
										type: 'string',
									},
									type: {
										type: 'string',
										const: 'user@1.0.0',
									},
									data: {
										type: 'object',
										required: ['email'],
										additionalProperties: false,
										properties: {
											email: {
												type: 'string',
											},
										},
									},
								},
							},
							{
								required: ['slug', 'type', 'data'],
								properties: {
									slug: {
										type: 'string',
										enum: ['user', 'type'],
									},
									type: {
										type: 'string',
										const: 'type@1.0.0',
									},
									data: {
										type: 'object',
										additionalProperties: true,
									},
								},
							},
						],
					},
				},
			});

			const userCard = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug,
					type: 'user@1.0.0',
					data: {
						email: 'johndoe@example.com',
						hash: 'secret',
						roles: [],
					},
				},
			);

			const session = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'session@1.0.0',
					data: {
						actor: userCard.id,
					},
				},
			);

			const filteredUser = await ctx.kernel.getCardBySlug(
				ctx.context,
				session.id,
				`${userCard.slug}@${userCard.version}`,
			);

			expect(filteredUser!.data).toEqual({
				email: 'johndoe@example.com',
			});

			const patched = await ctx.kernel.patchCardBySlug(
				ctx.context,
				session.id,
				`${userCard.slug}@${userCard.version}`,
				[
					{
						op: 'replace',
						path: '/data/email',
						value: 'johndoe@gmail.com',
					},
				],
			);

			expect(patched.data).toEqual({
				email: 'johndoe@gmail.com',
			});

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${userCard.slug}@${userCard.version}`,
			);

			expect(result!.data).toEqual({
				email: 'johndoe@gmail.com',
				hash: 'secret',
				roles: [],
			});
		});

		it('should not allow a patch that makes a card inaccessible', async () => {
			const slug = ctx.generateRandomSlug({
				prefix: 'user-johndoe',
			});
			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `role-${slug}`,
				type: 'role@1.0.0',
				data: {
					read: {
						type: 'object',
						anyOf: [
							{
								required: ['data'],
								additionalProperties: true,
								properties: {
									data: {
										type: 'object',
										required: ['foo'],
										additionalProperties: true,
										properties: {
											foo: {
												type: 'number',
												const: 7,
											},
										},
									},
								},
							},
							{
								required: ['slug', 'type', 'data'],
								properties: {
									slug: {
										type: 'string',
										enum: ['card', 'user', 'type'],
									},
									type: {
										type: 'string',
										const: 'type@1.0.0',
									},
									data: {
										type: 'object',
										additionalProperties: true,
									},
								},
							},
						],
					},
				},
			});

			const userCard = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug,
					type: 'user@1.0.0',
					data: {
						email: 'johndoe@example.com',
						hash: 'secret',
						roles: [],
					},
				},
			);

			const session = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'session@1.0.0',
					data: {
						actor: userCard.id,
					},
				},
			);

			const randomCard = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						hello: 'world',
						foo: 7,
					},
				},
			);

			const filteredCard = await ctx.kernel.getCardBySlug(
				ctx.context,
				session.id,
				`${randomCard.slug}@${randomCard.version}`,
			);

			expect(filteredCard).toEqual(randomCard);

			await expect(
				ctx.kernel.patchCardBySlug(
					ctx.context,
					session.id,
					`${randomCard.slug}@${randomCard.version}`,
					[
						{
							op: 'replace',
							path: '/data/foo',
							value: 8,
						},
					],
				),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${randomCard.slug}@${randomCard.version}`,
			);

			expect(result).toEqual(randomCard);
		});

		it('should not remove inaccessible fields', async () => {
			const slug = ctx.generateRandomSlug({
				prefix: 'user-johndoe',
			});
			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `role-${slug}`,
				type: 'role@1.0.0',
				version: '1.0.0',
				data: {
					read: {
						type: 'object',
						anyOf: [
							{
								required: ['slug', 'type', 'data'],
								properties: {
									slug: {
										type: 'string',
									},
									type: {
										type: 'string',
										const: 'user@1.0.0',
									},
									data: {
										type: 'object',
										required: ['email'],
										additionalProperties: false,
										properties: {
											email: {
												type: 'string',
											},
										},
									},
								},
							},
							{
								required: ['slug', 'type', 'data'],
								properties: {
									slug: {
										type: 'string',
										enum: ['user', 'type'],
									},
									type: {
										type: 'string',
										const: 'type@1.0.0',
									},
									data: {
										type: 'object',
										additionalProperties: true,
									},
								},
							},
						],
					},
				},
			});

			const userCard = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug,
					type: 'user@1.0.0',
					data: {
						email: 'johndoe@example.com',
						hash: 'secret',
						roles: [],
					},
				},
			);

			const session = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'session@1.0.0',
					data: {
						actor: userCard.id,
					},
				},
			);

			const filteredUser = await ctx.kernel.getCardBySlug(
				ctx.context,
				session.id,
				`${userCard.slug}@${userCard.version}`,
			);

			expect(filteredUser!.data).toEqual({
				email: 'johndoe@example.com',
			});

			await expect(
				ctx.kernel.patchCardBySlug(
					ctx.context,
					session.id,
					`${userCard.slug}@${userCard.version}`,
					[
						{
							op: 'remove',
							path: '/data/hash',
						},
					],
				),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${userCard.slug}@${userCard.version}`,
			);

			expect(result).toEqual(userCard);
		});

		it('should not add an inaccesible field', async () => {
			const slug = ctx.generateRandomSlug({
				prefix: 'user-johndoe',
			});
			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `role-${slug}`,
				type: 'role@1.0.0',
				data: {
					read: {
						type: 'object',
						anyOf: [
							{
								required: ['slug', 'type', 'data'],
								properties: {
									slug: {
										type: 'string',
									},
									type: {
										type: 'string',
										const: 'user@1.0.0',
									},
									data: {
										type: 'object',
										required: ['email'],
										additionalProperties: false,
										properties: {
											email: {
												type: 'string',
											},
										},
									},
								},
							},
							{
								required: ['slug', 'type', 'data'],
								properties: {
									slug: {
										type: 'string',
										enum: ['user', 'type'],
									},
									type: {
										type: 'string',
										const: 'type@1.0.0',
									},
									data: {
										type: 'object',
										additionalProperties: true,
									},
								},
							},
						],
					},
				},
			});

			const userCard = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug,
					type: 'user@1.0.0',
					data: {
						email: 'johndoe@example.com',
						hash: 'secret',
						roles: [],
					},
				},
			);

			const session = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'session@1.0.0',
					data: {
						actor: userCard.id,
					},
				},
			);

			const filteredUser = await ctx.kernel.getCardBySlug(
				ctx.context,
				session.id,
				`${userCard.slug}@${userCard.version}`,
			);

			expect(filteredUser!.data).toEqual({
				email: 'johndoe@example.com',
			});

			await expect(
				ctx.kernel.patchCardBySlug(
					ctx.context,
					session.id,
					`${userCard.slug}@${userCard.version}`,
					[
						{
							op: 'add',
							path: '/data/special',
							value: 7,
						},
					],
				),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${userCard.slug}@${userCard.version}`,
			);

			expect(result).toEqual(userCard);
		});

		it('should not throw when adding a loop field referencing a loop that does exist', async () => {
			const loopSlug = ctx.generateRandomSlug({
				prefix: 'loop/',
			});
			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: loopSlug,
				type: 'loop@1.0.0',
			});

			const slug = ctx.generateRandomSlug({
				prefix: 'foobarbaz',
			});
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug,
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const patchedCard = await ctx.kernel.patchCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
				[
					{
						op: 'add',
						path: '/loop',
						value: `${loopSlug}@1.0.0`,
					},
				],
			);

			expect(patchedCard.loop).toBe(`${loopSlug}@1.0.0`);
		});

		it('should not throw when removing the loop field value', async () => {
			const loopSlug = ctx.generateRandomSlug({
				prefix: 'loop/',
			});
			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: loopSlug,
				type: 'loop@1.0.0',
			});

			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					loop: `${loopSlug}@1.0.0`,
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const patchedCard = await ctx.kernel.patchCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
				[
					{
						op: 'remove',
						path: '/loop',
					},
				],
			);

			expect(patchedCard.loop).toBeUndefined();
		});

		it('should not throw when replacing a loop field with a value referencing a loop that does exist', async () => {
			const loopSlug = ctx.generateRandomSlug({
				prefix: 'loop/',
			});
			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: loopSlug,
				type: 'loop@1.0.0',
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: loopSlug,
				type: 'loop@1.0.0',
				version: '1.0.1',
			});

			const slug = ctx.generateRandomSlug({
				prefix: 'foobarbaz',
			});
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug,
					loop: `${loopSlug}@1.0.0`,
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const patchedCard = await ctx.kernel.patchCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
				[
					{
						op: 'replace',
						path: '/loop',
						value: `${loopSlug}@1.0.1`,
					},
				],
			);

			expect(patchedCard.loop).toBe(`${loopSlug}@1.0.1`);
		});

		it('should throw if trying to add a loop field referencing a loop that does not exist', async () => {
			const slug = ctx.generateRandomSlug({
				prefix: 'foobarbaz',
			});
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug,
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			await expect(
				ctx.kernel.patchCardBySlug(
					ctx.context,
					ctx.kernel.sessions!.admin,
					`${card.slug}@${card.version}`,
					[
						{
							op: 'add',
							path: '/loop',
							value: 'saywhat@1.0.0',
						},
					],
				),
			).rejects.toThrow(errors.JellyfishNoElement);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
			);

			expect(result).toEqual(card);
		});

		it('should throw if trying to add a loop field referencing a loop that is not a loop card', async () => {
			const slug = ctx.generateRandomSlug({
				prefix: 'foobarbaz',
			});
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug,
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			await expect(
				ctx.kernel.patchCardBySlug(
					ctx.context,
					ctx.kernel.sessions!.admin,
					`${card.slug}@${card.version}`,
					[
						{
							op: 'add',
							path: '/loop',
							value: 'user@1.0.0',
						},
					],
				),
			).rejects.toThrow(errors.JellyfishNoElement);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
			);

			expect(result).toEqual(card);
		});

		it('should throw if trying to replace the loop field with a value referencing a loop that does not exist', async () => {
			const loopSlug = ctx.generateRandomSlug({
				prefix: 'loop/',
			});
			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: loopSlug,
				type: 'loop@1.0.0',
			});

			const slug = ctx.generateRandomSlug({
				prefix: 'foobarbaz',
			});
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug,
					loop: `${loopSlug}@1.0.0`,
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			await expect(
				ctx.kernel.patchCardBySlug(
					ctx.context,
					ctx.kernel.sessions!.admin,
					`${card.slug}@${card.version}`,
					[
						{
							op: 'replace',
							path: '/loop',
							value: 'saywhat@1.0.0',
						},
					],
				),
			).rejects.toThrow(errors.JellyfishNoElement);

			const result = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card.slug}@${card.version}`,
			);

			expect(result).toEqual(card);
		});
	});

	describe('.insertCard()', () => {
		it('should not be able to set links', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					links: {
						foo: 'bar',
					} as any,
				},
			);

			const element = await ctx.kernel.getCardById(
				ctx.context,
				ctx.kernel.sessions!.admin,
				card.id,
			);

			assert(element !== null);

			expect(element.links).toEqual({});
		});

		it('should create a user with two email addressses', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'user@1.0.0',
					data: {
						email: ['johndoe@example.com', 'johndoe@gmail.com'],
						hash: 'PASSWORDLESS',
						roles: [],
					},
				},
			);

			expect(card.data.email).toEqual([
				'johndoe@example.com',
				'johndoe@gmail.com',
			]);
		});

		it('should not create a user with an empty email list', async () => {
			await expect(
				ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
					type: 'user@1.0.0',
					data: {
						email: [],
						hash: 'PASSWORDLESS',
						roles: [],
					},
				}),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);
		});

		it('should not create a user with an invalid email', async () => {
			await expect(
				ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
					type: 'user@1.0.0',
					data: {
						email: ['foo'],
						hash: 'PASSWORDLESS',
						roles: [],
					},
				}),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);
		});

		it('should not create a user with an invalid and a valid email', async () => {
			await expect(
				ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
					type: 'user@1.0.0',
					data: {
						email: ['johndoe@example.com', 'foo'],
						hash: 'PASSWORDLESS',
						roles: [],
					},
				}),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);
		});

		it('should not create a user with duplicated emails', async () => {
			await expect(
				ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
					type: 'user@1.0.0',
					data: {
						email: ['johndoe@example.com', 'johndoe@example.com'],
						hash: 'PASSWORDLESS',
						roles: [],
					},
				}),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);
		});

		it('should throw an error if the element does not adhere to the type', async () => {
			await expect(
				ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
					type: 'action@1.0.0',
					data: {},
				}),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);
		});

		it('should throw an error if the slug contains @latest', async () => {
			await expect(
				ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
					slug: 'test-1@latest',
					type: 'card@1.0.0',
				}),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);
		});

		it('should throw an error if the slug contains a version', async () => {
			await expect(
				ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
					slug: 'test-1@1.0.0',
					type: 'card@1.0.0',
				}),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);
		});

		it('should throw an error if the card type does not exist', async () => {
			await expect(
				ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
					type: 'foobarbazqux@1.0.0',
				}),
			).rejects.toThrow(errors.JellyfishUnknownCardType);
		});

		it('should not throw an error if the referenced loop exists', async () => {
			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: 'loop/product-os',
				type: 'loop@1.0.0',
			});

			const slug = ctx.generateRandomSlug();
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug,
					type: 'card@1.0.0',
					loop: 'loop/product-os@1.0.0',
				},
			);

			expect(card.slug).toBe(slug);
		});

		it('should throw an error if the referenced loop does not exist', async () => {
			await expect(
				ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
					type: 'card@1.0.0',
					loop: 'saywhat@1.0.0',
				}),
			).rejects.toThrow(errors.JellyfishNoElement);
		});

		it('should throw an error if the referenced loop is not a loop contract', async () => {
			await expect(
				ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
					type: 'card@1.0.0',
					loop: 'user@1.0.0',
				}),
			).rejects.toThrow(errors.JellyfishNoElement);
		});

		it('should be able to insert two versions of the same card', async () => {
			const slug = ctx.generateRandomSlug({
				prefix: 'hello-world',
			});

			const card1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug,
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const card2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug,
					type: 'card@1.0.0',
					version: '1.0.1',
					data: {
						foo: 'baz',
					},
				},
			);

			expect(card1.slug).toBe(card2.slug);

			const element1 = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card1.slug}@1.0.0`,
			);
			expect(element1!.data.foo).toBe('bar');

			const element2 = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card1.slug}@1.0.1`,
			);
			expect(element2!.data.foo).toBe('baz');

			expect(element1).toEqual(card1);
			expect(element2).toEqual(card2);
		});

		it('should insert an element with pre-release version data', async () => {
			const version = '1.0.0-alpha';
			const slug = ctx.generateRandomSlug({
				prefix: 'card',
			});
			const result = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug,
					type: 'card@1.0.0',
					version,
				},
			);
			const element = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${result.slug}@${version}`,
			);

			expect(element!.version).toEqual(version);
		});

		it('should insert an element with pre-release and build version data', async () => {
			const version = '1.0.0-alpha+001';
			const result = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					version,
				},
			);
			const element = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${result.slug}@${version}`,
			);

			expect(element!.version).toEqual(version);
		});

		it('should insert multiple prereleases on same version', async () => {
			const slug = ctx.generateRandomSlug();
			const version1 = '1.0.0-alpha';
			const version2 = '1.0.0-beta';
			const results = [
				await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
					slug,
					type: 'card@1.0.0',
					version: version1,
					data: {},
				}),
				await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
					slug,
					type: 'card@1.0.0',
					version: version2,
					data: {},
				}),
			];
			const elements = [
				await ctx.kernel.getCardBySlug(
					ctx.context,
					ctx.kernel.sessions!.admin,
					`${results[0].slug}@${version1}`,
				),
				await ctx.kernel.getCardBySlug(
					ctx.context,
					ctx.kernel.sessions!.admin,
					`${results[1].slug}@${version2}`,
				),
			];

			// Check that the cards have the same slug, but different versions
			expect(elements[0]!.slug).toEqual(elements[1]!.slug);
			expect(elements[0]!.version).toEqual(version1);
			expect(elements[1]!.version).toEqual(version2);
		});

		it('should insert multiple builds on same prerelease version', async () => {
			const slug = ctx.generateRandomSlug();
			const version1 = '1.0.0-alpha+001';
			const version2 = '1.0.0-alpha+002';
			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug,
				type: 'card@1.0.0',
				version: version1,
			});
			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug,
				type: 'card@1.0.0',
				version: version2,
			});
			const elements = [
				await ctx.kernel.getCardBySlug(
					ctx.context,
					ctx.kernel.sessions!.admin,
					`${slug}@${version1}`,
				),
				await ctx.kernel.getCardBySlug(
					ctx.context,
					ctx.kernel.sessions!.admin,
					`${slug}@${version2}`,
				),
			];

			// Check that the cards have the same slug, but different versions
			expect(elements[0]!.slug).toEqual(elements[1]!.slug);
			expect(elements[0]!.version).toEqual(version1);
			expect(elements[1]!.version).toEqual(version2);
		});

		it('should be able to insert a card', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const element = await ctx.kernel.getCardById(
				ctx.context,
				ctx.kernel.sessions!.admin,
				card.id,
			);
			expect(element).toEqual(card);
		});

		it('should be able to set a tag with a colon', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					tags: ['foo:bar'],
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const element = await ctx.kernel.getCardById(
				ctx.context,
				ctx.kernel.sessions!.admin,
				card.id,
			);
			expect(element).toEqual(card);
		});

		it('should be able to set a tag with a space and a slash', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					tags: ['CUSTOM HARDWARE/OS'],
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const element = await ctx.kernel.getCardById(
				ctx.context,
				ctx.kernel.sessions!.admin,
				card.id,
			);
			expect(element).toEqual(card);
		});

		it('should use defaults if required keys are missing', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			expect(card).toEqual({
				id: card.id,
				created_at: card.created_at,
				updated_at: null,
				linked_at: {},
				slug: card.slug,
				type: 'card@1.0.0',
				name: null,
				active: true,
				version: '1.0.0',
				tags: [],
				loop: null,
				markers: [],
				links: {},
				requires: [],
				capabilities: [],
				data: {},
			});
		});

		it('should generate a slug if one is not provided', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			expect(card.slug).toBeTruthy();
		});

		it('should throw if the card slug already exists', async () => {
			const slug = ctx.generateRandomSlug({
				prefix: 'hello-world',
			});
			const card = {
				slug,
				type: 'card@1.0.0',
			};

			await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				card,
			);
			await expect(
				ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, card),
			).rejects.toThrow(errors.JellyfishElementAlreadyExists);
		});

		it('should be able to create a link between two valid cards', async () => {
			const card1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const card2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const linkCard = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug: `link-${card1.slug}-is-attached-to-${card2.slug}`,
					type: 'link@1.0.0',
					name: 'is attached to',
					data: {
						inverseName: 'has attached element',
						from: {
							id: card1.id,
							type: card1.type,
						},
						to: {
							id: card2.id,
							type: card2.type,
						},
					},
				},
			);

			const element = await ctx.kernel.getCardById(
				ctx.context,
				ctx.kernel.sessions!.admin,
				linkCard.id,
			);

			assert(element !== null);

			expect(element.data.from).not.toBe(element.data.to);
		});

		it('should be able to create a direction-less link between two valid cards', async () => {
			const card1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const card2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const linkCard = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug: `link-${card1.slug}-is-linked-to-${card2.slug}`,
					type: 'link@1.0.0',
					name: 'is linked to',
					data: {
						inverseName: 'is linked to',
						from: {
							id: card1.id,
							type: card1.type,
						},
						to: {
							id: card2.id,
							type: card2.type,
						},
					},
				},
			);

			const element = await ctx.kernel.getCardById(
				ctx.context,
				ctx.kernel.sessions!.admin,
				linkCard.id,
			);
			assert(element !== null);
			expect(element.data.from).not.toBe(element.data.to);
			expect(element.name).toBe(element.data.inverseName);
		});

		it('should be able to create two different links between two valid cards', async () => {
			const card1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const card2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const linkCard1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug: `link-${card1.slug}-is-linked-to-${card2.slug}`,
					type: 'link@1.0.0',
					version: '1.0.0',
					name: 'is linked to',
					data: {
						inverseName: 'has been linked to',
						from: {
							id: card1.id,
							type: card1.type,
						},
						to: {
							id: card2.id,
							type: card2.type,
						},
					},
				},
			);

			const linkCard2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug: `link-${card1.slug}-is-attached-to-${card2.slug}`,
					type: 'link@1.0.0',
					version: '1.0.0',
					name: 'is attached to',
					data: {
						inverseName: 'has attached element',
						from: {
							id: card1.id,
							type: card1.type,
						},
						to: {
							id: card2.id,
							type: card2.type,
						},
					},
				},
			);

			expect((linkCard1 as any).data.from.id).toBe(
				(linkCard2 as any).data.from.id,
			);
			expect((linkCard1 as any).data.to.id).toBe((linkCard2 as any).data.to.id);
		});

		it('should not add a link if not inserting a card with a target', async () => {
			const card1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				type: 'card@1.0.0',
				data: {
					foo: card1.id,
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'object',
					required: ['type'],
					additionalProperties: true,
					properties: {
						type: {
							type: 'string',
							const: 'link',
						},
					},
				},
			);

			expect(results).toEqual([]);
		});

		it('.insertCard() read access on a property should not allow to write other properties', async () => {
			const slug = ctx.generateRandomSlug({
				prefix: 'user-johndoe',
			});
			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `role-${slug}`,
				type: 'role@1.0.0',
				version: '1.0.0',
				data: {
					read: {
						type: 'object',
						anyOf: [
							{
								type: 'object',
								properties: {
									slug: {
										type: 'string',
										const: 'user',
									},
									type: {
										type: 'string',
										const: 'type@1.0.0',
									},
									data: {
										type: 'object',
										properties: {
											schema: {
												type: 'object',
												additionalProperties: true,
											},
										},
										required: ['schema'],
									},
								},
								additionalProperties: true,
								required: ['slug', 'type', 'data'],
							},
							{
								type: 'object',
								properties: {
									id: {
										type: 'string',
									},
									type: {
										type: 'string',
										const: 'user@1.0.0',
									},
								},
								additionalProperties: false,
								required: ['id', 'type'],
							},
						],
					},
				},
			});

			const userCard = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug,
					type: 'user@1.0.0',
					version: '1.0.0',
					data: {
						email: 'johndoe@example.com',
						hash: 'PASSWORDLESS',
						roles: [],
					},
				},
			);

			const targetUserCard = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug: ctx.generateRandomSlug({
						prefix: 'user-janedoe',
					}),
					type: 'user@1.0.0',
					version: '1.0.0',
					data: {
						email: 'janedoe@example.com',
						hash: 'PASSWORDLESS',
						roles: [],
					},
				},
			);

			const session = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'session@1.0.0',
					data: {
						actor: userCard.id,
					},
				},
			);

			await expect(
				ctx.kernel.replaceCard(ctx.context, session.id, {
					id: targetUserCard.id,
					slug: targetUserCard.slug,
					type: 'user@1.0.0',
					version: '1.0.0',
					data: {
						email: 'pwned@example.com',
						hash: 'PASSWORDLESS',
						roles: [],
					},
				}),
			).rejects.toThrow(errors.JellyfishPermissionsError);
		});

		it('.insertCard() should not insert a link if any of the two target cards does not exist', async () => {
			await expect(
				ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
					slug: `link-${ctx.generateRandomSlug()}-is-attached-to-${ctx.generateRandomSlug()}`,
					name: 'is attached to',
					type: 'link@1.0.0',
					version: '1.0.0',
					data: {
						inverseName: 'has attached',
						from: {
							id: ctx.generateRandomID(),
							type: 'card@1.0.0',
						},
						to: {
							id: ctx.generateRandomID(),
							type: 'card@1.0.0',
						},
					},
				}),
			).rejects.toThrow(errors.JellyfishNoLinkTarget);
		});
	});

	describe('.replaceCard()', () => {
		it('should replace an element', async () => {
			const card1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const card2 = await ctx.kernel.replaceCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug: card1.slug,
					type: 'card@1.0.0',
					data: {
						replaced: true,
					},
				},
			);

			expect(card1.id).toBe(card2.id);
			const element = await ctx.kernel.getCardById(
				ctx.context,
				ctx.kernel.sessions!.admin,
				card1.id,
			);
			expect(element).toEqual(card2);
		});

		it('should not overwrite the "created_at" field when overriding a card', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const update = await ctx.kernel.replaceCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug: card.slug,
					type: 'card@1.0.0',
					created_at: new Date(633009018000).toISOString(),
				},
			);

			expect(card.created_at).toBe(update.created_at);
		});

		it('should not overwrite the "linked_at" field when overriding a card', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const update = await ctx.kernel.replaceCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug: card.slug,
					type: 'card@1.0.0',
					linked_at: {
						foo: 'bar',
					},
				},
			);

			expect(card.linked_at).toEqual(update.linked_at);
		});

		it('should not be able to set links when overriding a card', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const update = await ctx.kernel.replaceCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug: card.slug,
					type: 'card@1.0.0',
					links: {
						foo: 'bar',
					} as any,
				},
			);

			expect(update.links).toEqual({});
		});
	});

	describe('.getCardBySlug()', () => {
		it('.getCardBySlug() there should be an admin card', async () => {
			const card = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				'user-admin@latest',
			);
			expect(card).toBeTruthy();
		});

		it('.getCardBySlug() should find an active card by its slug', async () => {
			const result = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const card = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${result.slug}@${result.version}`,
			);
			expect(card).toEqual(result);
		});

		it('.getCardBySlug() should not find an active card by its slug and the wrong version', async () => {
			const result = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const card = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${result.slug}@1.0.1`,
			);

			expect(card).toBeFalsy();
		});

		it('.getCardBySlug() should not find an invalid slug when using @latest', async () => {
			const card = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				'foo-bar@latest',
			);

			expect(card).toBeFalsy();
		});

		it('.getCardBySlug() should find an active card by its slug using @latest', async () => {
			const result = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const card = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${result.slug}@${result.version}`,
			);

			expect(card).toEqual(result);
		});

		it('.getCardBySlug() should find the latest version of a card', async () => {
			const card1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const card2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug: card1.slug,
					type: 'card@1.0.0',
					version: '2.0.1',
					data: {
						foo: 'baz',
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: card1.slug,
				type: 'card@1.0.0',
				version: '1.2.1',
				data: {
					foo: 'qux',
				},
			});

			const element = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card1.slug}@latest`,
			);

			expect(element!.data.foo).toBe('baz');
			expect(element).toEqual(card2);
		});

		it('.getCardBySlug() should find an active card by its slug and its type', async () => {
			const result = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const card = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${result.slug}@${result.version}`,
			);

			expect(card).toEqual(result);
		});
	});

	describe('.getCardById()', () => {
		it('should find an active card by its id', async () => {
			const result = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const card = await ctx.kernel.getCardById(
				ctx.context,
				ctx.kernel.sessions!.admin,
				result.id,
			);
			expect(card).toEqual(result);
		});

		it('should find an active card by its id and type', async () => {
			const result = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const card = await ctx.kernel.getCardById(
				ctx.context,
				ctx.kernel.sessions!.admin,
				result.id,
			);

			expect(card).toEqual(result);
		});

		it('should return an inactive card by its id', async () => {
			const result = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const card = await ctx.kernel.getCardById(
				ctx.context,
				ctx.kernel.sessions!.admin,
				result.id,
			);
			expect(card).toEqual(result);
		});
	});

	describe('.query()', () => {
		it('should throw an error given an invalid regex', async () => {
			await expect(
				ctx.kernel.query(ctx.context, ctx.kernel.sessions!.admin, {
					type: 'object',
					additionalProperties: true,
					required: ['slug'],
					properties: {
						slug: {
							type: 'string',
							pattern: '-(^[xx',
						},
					},
				}),
			).rejects.toThrow(errors.JellyfishInvalidRegularExpression);
		});

		it('should throw an error given an invalid enum in links', async () => {
			await expect(
				ctx.kernel.query(ctx.context, ctx.kernel.sessions!.admin, {
					$$links: {
						'is member of': {
							type: 'object',
							properties: {
								slug: {
									enum: [],
								},
							},
						},
					},
					type: 'object',
					properties: {
						type: {
							const: 'user@1.0.0',
						},
						slug: {
							pattern: '^user-admin',
						},
					},
					required: ['type', 'slug'],
					additionalProperties: true,
				}),
			).rejects.toThrow(errors.JellyfishInvalidSchema);
		});

		it('should throw an error given an invalid enum', async () => {
			await expect(
				ctx.kernel.query(ctx.context, ctx.kernel.sessions!.admin, {
					type: 'object',
					additionalProperties: true,
					required: ['slug'],
					properties: {
						slug: {
							type: 'string',
							enum: [],
						},
					},
				}),
			).rejects.toThrow(errors.JellyfishInvalidSchema);
		});

		it('should be able to limit the results', async () => {
			const ref = uuid();
			const result1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						ref,
						test: 1,
						timestamp: '2018-07-20T23:15:45.702Z',
					},
				},
			);

			const result2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						ref,
						test: 2,
						timestamp: '2018-08-20T23:15:45.702Z',
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				type: 'card@1.0.0',
				data: {
					ref,
					test: 3,
					timestamp: '2018-09-20T23:15:45.702Z',
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'object',
					additionalProperties: true,
					properties: {
						data: {
							type: 'object',
							properties: {
								ref: {
									type: 'string',
									const: ref,
								},
							},
							required: ['ref'],
						},
					},
					required: ['data'],
				},
				{
					sortBy: 'created_at',
					limit: 2,
				},
			);

			expect(_.sortBy(results, ['data', 'test'])).toEqual([result1, result2]);
		});

		it('should be able to skip the results', async () => {
			const ref = uuid();

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				type: 'card@1.0.0',
				data: {
					ref,
					test: 1,
					timestamp: '2018-07-20T23:15:45.702Z',
				},
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				type: 'card@1.0.0',
				data: {
					ref,
					test: 2,
					timestamp: '2018-08-20T23:15:45.702Z',
				},
			});

			const result3 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						ref,
						test: 3,
						timestamp: '2018-09-20T23:15:45.702Z',
					},
				},
			);

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'object',
					additionalProperties: true,
					properties: {
						data: {
							type: 'object',
							properties: {
								ref: {
									type: 'string',
									const: ref,
								},
							},
							required: ['ref'],
						},
					},
					required: ['data'],
				},
				{
					sortBy: 'created_at',
					skip: 2,
				},
			);

			expect(_.sortBy(results, ['data', 'test'])).toEqual([result3]);
		});

		it('should be able to limit and skip the results', async () => {
			const ref = uuid();

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				type: 'card@1.0.0',
				data: {
					ref,
					test: 1,
					timestamp: '2018-07-20T23:15:45.702Z',
				},
			});

			const result2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						ref,
						test: 2,
						timestamp: '2018-08-20T23:15:45.702Z',
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				type: 'card@1.0.0',
				data: {
					ref,
					test: 3,
					timestamp: '2018-09-20T23:15:45.702Z',
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'object',
					additionalProperties: true,
					properties: {
						data: {
							type: 'object',
							properties: {
								ref: {
									type: 'string',
									const: ref,
								},
							},
							required: ['ref'],
						},
					},
					required: ['data'],
				},
				{
					sortBy: ['data', 'timestamp'],
					limit: 1,
					skip: 1,
				},
			);

			expect(results).toEqual([result2]);
		});

		it('should be able to sort linked cards', async () => {
			const parent = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const child1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						sequence: 1,
					},
				},
			);

			const child2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						sequence: 0,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${child1.slug}-is-child-of-${parent.slug}`,
				type: 'link@1.0.0',
				name: 'is child of',
				data: {
					inverseName: 'has child',
					from: {
						id: child1.id,
						type: child1.type,
					},
					to: {
						id: parent.id,
						type: parent.type,
					},
				},
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${child2.slug}-is-child-of-${parent.slug}`,
				type: 'link@1.0.0',
				name: 'is child of',
				data: {
					inverseName: 'has child',
					from: {
						id: child2.id,
						type: child2.type,
					},
					to: {
						id: parent.id,
						type: parent.type,
					},
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'object',
					// TS-TODO: Allow $$links schema to be set to "true"
					$$links: {
						'has child': true,
					} as any,
					properties: {
						id: {
							const: parent.id,
						},
					},
				},
				{
					links: {
						'has child': {
							sortBy: ['data', 'sequence'],
						},
					},
				},
			);

			expect(
				results.map((card) => {
					return {
						id: card.id,
					};
				}),
			).toEqual([
				{
					id: parent.id,
				},
			]);
			expect(
				(results as any)[0].links['has child'].map((card: Contract) => {
					return {
						id: card.id,
					};
				}),
			).toEqual([
				{
					id: child2.id,
				},
				{
					id: child1.id,
				},
			]);
		});

		it('should be able to skip linked cards', async () => {
			const parent = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const child1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						sequence: 1,
					},
				},
			);

			const child2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						sequence: 0,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${child1.slug}-is-child-of-${parent.slug}`,
				type: 'link@1.0.0',
				name: 'is child of',
				data: {
					inverseName: 'has child',
					from: {
						id: child1.id,
						type: child1.type,
					},
					to: {
						id: parent.id,
						type: parent.type,
					},
				},
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${child2.slug}-is-child-of-${parent.slug}`,
				type: 'link@1.0.0',
				name: 'is child of',
				data: {
					inverseName: 'has child',
					from: {
						id: child2.id,
						type: child2.type,
					},
					to: {
						id: parent.id,
						type: parent.type,
					},
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'object',
					$$links: {
						'has child': true,
					} as any,
					properties: {
						id: {
							const: parent.id,
						},
					},
				},
				{
					links: {
						'has child': {
							skip: 1,
							sortBy: ['data', 'sequence'],
						},
					},
				},
			);

			expect(
				results.map((card) => {
					return {
						id: card.id,
					};
				}),
			).toEqual([
				{
					id: parent.id,
				},
			]);
			expect(
				(results as any)[0].links['has child'].map((card: Contract) => {
					return {
						id: card.id,
					};
				}),
			).toEqual([
				{
					id: child1.id,
				},
			]);
		});

		it('should be able to limit linked cards', async () => {
			const parent = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const child1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						sequence: 1,
					},
				},
			);

			const child2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						sequence: 0,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${child1.slug}-is-child-of-${parent.slug}`,
				type: 'link@1.0.0',
				name: 'is child of',
				data: {
					inverseName: 'has child',
					from: {
						id: child1.id,
						type: child1.type,
					},
					to: {
						id: parent.id,
						type: parent.type,
					},
				},
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${child2.slug}-is-child-of-${parent.slug}`,
				type: 'link@1.0.0',
				name: 'is child of',
				data: {
					inverseName: 'has child',
					from: {
						id: child2.id,
						type: child2.type,
					},
					to: {
						id: parent.id,
						type: parent.type,
					},
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'object',
					$$links: {
						'has child': true,
					} as any,
					properties: {
						id: {
							const: parent.id,
						},
					},
				},
				{
					links: {
						'has child': {
							limit: 1,
							sortBy: ['data', 'sequence'],
						},
					},
				},
			);

			expect(
				results.map((card) => {
					return {
						id: card.id,
					};
				}),
			).toEqual([
				{
					id: parent.id,
				},
			]);
			expect(
				results[0].links!['has child']!.map((card) => {
					return {
						id: card.id,
					};
				}),
			).toEqual([
				{
					id: child2.id,
				},
			]);
		});

		it('should filter cards by the options.mask schema if set', async () => {
			const insertedCard = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						sequence: 1,
					},
				},
			);

			const query: JSONSchema = {
				type: 'object',
				properties: {
					id: {
						const: insertedCard.id,
					},
				},
			};

			const mask: JSONSchema = {
				type: 'object',
				properties: {
					type: {
						const: 'foo@1.0.0',
					},
				},
			};

			const resultWithNoMask = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				query,
				{},
			);

			expect(
				resultWithNoMask.map((card) => {
					return {
						id: card.id,
					};
				}),
			).toEqual([
				{
					id: insertedCard.id,
				},
			]);

			const resultWithMask = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				query,
				{
					mask,
				},
			);

			expect(resultWithMask.length).toBe(0);
		});

		it('should be able to skip and limit linked cards', async () => {
			const parent = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const child1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						sequence: 1,
					},
				},
			);

			const child2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						sequence: 0,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${child1.slug}-is-child-of-${parent.slug}`,
				type: 'link@1.0.0',
				name: 'is child of',
				data: {
					inverseName: 'has child',
					from: {
						id: child1.id,
						type: child1.type,
					},
					to: {
						id: parent.id,
						type: parent.type,
					},
				},
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${child2.slug}-is-child-of-${parent.slug}`,
				type: 'link@1.0.0',
				name: 'is child of',
				data: {
					inverseName: 'has child',
					from: {
						id: child2.id,
						type: child2.type,
					},
					to: {
						id: parent.id,
						type: parent.type,
					},
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'object',
					$$links: {
						'has child': true,
					} as any,
					properties: {
						id: {
							const: parent.id,
						},
					},
				},
				{
					links: {
						'has child': {
							skip: 1,
							limit: 1,
							sortBy: ['data', 'sequence'],
						},
					},
				},
			);

			expect(
				results.map((card) => {
					return {
						id: card.id,
					};
				}),
			).toEqual([
				{
					id: parent.id,
				},
			]);
			expect(
				results[0].links!['has child']!.map((card) => {
					return {
						id: card.id,
					};
				}),
			).toEqual([
				{
					id: child1.id,
				},
			]);
		});

		it('should return the cards that match a schema', async () => {
			const result1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						email: 'johndoe@example.io',
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				type: 'card@1.0.0',
				data: {
					email: 'johnsmith@example.io',
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'object',
					additionalProperties: false,
					properties: {
						id: {
							type: 'string',
						},
						slug: {
							type: 'string',
							pattern: `${result1.slug}$`,
						},
						type: {
							type: 'string',
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
					required: ['id', 'slug', 'type', 'data'],
				},
			);

			expect(results).toEqual([
				{
					id: result1.id,
					slug: result1.slug,
					type: 'card@1.0.0',
					data: {
						email: 'johndoe@example.io',
					},
				},
			]);
		});

		it('should work if passing an $id top level property', async () => {
			const result1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						email: 'johndoe@example.io',
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				type: 'card@1.0.0',
				data: {
					email: 'johnsmith@example.io',
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					$id: 'foobar',
					type: 'object',
					additionalProperties: false,
					properties: {
						id: {
							type: 'string',
						},
						slug: {
							type: 'string',
							pattern: `${result1.slug}$`,
						},
						type: {
							type: 'string',
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
					required: ['id', 'slug', 'type', 'data'],
				},
			);

			expect(results).toEqual([
				{
					id: result1.id,
					slug: result1.slug,
					type: 'card@1.0.0',
					data: {
						email: 'johndoe@example.io',
					},
				},
			]);
		});

		it('should be able to describe a property that starts with $', async () => {
			const result1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						$foo: 'bar',
					},
				},
			);

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'object',
					additionalProperties: true,
					properties: {
						slug: {
							type: 'string',
							pattern: `${result1.slug}$`,
						},
						type: {
							type: 'string',
						},
						version: {
							type: 'string',
						},
						data: {
							type: 'object',
							properties: {
								$foo: {
									type: 'string',
								},
							},
							required: ['$foo'],
						},
					},
					required: ['slug', 'type', 'version', 'data'],
				},
			);

			expect(results).toEqual([result1]);
		});

		it('should take roles into account', async () => {
			const role = ctx.generateRandomSlug({ prefix: 'foo' });
			const actor = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						email: 'johndoe@example.io',
						roles: [role],
					},
				},
			);

			const session = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'session@1.0.0',
					data: {
						actor: actor.id,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `role-${role}`,
				type: 'role@1.0.0',
				version: '1.0.0',
				data: {
					read: {
						type: 'object',
						required: ['type', 'data'],
						properties: {
							type: {
								type: 'string',
								const: 'type@1.0.0',
							},
							data: {
								type: 'object',
								required: ['schema'],
								properties: {
									schema: {
										type: 'object',
										additionalProperties: true,
									},
								},
							},
						},
					},
				},
			});

			const results = await ctx.kernel.query(ctx.context, session.id, {
				type: 'object',
				required: ['type', 'slug', 'active', 'data'],
				additionalProperties: false,
				properties: {
					type: {
						type: 'string',
					},
					slug: {
						type: 'string',
						pattern: '^user',
					},
					active: {
						type: 'boolean',
					},
					data: {
						type: 'object',
					},
				},
			});

			expect(results).toEqual([
				_.pick(await CARDS.user, ['type', 'slug', 'active', 'data']),
			]);
		});

		it('should take roles into account when querying for linked cards', async () => {
			const role = ctx.generateRandomSlug({ prefix: 'foo' });
			const actor = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						email: 'johndoe@example.io',
						roles: [role],
					},
				},
			);

			const session = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'session@1.0.0',
					data: {
						actor: actor.id,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `role-${role}`,
				type: 'role@1.0.0',
				version: '1.0.0',
				data: {
					read: {
						type: 'object',
						required: ['type'],
						properties: {
							type: {
								type: 'string',
								not: {
									const: 'org@1.0.0',
								},
							},
						},
					},
				},
			});

			const org = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'org@1.0.0',
					name: 'Foo Ltd',
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${actor.slug}-is-part-of-${org.slug}`,
				type: 'link@1.0.0',
				name: 'is part of',
				data: {
					inverseName: 'has member',
					from: {
						id: actor.id,
						type: actor.type,
					},
					to: {
						id: org.id,
						type: org.type,
					},
				},
			});

			const attachment = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug: ctx.generateRandomSlug(),
					type: 'card@1.0.0',
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${actor.slug}-is-attached-to-${attachment.slug}`,
				type: 'link@1.0.0',
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: actor.id,
						type: actor.type,
					},
					to: {
						id: attachment.id,
						type: attachment.type,
					},
				},
			});

			const results = await ctx.kernel.query(ctx.context, session.id, {
				type: 'object',
				$$links: {
					'is attached to': {
						type: 'object',
					},
					'is part of': {
						type: 'object',
					},
				},
				properties: {
					id: {
						type: 'string',
						const: actor.id,
					},
				},
			});

			expect(results).toEqual([]);
		});

		it('should ignore queries to properties not whitelisted by a role', async () => {
			const role = ctx.generateRandomSlug({
				prefix: 'foo',
			});
			const actor = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						email: 'johndoe@example.io',
						roles: [role],
					},
				},
			);

			const session = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'session@1.0.0',
					data: {
						actor: actor.id,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `role-${role}`,
				type: 'role@1.0.0',
				data: {
					read: {
						type: 'object',
						additionalProperties: false,
						properties: {
							slug: {
								type: 'string',
							},
							type: {
								type: 'string',
								const: 'type@1.0.0',
							},
						},
					},
				},
			});

			const results = await ctx.kernel.query(ctx.context, session.id, {
				type: 'object',
				properties: {
					id: {
						type: 'string',
					},
					type: {
						type: 'string',
					},
					slug: {
						type: 'string',
						pattern: '^user',
					},
				},
			});

			expect(results).toEqual([
				{
					type: 'type@1.0.0',
					slug: 'user',
				},
			]);
		});

		it('should ignore $id properties in roles', async () => {
			const role = ctx.generateRandomSlug({ prefix: 'foo' });
			const actor = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						email: 'johndoe@example.io',
						roles: [role],
					},
				},
			);

			const session = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'session@1.0.0',
					data: {
						actor: actor.id,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `role-${role}`,
				type: 'role@1.0.0',
				version: '1.0.0',
				data: {
					read: {
						type: 'object',
						$id: 'foobar',
						additionalProperties: false,
						properties: {
							slug: {
								type: 'string',
							},
							type: {
								type: 'string',
								const: 'type@1.0.0',
							},
						},
					},
				},
			});

			const results = await ctx.kernel.query(ctx.context, session.id, {
				type: 'object',
				additionalProperties: true,
				properties: {
					id: {
						type: 'string',
					},
					type: {
						type: 'string',
					},
					slug: {
						type: 'string',
						pattern: '^user',
					},
				},
			});

			expect(results).toEqual([
				{
					type: 'type@1.0.0',
					slug: 'user',
				},
			]);
		});

		it('should ignore queries to disallowed properties with additionalProperties: true', async () => {
			const role = ctx.generateRandomSlug({ prefix: 'foo' });
			const actor = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						email: 'johndoe@example.io',
						roles: [role],
					},
				},
			);

			const session = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'session@1.0.0',
					data: {
						actor: actor.id,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `role-${role}`,
				type: 'role@1.0.0',
				data: {
					read: {
						type: 'object',
						additionalProperties: false,
						properties: {
							slug: {
								type: 'string',
							},
							type: {
								type: 'string',
								const: 'type@1.0.0',
							},
						},
					},
				},
			});

			const results = await ctx.kernel.query(ctx.context, session.id, {
				type: 'object',
				additionalProperties: true,
				properties: {
					id: {
						type: 'string',
					},
					type: {
						type: 'string',
					},
					slug: {
						type: 'string',
						pattern: '^user',
					},
				},
			});

			expect(results).toEqual([
				{
					type: 'type@1.0.0',
					slug: 'user',
				},
			]);
		});

		it('should return inactive cards', async () => {
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					active: false,
					data: {
						email: 'johnsmith@example.io',
						roles: [],
					},
				},
			);

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'object',
					additionalProperties: false,
					properties: {
						slug: {
							const: card.slug,
						},
					},
					required: ['slug'],
				},
			);

			expect(results).toEqual([
				{
					slug: card.slug,
				},
			]);
		});

		it('should take a view card with two filters', async () => {
			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				type: 'card@1.0.0',
				tags: ['foo'],
				data: {
					number: 1,
				},
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				type: 'card@1.0.0',
				data: {
					number: 1,
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'view@1.0.0',
					data: {
						allOf: [
							{
								name: 'foo',
								schema: {
									type: 'object',
									properties: {
										data: {
											type: 'object',
											properties: {
												number: {
													type: 'number',
													const: 1,
												},
											},
											required: ['number'],
										},
									},
									required: ['data'],
								},
							},
							{
								name: 'bar',
								schema: {
									type: 'object',
									properties: {
										tags: {
											type: 'array',
											contains: {
												type: 'string',
												const: 'foo',
											},
										},
									},
									required: ['tags'],
								},
							},
						],
					},
				} as any,
			);

			expect(
				results.map((element) => {
					return _.pick(element, ['tags', 'data']);
				}),
			).toEqual([
				{
					tags: ['foo'],
					data: {
						number: 1,
					},
				},
			]);
		});

		it('should be able to request all cards (with no properties) linked to a card', async () => {
			const parent = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						thread: true,
						number: 1,
					},
				},
			);

			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						thread: false,
						count: 1,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${card.slug}-is-appended-to-${parent.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'is appended to',
				active: true,
				data: {
					inverseName: 'has appended element',
					from: {
						id: card.id,
						type: card.type,
					},
					to: {
						id: parent.id,
						type: parent.type,
					},
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'object',
					additionalProperties: false,
					$$links: {
						'is appended to': {
							type: 'object',
							required: ['slug', 'type'],
							properties: {
								slug: {
									type: 'string',
									const: parent.slug,
								},
								type: {
									type: 'string',
									const: parent.type,
								},
							},
						},
					},
				},
			);

			// This is by design, as we want to catch the case where
			// we send a JSON Schema that doesn't try to get any
			// properties back.
			expect(results).toEqual([{}]);
		});

		it('should get all properties of all cards', async () => {
			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'object',
					additionalProperties: true,
				},
			);

			const properties = _.sortBy(_.intersection(..._.map(results, _.keys)));

			expect(properties).toEqual([
				'active',
				'capabilities',
				'created_at',
				'data',
				'id',
				'linked_at',
				'links',
				'loop',
				'markers',
				'name',
				'requires',
				'slug',
				'tags',
				'type',
				'updated_at',
				'version',
			]);
		});

		it('should not consider inactive links', async () => {
			const parent1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						thread: true,
						number: 1,
					},
				},
			);

			const parent2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						thread: true,
						number: 2,
					},
				},
			);

			const card1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						thread: false,
						count: 1,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${card1.slug}-is-attached-to-${parent1.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'is attached to',
				active: false,
				data: {
					inverseName: 'has attached element',
					from: {
						id: card1.id,
						type: card1.type,
					},
					to: {
						id: parent1.id,
						type: parent1.type,
					},
				},
			});

			const card2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						thread: false,
						count: 2,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${card2.slug}-is-attached-to-${parent2.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: card2.id,
						type: card2.type,
					},
					to: {
						id: parent2.id,
						type: parent2.type,
					},
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'object',
					additionalProperties: false,
					required: ['type', 'links', 'data'],
					$$links: {
						'is attached to': {
							type: 'object',
							required: ['id', 'data'],
							properties: {
								id: {
									type: 'string',
								},
								data: {
									type: 'object',
									required: ['thread'],
									properties: {
										thread: {
											type: 'boolean',
										},
									},
									additionalProperties: false,
								},
							},
							additionalProperties: false,
						},
					},
					properties: {
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
						links: {
							type: 'object',
							additionalProperties: true,
						},
						data: {
							type: 'object',
							required: ['count'],
							properties: {
								count: {
									type: 'number',
								},
							},
							additionalProperties: true,
						},
					},
				},
			);

			expect(results).toEqual([
				{
					type: 'card@1.0.0',
					links: {
						'is attached to': [
							{
								id: parent2.id,
								data: {
									thread: true,
								},
							},
						],
					},
					data: {
						count: 2,
						thread: false,
					},
				},
			]);
		});

		it('should be able to query using links', async () => {
			const ref = uuid();
			const parent1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						thread: true,
						number: 1,
					},
				},
			);

			const parent2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						thread: true,
						number: 2,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				type: 'card@1.0.0',
				data: {
					thread: true,
					number: 3,
				},
			});

			const card1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						thread: false,
						count: 1,
						ref,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${card1.slug}-is-attached-to-${parent1.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: card1.id,
						type: card1.type,
					},
					to: {
						id: parent1.id,
						type: parent1.type,
					},
				},
			});

			const card2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						thread: false,
						count: 2,
						ref,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${card2.slug}-is-attached-to-${parent1.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: card2.id,
						type: card2.type,
					},
					to: {
						id: parent1.id,
						type: parent1.type,
					},
				},
			});

			const card3 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						thread: false,
						count: 3,
						ref,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${card3.slug}-is-attached-to-${parent2.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: card3.id,
						type: card3.type,
					},
					to: {
						id: parent2.id,
						type: parent2.type,
					},
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'object',
					additionalProperties: false,
					required: ['type', 'links', 'data'],
					$$links: {
						'is attached to': {
							type: 'object',
							required: ['id', 'data'],
							properties: {
								id: {
									type: 'string',
								},
								data: {
									type: 'object',
									required: ['thread'],
									properties: {
										thread: {
											type: 'boolean',
											const: true,
										},
									},
									additionalProperties: false,
								},
							},
							additionalProperties: false,
						},
					},
					properties: {
						type: {
							type: 'string',
							const: 'card@1.0.0',
						},
						links: {
							type: 'object',
							additionalProperties: true,
						},
						data: {
							type: 'object',
							required: ['count', 'ref'],
							properties: {
								count: {
									type: 'number',
								},
								ref: {
									type: 'string',
									const: ref,
								},
							},
							additionalProperties: false,
						},
					},
				},
				{
					sortBy: ['data', 'count'],
				},
			);

			expect(results).toEqual([
				{
					type: 'card@1.0.0',
					links: {
						'is attached to': [
							{
								id: parent1.id,
								data: {
									thread: true,
								},
							},
						],
					},
					data: {
						count: 1,
						ref,
					},
				},
				{
					type: 'card@1.0.0',
					links: {
						'is attached to': [
							{
								id: parent1.id,
								data: {
									thread: true,
								},
							},
						],
					},
					data: {
						count: 2,
						ref,
					},
				},
				{
					type: 'card@1.0.0',
					links: {
						'is attached to': [
							{
								id: parent2.id,
								data: {
									thread: true,
								},
							},
						],
					},
					data: {
						count: 3,
						ref,
					},
				},
			]);
		});

		it('should be able to query using multiple link types', async () => {
			const parent = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const ownedCard = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);
			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${ownedCard.slug}-is-owned-by-${parent.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'is owned by',
				data: {
					inverseName: 'owns',
					from: {
						id: ownedCard.id,
						type: ownedCard.type,
					},
					to: {
						id: parent.id,
						type: parent.type,
					},
				},
			});

			const attachedCard = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);
			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${attachedCard.slug}-is-attached-to-${parent.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: attachedCard.id,
						type: attachedCard.type,
					},
					to: {
						id: parent.id,
						type: parent.type,
					},
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'object',
					$$links: {
						'has attached element': {
							type: 'object',
							required: ['id'],
							properties: {
								id: {
									type: 'string',
								},
							},
							additionalProperties: false,
						},
						owns: {
							type: 'object',
							required: ['id'],
							properties: {
								id: {
									type: 'string',
								},
							},
							additionalProperties: false,
						},
					},
					properties: {
						id: {
							type: 'string',
							const: parent.id,
						},
						links: {
							type: 'object',
						},
					},
					required: ['links'],
				},
			);

			expect(results[0].links).toEqual({
				'has attached element': [
					{
						id: attachedCard.id,
					},
				],
				owns: [
					{
						id: ownedCard.id,
					},
				],
			});
		});

		it('should be able to query $$links inside $$links', async () => {
			const parent = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const child = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const grandchild = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${child.slug}-is-child-of-${parent.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'is child of',
				data: {
					inverseName: 'owns',
					from: {
						id: child.id,
						type: child.type,
					},
					to: {
						id: parent.id,
						type: parent.type,
					},
				},
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${grandchild.slug}-is-child-of-${child.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'is child of',
				data: {
					inverseName: 'owns',
					from: {
						id: grandchild.id,
						type: grandchild.type,
					},
					to: {
						id: child.id,
						type: child.type,
					},
				},
			});

			const santa = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			for (const eternalChild of [parent, child, grandchild]) {
				await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
					slug: `link-${eternalChild.slug}-believes-in-${santa.slug}`,
					type: 'link@1.0.0',
					version: '1.0.0',
					name: 'believes in',
					data: {
						inverseName: 'is believed by',
						from: {
							id: eternalChild.id,
							type: eternalChild.type,
						},
						to: {
							id: santa.id,
							type: santa.type,
						},
					},
				});
			}

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					$$links: {
						'is child of': {
							$$links: {
								'is child of': {
									$$links: {
										'believes in': {
											properties: {
												id: {
													const: santa.id,
												},
											},
										},
									},
									properties: {
										id: {
											const: parent.id,
										},
										links: true,
									},
								},
								'believes in': {
									properties: {
										id: {
											const: santa.id,
										},
									},
								},
							},
							properties: {
								id: {
									const: child.id,
								},
								links: true,
							},
						},
						'believes in': {
							properties: {
								id: {
									const: santa.id,
								},
							},
						},
					},
					properties: {
						id: {
							const: grandchild.id,
						},
						links: true,
					},
				},
			);

			expect(results.length).toEqual(1);
			expect(results[0].id).toEqual(grandchild.id);
			expect(results[0].links!['believes in'][0].id).toEqual(santa.id);
			expect(results[0].links!['is child of'][0].id).toEqual(child.id);
			expect(
				results[0].links!['is child of'][0].links!['believes in'][0].id,
			).toEqual(santa.id);
			expect(
				results[0].links!['is child of'][0].links!['is child of'][0].id,
			).toEqual(parent.id);
			expect(
				results[0].links!['is child of'][0].links!['is child of'][0].links![
					'believes in'
				][0].id,
			).toEqual(santa.id);
		});

		test.skip('should be able to query $$links inside an allOf', async () => {
			const office = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const worker1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						isStressed: true,
					},
				},
			);

			const worker2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						isStressed: false,
					},
				},
			);

			const worker3 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${worker1.slug}-works-at-${office.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'works at',
				data: {
					inverseName: 'has worker',
					from: {
						id: worker1.id,
						type: worker1.type,
					},
					to: {
						id: office.id,
						type: office.type,
					},
				},
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${worker2.slug}-works-at-${office.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'works at',
				data: {
					inverseName: 'has worker',
					from: {
						id: worker2.id,
						type: worker2.type,
					},
					to: {
						id: office.id,
						type: office.type,
					},
				},
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${worker3.slug}-works-at-${office.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'works at',
				data: {
					inverseName: 'has worker',
					from: {
						id: worker3.id,
						type: worker3.type,
					},
					to: {
						id: office.id,
						type: office.type,
					},
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					additionalProperties: false,
					required: ['id', 'links'],
					allOf: [
						{
							$$links: {
								'works at': {
									additionalProperties: false,
									properties: {
										id: {
											const: office.id,
										},
									},
								},
							},
						},
						{
							properties: {
								data: {
									properties: {
										isStressed: {
											const: true,
										},
									},
								},
							},
						},
					],
				},
			);

			expect(results).toEqual([
				{
					id: worker1.id,
					links: {
						'works at': [
							{
								id: office.id,
							},
						],
					},
					data: {
						isStressed: true,
					},
				},
			]);
		});

		it('should be able to query $$links inside an anyOf', async () => {
			const office = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const worker1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						isStressed: false,
					},
				},
			);

			const worker2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						isStressed: true,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				type: 'card@1.0.0',
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				type: 'card@1.0.0',
				data: {
					isStressed: false,
				},
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${worker1.slug}-works-at-${office.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'works at',
				data: {
					inverseName: 'has worker',
					from: {
						id: worker1.id,
						type: worker1.type,
					},
					to: {
						id: office.id,
						type: office.type,
					},
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					additionalProperties: false,
					required: ['id', 'links'],
					anyOf: [
						{
							$$links: {
								'works at': {
									additionalProperties: false,
									properties: {
										id: {
											const: office.id,
										},
									},
								},
							},
						},
						{
							required: ['data'],
							properties: {
								data: {
									required: ['isStressed'],
									properties: {
										isStressed: {
											const: true,
										},
									},
								},
							},
						},
					],
				},
				{
					sortBy: ['data', 'isStressed'],
				},
			);

			expect(results).toEqual([
				{
					id: worker1.id,
					links: {
						'works at': [
							{
								id: office.id,
							},
						],
					},
					data: {
						isStressed: false,
					},
				},
				{
					id: worker2.id,
					links: {},
					data: {
						isStressed: true,
					},
				},
			]);
		});

		it('should be able to query an optional $$links inside another optional $$links', async () => {
			const office = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const worker1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						order: 0,
					},
				},
			);

			const worker2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						order: 1,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${worker1.slug}-works-at-${office.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'works at',
				data: {
					inverseName: 'has worker',
					from: {
						id: worker1.id,
						type: worker1.type,
					},
					to: {
						id: office.id,
						type: office.type,
					},
				},
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${worker2.slug}-works-at-${office.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'works at',
				data: {
					inverseName: 'has worker',
					from: {
						id: worker2.id,
						type: worker2.type,
					},
					to: {
						id: office.id,
						type: office.type,
					},
				},
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${worker1.slug}-reports-to-${worker2.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'reports to',
				data: {
					inverseName: 'receives reports from',
					from: {
						id: worker1.id,
						type: worker1.type,
					},
					to: {
						id: worker2.id,
						type: worker2.type,
					},
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					anyOf: [
						true,
						{
							$$links: {
								'has worker': {
									anyOf: [
										true,
										{
											$$links: {
												'reports to': {
													required: ['id'],
													additionalProperties: false,
												},
											},
										},
									],
									required: ['id', 'links'],
									additionalProperties: false,
								},
							},
						},
					],
					required: ['links'],
					additionalProperties: false,
					properties: {
						id: {
							const: office.id,
						},
					},
				},
				{
					links: {
						'has worker': {
							sortBy: ['data', 'order'],
						},
					},
				},
			);

			expect(results).toEqual([
				{
					id: office.id,
					links: {
						'has worker': [
							{
								id: worker1.id,
								links: {
									'reports to': [
										{
											id: worker2.id,
										},
									],
								},
							},
							{
								id: worker2.id,
								links: {},
							},
						],
					},
				},
			]);
		});

		it('should be able to query $$links inside a contains', async () => {
			const office = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const worker1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						stressedDays: [1, 3, 5],
					},
				},
			);

			const worker2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						stressedDays: [1, 2, 4],
					},
				},
			);

			const worker3 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${worker1.slug}-works-at-${office.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'works at',
				data: {
					inverseName: 'has worker',
					from: {
						id: worker1.id,
						type: worker1.type,
					},
					to: {
						id: office.id,
						type: office.type,
					},
				},
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${worker2.slug}-works-at-${office.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'works at',
				data: {
					inverseName: 'has worker',
					from: {
						id: worker2.id,
						type: worker2.type,
					},
					to: {
						id: office.id,
						type: office.type,
					},
				},
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${worker3.slug}-works-at-${office.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'works at',
				data: {
					inverseName: 'has worker',
					from: {
						id: worker3.id,
						type: worker3.type,
					},
					to: {
						id: office.id,
						type: office.type,
					},
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					additionalProperties: false,
					required: ['id', 'links', 'data'],
					properties: {
						data: {
							required: ['stressedDays'],
							properties: {
								stressedDays: {
									type: 'array',
									contains: {
										$$links: {
											'works at': {
												additionalProperties: false,
												properties: {
													id: {
														const: office.id,
													},
												},
											},
										},
										const: 5,
									},
								},
							},
						},
					},
				},
				{
					sortBy: ['data', 'stressedDays'],
				},
			);

			expect(results).toEqual([
				{
					id: worker1.id,
					links: {
						'works at': [
							{
								id: office.id,
							},
						],
					},
					data: {
						stressedDays: [1, 3, 5],
					},
				},
			]);
		});

		it('should be able to query $$links inside an items', async () => {
			const office = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const worker1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						stressedDays: [1, 3, 5],
					},
				},
			);

			const worker2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						stressedDays: [1, 'INVALID DAY', 4],
					},
				},
			);

			const worker3 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${worker1.slug}-works-at-${office.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'works at',
				data: {
					inverseName: 'has worker',
					from: {
						id: worker1.id,
						type: worker1.type,
					},
					to: {
						id: office.id,
						type: office.type,
					},
				},
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${worker2.slug}-works-at-${office.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'works at',
				data: {
					inverseName: 'has worker',
					from: {
						id: worker2.id,
						type: worker2.type,
					},
					to: {
						id: office.id,
						type: office.type,
					},
				},
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${worker3.slug}-works-at-${office.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'works at',
				data: {
					inverseName: 'has worker',
					from: {
						id: worker3.id,
						type: worker3.type,
					},
					to: {
						id: office.id,
						type: office.type,
					},
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					additionalProperties: false,
					required: ['id', 'links', 'data'],
					properties: {
						data: {
							required: ['stressedDays'],
							properties: {
								stressedDays: {
									type: 'array',
									items: {
										$$links: {
											'works at': {
												additionalProperties: false,
												properties: {
													id: {
														const: office.id,
													},
												},
											},
										},
										type: 'integer',
									},
								},
							},
						},
					},
				},
				{
					sortBy: ['data', 'stressedDays'],
				},
			);

			expect(results).toEqual([
				{
					id: worker1.id,
					links: {
						'works at': [
							{
								id: office.id,
							},
						],
					},
					data: {
						stressedDays: [1, 3, 5],
					},
				},
			]);
		});

		it('should be able to query $$links inside a not', async () => {
			const office = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const worker1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const worker2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${worker1.slug}-works-at-${office.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'works at',
				data: {
					inverseName: 'has worker',
					from: {
						id: worker1.id,
						type: worker1.type,
					},
					to: {
						id: office.id,
						type: office.type,
					},
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					additionalProperties: false,
					required: ['links'],
					not: {
						$$links: {
							'works at': {
								additionalProperties: false,
								properties: {
									id: {
										const: office.id,
									},
								},
							},
						},
					},
					properties: {
						id: {
							enum: [worker1.id, worker2.id],
						},
					},
				},
			);

			expect(results).toEqual([
				{
					id: worker2.id,
					links: {},
				},
			]);
		});

		it('should be able to query $$links inside a property', async () => {
			const office = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const worker1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						isStressed: true,
					},
				},
			);

			const worker2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						isStressed: false,
					},
				},
			);

			const worker3 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${worker1.slug}-works-at-${office.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'works at',
				data: {
					inverseName: 'has worker',
					from: {
						id: worker1.id,
						type: worker1.type,
					},
					to: {
						id: office.id,
						type: office.type,
					},
				},
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${worker2.slug}-works-at-${office.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'works at',
				data: {
					inverseName: 'has worker',
					from: {
						id: worker2.id,
						type: worker2.type,
					},
					to: {
						id: office.id,
						type: office.type,
					},
				},
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${worker3.slug}-works-at-${office.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'works at',
				data: {
					inverseName: 'has worker',
					from: {
						id: worker3.id,
						type: worker3.type,
					},
					to: {
						id: office.id,
						type: office.type,
					},
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					additionalProperties: false,
					required: ['id', 'links', 'data'],
					properties: {
						data: {
							required: ['isStressed'],
							properties: {
								isStressed: {
									$$links: {
										'works at': {
											additionalProperties: false,
											properties: {
												id: {
													const: office.id,
												},
											},
										},
									},
									const: true,
								},
							},
						},
					},
				},
				{
					sortBy: ['data', 'isStressed'],
				},
			);

			expect(results).toEqual([
				{
					id: worker1.id,
					links: {
						'works at': [
							{
								id: office.id,
							},
						],
					},
					data: {
						isStressed: true,
					},
				},
			]);
		});

		it('should not ignore $$links optimized out by constant folding', async () => {
			const office = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug: ctx.generateRandomSlug(),
					type: 'card@1.0.0',
					version: '1.0.0',
				},
			);

			const worker1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug: ctx.generateRandomSlug(),
					type: 'card@1.0.0',
					version: '1.0.0',
					data: {
						idx: 0,
						isWorking: true,
					},
				},
			);

			const worker2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						idx: 1,
						isWorking: true,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${worker1.slug}-works-at-${office.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'works at',
				data: {
					inverseName: 'has worker',
					from: {
						id: worker1.id,
						type: worker1.type,
					},
					to: {
						id: office.id,
						type: office.type,
					},
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					additionalProperties: false,
					required: ['id', 'links'],
					properties: {
						data: {
							additionalProperties: false,
							required: ['isWorking'],
							properties: {
								isWorking: {
									const: true,
								},
							},
						},
					},
					anyOf: [
						{
							not: {
								anyOf: [
									{
										$$links: {
											'works at': {
												additionalProperties: false,
												properties: {
													id: {
														const: office.id,
													},
												},
											},
										},
									},
									true,
								],
							},
						},
						true,
					],
				},
				{
					sortBy: ['data', 'idx'],
				},
			);

			expect(results).toEqual([
				{
					id: worker1.id,
					links: {
						'works at': [
							{
								id: office.id,
							},
						],
					},
					data: {
						isWorking: true,
					},
				},
				{
					id: worker2.id,
					links: {},
					data: {
						isWorking: true,
					},
				},
			]);
		});

		test.skip('should handle the same link type in multiple $$links', async () => {
			const office = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			const worker1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						isStressed: true,
					},
				},
			);

			const worker2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						isStressed: false,
					},
				},
			);

			const worker3 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
					data: {
						isStressed: false,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${worker1.slug}-works-at-${office.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'works at',
				data: {
					inverseName: 'has worker',
					from: {
						id: worker1.id,
						type: worker1.type,
					},
					to: {
						id: office.id,
						type: office.type,
					},
				},
			});

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${worker2.slug}-works-at-${office.slug}`,
				type: 'link@1.0.0',
				version: '1.0.0',
				name: 'works at',
				data: {
					inverseName: 'has worker',
					from: {
						id: worker2.id,
						type: worker2.type,
					},
					to: {
						id: office.id,
						type: office.type,
					},
				},
			});

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					additionalProperties: false,
					required: ['links', 'data'],
					properties: {
						id: {
							enum: [worker1.id, worker2.id, worker3.id],
						},
						data: {
							required: ['isStressed'],
							properties: {
								isStressed: {
									anyOf: [
										{
											$$links: {
												'works at': {
													additionalProperties: false,
													properties: {
														id: {
															const: office.id,
														},
													},
												},
											},
											const: true,
										},
										{
											not: {
												$$links: {
													'works at': true,
												} as any,
											},
											const: false,
										},
									],
								},
							},
						},
					},
				},
				{
					sortBy: ['data', 'isStressed'],
				},
			);

			expect(results).toEqual([
				{
					id: worker3.id,
					links: {},
					data: {
						isStressed: false,
					},
				},
				{
					id: worker1.id,
					links: {
						'works at': [
							{
								id: office.id,
							},
						],
					},
					data: {
						isStressed: true,
					},
				},
			]);
		});

		it('should filter results based on session scope', async () => {
			// Insert cards to query for.
			const foo = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);
			const bar = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'card@1.0.0',
				},
			);

			// Create scoped session for admin user.
			const adminSession = await ctx.kernel.getCardById(
				ctx.context,
				ctx.kernel.sessions!.admin,
				ctx.kernel.sessions!.admin,
			);
			assert(adminSession !== null);
			const scopedSession = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'session@1.0.0',
					data: {
						actor: adminSession.data.actor,
						scope: {
							type: 'object',
							properties: {
								slug: {
									type: 'string',
									const: foo.slug,
								},
							},
						},
					},
				},
			);

			// Query with both scoped and non-scoped sessions.
			const query: JSONSchema = {
				type: 'object',
				additionalProperties: true,
				required: ['slug'],
				properties: {
					slug: {
						type: 'string',
						enum: [foo.slug, bar.slug],
					},
				},
			};

			const fullResults = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				query,
			);
			const scopedResults = await ctx.kernel.query(
				ctx.context,
				scopedSession.id,
				query,
			);

			expect(
				_.some(fullResults, {
					slug: foo.slug,
				}),
			).toBeTruthy();
			expect(
				_.some(fullResults, {
					slug: bar.slug,
				}),
			).toBeTruthy();
			expect(
				_.some(scopedResults, {
					slug: foo.slug,
				}),
			).toBeTruthy();
			expect(
				_.some(scopedResults, {
					slug: bar.slug,
				}),
			).toBeFalsy();
		});

		it('should work with optional prerelease and build version data', async () => {
			const cards = [
				await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
					type: 'card@1.0.0',
					version: '3.0.1',
					data: {
						foo: 1,
					},
				}),
				await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
					type: 'card@1.0.0',
					version: '3.0.2',
					data: {
						foo: 1,
					},
				}),
			];

			const results = await ctx.kernel.query(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'object',
					additionalProperties: false,
					properties: {
						slug: {
							type: 'string',
						},
						version: {
							type: 'string',
							enum: [cards[0].version, cards[1].version],
						},
					},
					required: ['slug', 'version'],
				},
				{
					sortBy: 'version',
				},
			);

			expect(results).toEqual([
				{
					slug: cards[0].slug,
					version: cards[0].version,
				},
				{
					slug: cards[1].slug,
					version: cards[1].version,
				},
			]);
		});

		it('should throw if the session is not active', async () => {
			const adminUser = await ctx.kernel.getCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				'user-admin@1.0.0',
			);

			assert(adminUser !== null);

			// Create a new inactive session
			const session = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					active: false,
					type: 'session@1.0.0',
					data: {
						actor: adminUser.id,
					},
				},
			);

			expect(
				ctx.kernel.getCardBySlug(ctx.context, session.id, 'user-admin@1.0.0'),
			).rejects.toThrow();
		});
	});

	describe('.stream()', () => {
		it('should include data if additionalProperties true', async (done) => {
			const slug = ctx.generateRandomSlug({
				prefix: 'card',
			});

			const emitter = await ctx.kernel.stream(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
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
				},
			);

			emitter.on('data', (change) => {
				expect(change).toEqual({
					id: change.after.id,
					type: 'insert',
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

			emitter.on('error', done);
			emitter.on('closed', done);

			ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug,
				type: 'card@1.0.0',
				data: {
					test: 1,
				},
			});
		});

		it('should report back new elements that match a certain slug', async (done) => {
			const slug = ctx.generateRandomSlug({
				prefix: 'card',
			});
			const emitter = await ctx.kernel.stream(
				ctx.context,
				ctx.kernel.sessions!.admin,
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
			emitter.on('data', (change) => {
				expect(change.after).toEqual({
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

			ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug,
				type: 'card@1.0.0',
				version: '1.0.0',
				data: {
					test: 1,
				},
			});

			ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				type: 'card@1.0.0',
				data: {
					test: 2,
				},
			});
		});

		it('should report back elements of a certain type', async (done) => {
			const slug = ctx.generateRandomSlug();
			const emitter = await ctx.kernel.stream(
				ctx.context,
				ctx.kernel.sessions!.admin,
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

			emitter.on('data', (change) => {
				expect(change.after).toEqual({
					slug,
					type: 'card@1.0.0',
					data: {
						email: 'johndoe@example.com',
					},
				});

				emitter.close();
			});

			emitter.on('error', done);
			emitter.on('closed', done);

			ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				type: 'card@1.0.0',
				data: {
					test: 1,
				},
			});
			ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug,
				type: 'card@1.0.0',
				data: {
					email: 'johndoe@example.com',
				},
			});
		});

		it('should be able to attach a large number of streams', async () => {
			const slug = ctx.generateRandomSlug();
			const schema: JSONSchema = {
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
						ctx.context,
						ctx.kernel.sessions!.admin,
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

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug,
				type: 'card@1.0.0',
				data: {
					email: 'johndoe@example.com',
				},
			});

			const results = await Bluebird.all(promises);

			expect(
				results.map((result: any) => {
					return _.omit(result, ['id']);
				}),
			).toEqual(
				_.times(
					times,
					_.constant({
						type: 'insert',
						after: {
							slug,
							type: 'card@1.0.0',
							data: {
								email: 'johndoe@example.com',
							},
						},
					}),
				),
			);
		});

		it('should report back action requests', async (done) => {
			const emitter = await ctx.kernel.stream(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					type: 'object',
					additionalProperties: false,
					properties: {
						type: {
							type: 'string',
							pattern: '^action-request@',
						},
						data: {
							type: 'object',
							properties: {
								action: {
									type: 'string',
								},
								actor: {
									type: 'string',
								},
								timestamp: {
									type: 'string',
								},
								arguments: {
									type: 'object',
									additionalProperties: true,
								},
							},
						},
					},
					required: ['type'],
				},
			);

			emitter.on('data', (change) => {
				expect(change.after).toEqual({
					type: 'action-request@1.0.0',
					data: {
						context: ctx.context,
						epoch: 1521170969543,
						action: 'action-delete-card@1.0.0',
						actor: '4a962ad9-20b5-4dd8-a707-bf819593cc84',
						input: {
							id: '4a962ad9-20b5-4dd8-a707-bf819593cc84',
							type: 'card@1.0.0',
						},
						timestamp: '2018-03-16T03:29:29.543Z',
						arguments: {},
					},
				});

				emitter.close();
			});

			emitter.on('error', done);
			emitter.on('closed', done);

			ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				type: 'action-request@1.0.0',
				data: {
					context: ctx.context,
					action: 'action-delete-card@1.0.0',
					actor: '4a962ad9-20b5-4dd8-a707-bf819593cc84',
					epoch: 1521170969543,
					timestamp: '2018-03-16T03:29:29.543Z',
					input: {
						id: '4a962ad9-20b5-4dd8-a707-bf819593cc84',
						type: 'card@1.0.0',
					},
					arguments: {},
				},
			});
			ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				type: 'card@1.0.0',
				data: {
					email: 'johndoe@example.com',
				},
			});
		});

		it('should close without finding anything', async (done) => {
			const emitter = await ctx.kernel.stream(
				ctx.context,
				ctx.kernel.sessions!.admin,
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

		it('should report back inactive elements', async (done) => {
			const slug = ctx.generateRandomSlug();
			const emitter = await ctx.kernel.stream(
				ctx.context,
				ctx.kernel.sessions!.admin,
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
							const: 'card@1.0.0',
						},
					},
					required: ['type'],
				},
			);

			emitter.on('data', (change) => {
				expect(change.after).toEqual({
					type: 'card@1.0.0',
					slug,
				});

				emitter.close();
			});

			emitter.on('error', done);
			emitter.on('closed', done);

			ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug,
				active: false,
				type: 'card@1.0.0',
				data: {
					test: 2,
				},
			});
		});

		it('should be able to resolve links on an update to the base card', async (done) => {
			const slug = ctx.generateRandomSlug();
			const card1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug,
					type: 'card@1.0.0',
					version: '1.0.0',
					data: {
						test: 1,
					},
				},
			);

			const card2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					active: false,
					type: 'card@1.0.0',
					data: {
						test: 2,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${card1.slug}-is-attached-to-${card2.slug}`,
				type: 'link@1.0.0',
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: card1.id,
						type: card1.type,
					},
					to: {
						id: card2.id,
						type: card2.type,
					},
				},
			});

			const emitter = await ctx.kernel.stream(
				ctx.context,
				ctx.kernel.sessions!.admin,
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

			emitter.on('data', (change) => {
				expect(change.after).toEqual({
					type: 'card@1.0.0',
					slug,
					links: {
						'is attached to': [
							{
								slug: card2.slug,
							},
						],
					},
				});

				emitter.close();
			});

			emitter.on('error', done);
			emitter.on('closed', done);

			ctx.kernel.patchCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card1.slug}@${card1.version}`,
				[
					{
						op: 'replace',
						path: '/data/test',
						value: 3,
					},
				],
			);
		});

		it('should be able to resolve links when a new link is added', async (done) => {
			const slug = ctx.generateRandomSlug();

			const card1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug,
					type: 'card@1.0.0',
					data: {
						test: 1,
					},
				},
			);

			const card2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					active: false,
					type: 'card@1.0.0',
					data: {
						test: 2,
					},
				},
			);

			const emitter = await ctx.kernel.stream(
				ctx.context,
				ctx.kernel.sessions!.admin,
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

			emitter.on('data', (change) => {
				expect(change.after).toEqual({
					type: 'card@1.0.0',
					slug,
					links: {
						'is attached to': [
							{
								slug: card2.slug,
							},
						],
					},
				});

				emitter.close();
			});

			emitter.on('error', done);
			emitter.on('closed', done);

			ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${card1.slug}-is-attached-to-${card2.slug}`,
				type: 'link@1.0.0',
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: card1.id,
						type: card1.type,
					},
					to: {
						id: card2.id,
						type: card2.type,
					},
				},
			});
		});

		// TODO: Get this working, but in a performant way.
		test.skip('should be able to resolve links on an update to the linked card', async (done) => {
			const slug = ctx.generateRandomSlug();

			const card1 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug,
					type: 'card@1.0.0',
					version: '1.0.0',
					data: {
						test: 1,
					},
				},
			);

			const card2 = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					active: false,
					type: 'card@1.0.0',
					data: {
						test: 2,
					},
				},
			);

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug: `link-${card1.slug}-is-attached-to-${card2.slug}`,
				type: 'link@1.0.0',
				name: 'is attached to',
				data: {
					inverseName: 'has attached element',
					from: {
						id: card1.id,
						type: card1.type,
					},
					to: {
						id: card2.id,
						type: card2.type,
					},
				},
			});

			const emitter = await ctx.kernel.stream(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					$$links: {
						'is attached to': {
							type: 'object',
							additionalProperties: false,
							properties: {
								slug: {
									type: 'string',
								},
								data: {
									type: 'object',
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
					required: ['type'],
				},
			);

			emitter.on('data', (change) => {
				expect(change.after).toEqual({
					type: 'card@1.0.0',
					slug,
					links: {
						'is attached to': [
							{
								slug: card2.slug,
							},
						],
					},
				});

				emitter.close();
			});

			emitter.on('error', done);
			emitter.on('closed', done);

			ctx.kernel.patchCardBySlug(
				ctx.context,
				ctx.kernel.sessions!.admin,
				`${card2.slug}@${card1.version}`,
				[
					{
						op: 'replace',
						path: '/data/test',
						value: 3,
					},
				],
			);
		});

		it('should send the unmatch event when a previously matching card does not match anymore', async () => {
			const slug = ctx.generateRandomSlug();
			const stream = await ctx.kernel.stream(
				ctx.context,
				ctx.kernel.sessions!.admin,
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
						after: {
							slug,
							data: {
								status: 'open',
							},
						},
					});

					stage = 1;
					await ctx.kernel.patchCardBySlug(
						ctx.context,
						ctx.kernel.sessions!.admin,
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
						after: null,
					});

					stream.close();
				}
			});

			const end = once(stream, 'closed');

			await ctx.kernel.insertCard(ctx.context, ctx.kernel.sessions!.admin, {
				slug,
				type: 'card@1.0.0',
				data: {
					status: 'open',
				},
			});

			await end;
		});

		it('should send the dataset event on a query request and support the unmatch event for these cards', async () => {
			const slug = ctx.generateRandomSlug();
			const card = await ctx.kernel.insertCard(
				ctx.context,
				ctx.kernel.sessions!.admin,
				{
					slug,
					type: 'card@1.0.0',
					data: {
						status: 'open',
					},
				},
			);

			const stream = await ctx.kernel.stream(
				ctx.context,
				ctx.kernel.sessions!.admin,
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
			const queryId = uuid();

			stream.on('dataset', async (payload) => {
				expect(stage).toEqual(0);
				expect(payload).toEqual({
					id: queryId,
					cards: [card],
				});

				stage = 1;
				await ctx.kernel.patchCardBySlug(
					ctx.context,
					ctx.kernel.sessions!.admin,
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
					id: card.id,
					type: 'unmatch',
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
	});
});
