/* tslint:disable no-floating-promises */
import { strict as assert } from 'assert';
import * as _ from 'lodash';
import { randomUUID } from 'node:crypto';
import {
	AutumnDBSession,
	CONTRACTS,
	errors,
	RelationshipContract,
	testUtils,
} from '../../lib';
import type { Contract, JsonSchema } from '../../lib/types';
import { createRelationships } from './create-relationships';

let ctx: testUtils.TestContext;

beforeAll(async () => {
	ctx = await testUtils.newContext();
	await createRelationships(ctx);
});

afterAll(async () => {
	await testUtils.destroyContext(ctx);
});

describe('Kernel', () => {
	describe('contracts', () => {
		for (const key of Object.keys(CONTRACTS)) {
			it(`should contain the ${key} contract by default`, async () => {
				const contract = CONTRACTS[key];
				contract.name = _.isString(contract.name) ? contract.name : null;
				const element = await ctx.kernel.getContractBySlug(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					`${contract.slug}@${contract.version}`,
				);
				expect(contract).toEqual(
					_.omit(element, ['created_at', 'id', 'updated_at', 'linked_at']),
				);
			});
		}
	});

	describe('.patchContractBySlug()', () => {
		it('should throw an error if the element does not exist', async () => {
			const slug = `${testUtils.generateRandomSlug({
				prefix: 'foobarbaz',
			})}@1.0.0`;
			await expect(
				ctx.kernel.patchContractBySlug(
					ctx.logContext,
					ctx.kernel.adminSession()!,
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
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					tags: [],
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			await ctx.kernel.patchContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
				[
					{
						op: 'replace',
						path: '/data/foo',
						value: 'baz',
					},
				],
			);

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
			);

			expect(result).toEqual({
				id: contract.id,
				active: true,
				name: null,
				capabilities: [],
				created_at: contract.created_at,
				linked_at: contract.linked_at,
				links: contract.links,
				markers: contract.markers,
				requires: contract.requires,
				slug: contract.slug,
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
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			await ctx.kernel.patchContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
				[
					{
						op: 'add',
						path: '/markers/0',
						value: 'test',
					},
				],
			);

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
			);

			expect(result).toEqual({
				id: contract.id,
				active: true,
				name: null,
				capabilities: [],
				created_at: contract.created_at,
				linked_at: contract.linked_at,
				links: {},
				markers: ['test'],
				requires: [],
				slug: contract.slug,
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
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						'foo/bla': 'bar',
						bar: 'baz',
					},
				},
			);

			await ctx.kernel.patchContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
				[
					{
						op: 'remove',
						path: '/data/foo~1bla',
					},
				],
			);

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
			);

			expect(result).toEqual({
				id: contract.id,
				active: true,
				name: null,
				capabilities: [],
				created_at: contract.created_at,
				linked_at: contract.linked_at,
				links: contract.links,
				markers: contract.markers,
				requires: contract.requires,
				slug: contract.slug,
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
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			await ctx.kernel.patchContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
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

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
			);

			expect(result).toEqual({
				id: contract.id,
				active: true,
				name: null,
				capabilities: [],
				created_at: contract.created_at,
				linked_at: contract.linked_at,
				links: contract.links,
				markers: contract.markers,
				requires: contract.requires,
				slug: contract.slug,
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
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const patched = await ctx.kernel.patchContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
				[
					{
						op: 'remove',
						path: '/id',
					},
				],
			);

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
			);

			expect(patched).toEqual(contract);
			expect(result).toEqual(contract);
		});

		it('should not be able to delete a top level property', async () => {
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			await expect(
				ctx.kernel.patchContractBySlug(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					`${contract.slug}@${contract.version}`,
					[
						{
							op: 'remove',
							path: '/tags',
						},
					],
				),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
			);

			expect(result).toEqual(contract);
		});

		it('should throw given an operation without a path', async () => {
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			await expect(
				ctx.kernel.patchContractBySlug(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					`${contract.slug}@${contract.version}`,
					[
						{
							op: 'add',
							value: 'foo',
						},
					] as any,
				),
			).rejects.toThrow(errors.JellyfishInvalidPatch);
		});

		it('should throw if adding to non existent property', async () => {
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			await expect(
				ctx.kernel.patchContractBySlug(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					`${contract.slug}@${contract.version}`,
					[
						{
							op: 'add',
							path: '/data/hello/world',
							value: 1,
						},
					],
				),
			).rejects.toThrow(errors.JellyfishInvalidPatch);

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
			);

			expect(result).toEqual(contract);
		});

		it('should throw given an invalid operation', async () => {
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			await expect(
				ctx.kernel.patchContractBySlug(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					`${contract.slug}@${contract.version}`,
					[
						{
							op: 'bar',
							path: '/data/foo',
							value: 1,
						} as any,
					],
				),
			).rejects.toThrow(errors.JellyfishInvalidPatch);

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
			);

			expect(result).toEqual(contract);
		});

		it('should not apply half matching patches', async () => {
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			await expect(
				ctx.kernel.patchContractBySlug(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					`${contract.slug}@${contract.version}`,
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

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
			);

			expect(result).toEqual(contract);
		});

		it('should not break the type schema', async () => {
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
				ctx.kernel.patchContractBySlug(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					`${contract.slug}@${contract.version}`,
					[
						{
							op: 'remove',
							path: '/data/roles',
						},
					],
				),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
			);
			if (result !== null) {
				result.linked_at = contract.linked_at;
			}

			expect(result).toEqual(contract);
		});

		it('should apply a no-op patch', async () => {
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const patched = await ctx.kernel.patchContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
				[
					{
						op: 'replace',
						path: '/data/foo',
						value: 'bar',
					},
				],
			);

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
			);

			expect(patched).toEqual(contract);
			expect(result).toEqual(contract);
		});

		it('should apply an empty set of patches', async () => {
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const patched = await ctx.kernel.patchContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
				[],
			);

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
			);

			expect(patched).toEqual(contract);
			expect(result).toEqual(contract);
		});

		it('should ignore changes to read-only properties', async () => {
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const patched = await ctx.kernel.patchContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
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

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
			);

			expect(patched).toEqual(contract);
			expect(result).toEqual(contract);
		});

		it('should be able to patch contracts hidden to the user', async () => {
			const slug = testUtils.generateRandomSlug({
				prefix: 'user-johndoe',
			});
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const userContract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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

			expect(
				await ctx.kernel.getContractBySlug(
					ctx.logContext,
					{ actor: userContract },
					`${userContract.slug}@${userContract.version}`,
				),
			).toBeFalsy();

			await expect(
				ctx.kernel.patchContractBySlug(
					ctx.logContext,
					{ actor: userContract },
					`${userContract.slug}@${userContract.version}`,
					[
						{
							op: 'add',
							path: '/data/foo',
							value: 'bar',
						},
					],
				),
			).rejects.toThrow(errors.JellyfishNoElement);

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${userContract.slug}@${userContract.version}`,
			);
			if (result !== null) {
				result.linked_at = userContract.linked_at;
			}

			expect(result).toEqual(userContract);
		});

		it('should not allow updates in hidden fields', async () => {
			const slug = testUtils.generateRandomSlug({
				prefix: 'user-johndoe',
			});
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const userContract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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

			const filteredUser = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				{ actor: userContract },
				`${userContract.slug}@${userContract.version}`,
			);

			expect(filteredUser!.data).toEqual({
				email: 'johndoe@example.com',
			});

			await expect(
				ctx.kernel.patchContractBySlug(
					ctx.logContext,
					{ actor: userContract },
					`${userContract.slug}@${userContract.version}`,
					[
						{
							op: 'replace',
							path: '/data/roles',
							value: ['admin'],
						},
					],
				),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${userContract.slug}@${userContract.version}`,
			);
			if (result !== null) {
				result.linked_at = userContract.linked_at;
			}

			expect(result).toEqual(userContract);
		});

		it('should not return the full contract', async () => {
			const slug = testUtils.generateRandomSlug({
				prefix: 'user-johndoe',
			});
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const userContract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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

			const filteredUser = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				{ actor: userContract },
				`${userContract.slug}@${userContract.version}`,
			);

			expect(filteredUser!.data).toEqual({
				email: 'johndoe@example.com',
			});

			const patched = await ctx.kernel.patchContractBySlug(
				ctx.logContext,
				{ actor: userContract },
				`${userContract.slug}@${userContract.version}`,
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

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${userContract.slug}@${userContract.version}`,
			);

			expect(result!.data).toEqual({
				email: 'johndoe@gmail.com',
				hash: 'secret',
				roles: [],
			});
		});

		it('should not allow a patch that makes a contract inaccessible', async () => {
			const slug = testUtils.generateRandomSlug({
				prefix: 'user-johndoe',
			});
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const userContract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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

			const randomContract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						hello: 'world',
						foo: 7,
					},
				},
			);

			const filteredContract = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				{ actor: userContract },
				`${randomContract.slug}@${randomContract.version}`,
			);

			expect(filteredContract).toEqual(randomContract);

			await expect(
				ctx.kernel.patchContractBySlug(
					ctx.logContext,
					{ actor: userContract },
					`${randomContract.slug}@${randomContract.version}`,
					[
						{
							op: 'replace',
							path: '/data/foo',
							value: 8,
						},
					],
				),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${randomContract.slug}@${randomContract.version}`,
			);

			expect(result).toEqual(randomContract);
		});

		it('should not remove inaccessible fields', async () => {
			const slug = testUtils.generateRandomSlug({
				prefix: 'user-johndoe',
			});
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const userContract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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

			const filteredUser = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				{ actor: userContract },
				`${userContract.slug}@${userContract.version}`,
			);

			expect(filteredUser!.data).toEqual({
				email: 'johndoe@example.com',
			});

			await expect(
				ctx.kernel.patchContractBySlug(
					ctx.logContext,
					{ actor: userContract },
					`${userContract.slug}@${userContract.version}`,
					[
						{
							op: 'remove',
							path: '/data/hash',
						},
					],
				),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${userContract.slug}@${userContract.version}`,
			);
			if (result !== null) {
				result.linked_at = userContract.linked_at;
			}

			expect(result).toEqual(userContract);
		});

		it('should not add an inaccesible field', async () => {
			const slug = testUtils.generateRandomSlug({
				prefix: 'user-johndoe',
			});
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const userContract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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

			const filteredUser = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				{ actor: userContract },
				`${userContract.slug}@${userContract.version}`,
			);

			expect(filteredUser!.data).toEqual({
				email: 'johndoe@example.com',
			});

			await expect(
				ctx.kernel.patchContractBySlug(
					ctx.logContext,
					{ actor: userContract },
					`${userContract.slug}@${userContract.version}`,
					[
						{
							op: 'add',
							path: '/data/special',
							value: 7,
						},
					],
				),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${userContract.slug}@${userContract.version}`,
			);
			if (result !== null) {
				result.linked_at = userContract.linked_at;
			}

			expect(result).toEqual(userContract);
		});

		it('should not throw when adding a loop field referencing a loop that does exist', async () => {
			const loopSlug = testUtils.generateRandomSlug({
				prefix: 'loop/',
			});
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: loopSlug,
					type: 'loop@1.0.0',
				},
			);

			const slug = testUtils.generateRandomSlug({
				prefix: 'foobarbaz',
			});
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug,
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const patchedContract = await ctx.kernel.patchContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
				[
					{
						op: 'add',
						path: '/loop',
						value: `${loopSlug}@1.0.0`,
					},
				],
			);

			expect(patchedContract.loop).toBe(`${loopSlug}@1.0.0`);
		});

		it('should not throw when removing the loop field value', async () => {
			const loopSlug = testUtils.generateRandomSlug({
				prefix: 'loop/',
			});
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: loopSlug,
					type: 'loop@1.0.0',
				},
			);

			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					loop: `${loopSlug}@1.0.0`,
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const patchedContract = await ctx.kernel.patchContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
				[
					{
						op: 'remove',
						path: '/loop',
					},
				],
			);

			expect(patchedContract.loop).toBeUndefined();
		});

		it('should not throw when replacing a loop field with a value referencing a loop that does exist', async () => {
			const loopSlug = testUtils.generateRandomSlug({
				prefix: 'loop/',
			});
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: loopSlug,
					type: 'loop@1.0.0',
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: loopSlug,
					type: 'loop@1.0.0',
					version: '1.0.1',
				},
			);

			const slug = testUtils.generateRandomSlug({
				prefix: 'foobarbaz',
			});
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug,
					loop: `${loopSlug}@1.0.0`,
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const patchedContract = await ctx.kernel.patchContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
				[
					{
						op: 'replace',
						path: '/loop',
						value: `${loopSlug}@1.0.1`,
					},
				],
			);

			expect(patchedContract.loop).toBe(`${loopSlug}@1.0.1`);
		});

		it('should throw if trying to add a loop field referencing a loop that does not exist', async () => {
			const slug = testUtils.generateRandomSlug({
				prefix: 'foobarbaz',
			});
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug,
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			await expect(
				ctx.kernel.patchContractBySlug(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					`${contract.slug}@${contract.version}`,
					[
						{
							op: 'add',
							path: '/loop',
							value: 'saywhat@1.0.0',
						},
					],
				),
			).rejects.toThrow(errors.JellyfishNoElement);

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
			);

			expect(result).toEqual(contract);
		});

		it('should throw if trying to add a loop field referencing a loop that is not a loop contract', async () => {
			const slug = testUtils.generateRandomSlug({
				prefix: 'foobarbaz',
			});
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug,
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			await expect(
				ctx.kernel.patchContractBySlug(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					`${contract.slug}@${contract.version}`,
					[
						{
							op: 'add',
							path: '/loop',
							value: 'user@1.0.0',
						},
					],
				),
			).rejects.toThrow(errors.JellyfishNoElement);

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
			);

			expect(result).toEqual(contract);
		});

		it('should throw if trying to replace the loop field with a value referencing a loop that does not exist', async () => {
			const loopSlug = testUtils.generateRandomSlug({
				prefix: 'loop/',
			});
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: loopSlug,
					type: 'loop@1.0.0',
				},
			);

			const slug = testUtils.generateRandomSlug({
				prefix: 'foobarbaz',
			});
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
				ctx.kernel.patchContractBySlug(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					`${contract.slug}@${contract.version}`,
					[
						{
							op: 'replace',
							path: '/loop',
							value: 'saywhat@1.0.0',
						},
					],
				),
			).rejects.toThrow(errors.JellyfishNoElement);

			const result = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract.slug}@${contract.version}`,
			);

			expect(result).toEqual(contract);
		});

		it('should apply patch for users that satisfy markers', async () => {
			const org = await ctx.createOrg(testUtils.generateRandomId());
			const actor = await ctx.createUser(
				testUtils.generateRandomId(),
				testUtils.generateRandomId(),
			);
			await ctx.createLink(actor, org, 'is member of', 'has member');

			// org-wide markers
			let result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
					markers: [org.slug],
				},
			);
			let foo = testUtils.generateRandomId();
			let contract = await ctx.kernel.patchContractBySlug(
				ctx.logContext,
				{ actor },
				`${result.slug}@${result.version}`,
				[
					{
						op: 'replace',
						path: '/data/foo',
						value: foo,
					},
				],
			);
			expect(contract.data).toEqual({
				foo,
			});

			// user-specific markers
			result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
					markers: [actor.slug],
				},
			);
			foo = testUtils.generateRandomId();
			contract = await ctx.kernel.patchContractBySlug(
				ctx.logContext,
				{ actor },
				`${result.slug}@${result.version}`,
				[
					{
						op: 'replace',
						path: '/data/foo',
						value: foo,
					},
				],
			);
			expect(contract.data).toEqual({
				foo,
			});

			// user+org markers
			result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
					markers: [`${actor.slug}+${org.slug}`],
				},
			);
			foo = testUtils.generateRandomId();
			contract = await ctx.kernel.patchContractBySlug(
				ctx.logContext,
				{ actor },
				`${result.slug}@${result.version}`,
				[
					{
						op: 'replace',
						path: '/data/foo',
						value: foo,
					},
				],
			);
			expect(contract.data).toEqual({
				foo,
			});
		});

		it('should throw for users that do not satisfy markers', async () => {
			const org = await ctx.createOrg(testUtils.generateRandomId());
			const actor = await ctx.createUser(
				testUtils.generateRandomId(),
				testUtils.generateRandomId(),
			);
			await ctx.createLink(actor, org, 'is member of', 'has member');

			const result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					markers: ['user-admin'],
				},
			);

			await expect(
				ctx.kernel.patchContractBySlug(
					ctx.logContext,
					{ actor },
					`${result.slug}@${result.version}`,
					[
						{
							op: 'replace',
							path: '/data/foo',
							value: 'buz',
						},
					],
				),
			).rejects.toThrow(errors.JellyfishNoElement);
		});
	});

	describe('.insertContract()', () => {
		it('should not be able to set links', async () => {
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					links: {
						foo: 'bar',
					} as any,
				},
			);

			const element = await ctx.kernel.getContractById(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				contract.id,
			);

			assert(element !== null);

			expect(element.links).toEqual({});
		});

		it('should create a user with two email addressses', async () => {
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'user@1.0.0',
					data: {
						email: ['johndoe@example.com', 'johndoe@gmail.com'],
						hash: 'PASSWORDLESS',
						roles: [],
					},
				},
			);

			expect(contract.data.email).toEqual([
				'johndoe@example.com',
				'johndoe@gmail.com',
			]);
		});

		it('should not create a user with an empty email list', async () => {
			await expect(
				ctx.kernel.insertContract(ctx.logContext, ctx.kernel.adminSession()!, {
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
				ctx.kernel.insertContract(ctx.logContext, ctx.kernel.adminSession()!, {
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
				ctx.kernel.insertContract(ctx.logContext, ctx.kernel.adminSession()!, {
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
				ctx.kernel.insertContract(ctx.logContext, ctx.kernel.adminSession()!, {
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
				ctx.kernel.insertContract(ctx.logContext, ctx.kernel.adminSession()!, {
					type: 'user@1.0.0',
					data: {},
				}),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);
		});

		it('should throw an error if the slug contains @latest', async () => {
			await expect(
				ctx.kernel.insertContract(ctx.logContext, ctx.kernel.adminSession()!, {
					slug: 'test-1@latest',
					type: 'card@1.0.0',
				}),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);
		});

		it('should throw an error if the slug contains a version', async () => {
			await expect(
				ctx.kernel.insertContract(ctx.logContext, ctx.kernel.adminSession()!, {
					slug: 'test-1@1.0.0',
					type: 'card@1.0.0',
				}),
			).rejects.toThrow(errors.JellyfishSchemaMismatch);
		});

		it('should throw an error if the contract type does not exist', async () => {
			await expect(
				ctx.kernel.insertContract(ctx.logContext, ctx.kernel.adminSession()!, {
					type: 'foobarbazqux@1.0.0',
				}),
			).rejects.toThrow(errors.JellyfishUnknownCardType);
		});

		it('should not throw an error if the referenced loop exists', async () => {
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: 'loop/product-os',
					type: 'loop@1.0.0',
				},
			);

			const slug = testUtils.generateRandomSlug();
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug,
					type: 'card@1.0.0',
					loop: 'loop/product-os@1.0.0',
				},
			);

			expect(contract.slug).toBe(slug);
		});

		it('should throw an error if the referenced loop does not exist', async () => {
			await expect(
				ctx.kernel.insertContract(ctx.logContext, ctx.kernel.adminSession()!, {
					type: 'card@1.0.0',
					loop: 'saywhat@1.0.0',
				}),
			).rejects.toThrow(errors.JellyfishNoElement);
		});

		it('should throw an error if the referenced loop is not a loop contract', async () => {
			await expect(
				ctx.kernel.insertContract(ctx.logContext, ctx.kernel.adminSession()!, {
					type: 'card@1.0.0',
					loop: 'user@1.0.0',
				}),
			).rejects.toThrow(errors.JellyfishNoElement);
		});

		it('should be able to insert two versions of the same contract', async () => {
			const slug = testUtils.generateRandomSlug({
				prefix: 'hello-world',
			});

			const contract1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug,
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const contract2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug,
					type: 'card@1.0.0',
					version: '1.0.1',
					data: {
						foo: 'baz',
					},
				},
			);

			expect(contract1.slug).toBe(contract2.slug);

			const element1 = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract1.slug}@1.0.0`,
			);
			expect(element1!.data.foo).toBe('bar');

			const element2 = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract1.slug}@1.0.1`,
			);
			expect(element2!.data.foo).toBe('baz');

			expect(element1).toEqual(contract1);
			expect(element2).toEqual(contract2);
		});

		it('should insert an element with pre-release version data', async () => {
			const version = '1.0.0-alpha';
			const slug = testUtils.generateRandomSlug({
				prefix: 'contract',
			});
			const result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug,
					type: 'card@1.0.0',
					version,
				},
			);
			const element = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${result.slug}@${version}`,
			);

			expect(element!.version).toEqual(version);
		});

		it('should insert an element with pre-release and build version data', async () => {
			const version = '1.0.0-alpha+001';
			const result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					version,
				},
			);
			const element = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${result.slug}@${version}`,
			);

			expect(element!.version).toEqual(version);
		});

		it('should insert multiple prereleases on same version', async () => {
			const slug = testUtils.generateRandomSlug();
			const version1 = '1.0.0-alpha';
			const version2 = '1.0.0-beta';
			const results = [
				await ctx.kernel.insertContract(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					{
						slug,
						type: 'card@1.0.0',
						version: version1,
						data: {},
					},
				),
				await ctx.kernel.insertContract(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					{
						slug,
						type: 'card@1.0.0',
						version: version2,
						data: {},
					},
				),
			];
			const elements = [
				await ctx.kernel.getContractBySlug(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					`${results[0].slug}@${version1}`,
				),
				await ctx.kernel.getContractBySlug(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					`${results[1].slug}@${version2}`,
				),
			];

			// Check that the contracts have the same slug, but different versions
			expect(elements[0]!.slug).toEqual(elements[1]!.slug);
			expect(elements[0]!.version).toEqual(version1);
			expect(elements[1]!.version).toEqual(version2);
		});

		it('should insert multiple builds on same prerelease version', async () => {
			const slug = testUtils.generateRandomSlug();
			const version1 = '1.0.0-alpha+001';
			const version2 = '1.0.0-alpha+002';
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug,
					type: 'card@1.0.0',
					version: version1,
				},
			);
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug,
					type: 'card@1.0.0',
					version: version2,
				},
			);
			const elements = [
				await ctx.kernel.getContractBySlug(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					`${slug}@${version1}`,
				),
				await ctx.kernel.getContractBySlug(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					`${slug}@${version2}`,
				),
			];

			// Check that the contracts have the same slug, but different versions
			expect(elements[0]!.slug).toEqual(elements[1]!.slug);
			expect(elements[0]!.version).toEqual(version1);
			expect(elements[1]!.version).toEqual(version2);
		});

		it('should be able to insert a contract', async () => {
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const element = await ctx.kernel.getContractById(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				contract.id,
			);
			expect(element).toEqual(contract);
		});

		it('should be able to set a tag with a colon', async () => {
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					tags: ['foo:bar'],
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const element = await ctx.kernel.getContractById(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				contract.id,
			);
			expect(element).toEqual(contract);
		});

		it('should be able to set a tag with a space and a slash', async () => {
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					tags: ['CUSTOM HARDWARE/OS'],
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const element = await ctx.kernel.getContractById(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				contract.id,
			);
			expect(element).toEqual(contract);
		});

		it('should use defaults if required keys are missing', async () => {
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			expect(contract).toEqual({
				id: contract.id,
				created_at: contract.created_at,
				updated_at: null,
				linked_at: {},
				slug: contract.slug,
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
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			expect(contract.slug).toBeTruthy();
		});

		it('should throw if the contract slug already exists', async () => {
			const slug = testUtils.generateRandomSlug({
				prefix: 'hello-world',
			});
			const contract = {
				slug,
				type: 'card@1.0.0',
			};

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				contract,
			);
			await expect(
				ctx.kernel.insertContract(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					contract,
				),
			).rejects.toThrow(errors.JellyfishElementAlreadyExists);
		});

		it('.insertContract() read access on a property should not allow to write other properties', async () => {
			const slug = testUtils.generateRandomSlug({
				prefix: 'user-johndoe',
			});
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const userContract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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

			const targetUserContract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: testUtils.generateRandomSlug({
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

			await expect(
				ctx.kernel.replaceContract(
					ctx.logContext,
					{ actor: userContract },
					{
						id: targetUserContract.id,
						slug: targetUserContract.slug,
						type: 'user@1.0.0',
						version: '1.0.0',
						data: {
							email: 'pwned@example.com',
							hash: 'PASSWORDLESS',
							roles: [],
						},
					},
				),
			).rejects.toThrow(errors.JellyfishPermissionsError);
		});

		it('.insertContract() should not insert a link if any of the two target contracts does not exist', async () => {
			await expect(
				ctx.kernel.insertContract(ctx.logContext, ctx.kernel.adminSession()!, {
					slug: `link-${testUtils.generateRandomSlug()}-is-attached-to-${testUtils.generateRandomSlug()}`,
					name: 'is attached to',
					type: 'link@1.0.0',
					version: '1.0.0',
					data: {
						inverseName: 'has attached',
						from: {
							id: testUtils.generateRandomId(),
							type: 'card@1.0.0',
						},
						to: {
							id: testUtils.generateRandomId(),
							type: 'card@1.0.0',
						},
					},
				}),
			).rejects.toThrow(errors.JellyfishNoLinkTarget);
		});
	});

	describe('.replaceContract()', () => {
		it('should replace an element', async () => {
			const contract1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const contract2 = await ctx.kernel.replaceContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: contract1.slug,
					type: 'card@1.0.0',
					data: {
						replaced: true,
					},
				},
			);

			expect(contract1.id).toBe(contract2.id);
			const element = await ctx.kernel.getContractById(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				contract1.id,
			);
			expect(element).toEqual(contract2);
		});

		it('should not overwrite the "created_at" field when overriding a contract', async () => {
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const update = await ctx.kernel.replaceContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: contract.slug,
					type: 'card@1.0.0',
					created_at: new Date(633009018000).toISOString(),
				},
			);

			expect(contract.created_at).toBe(update.created_at);
		});

		it('should not overwrite the "linked_at" field when overriding a contract', async () => {
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const update = await ctx.kernel.replaceContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: contract.slug,
					type: 'card@1.0.0',
					linked_at: {
						foo: 'bar',
					},
				},
			);

			expect(contract.linked_at).toEqual(update.linked_at);
		});

		it('should not be able to set links when overriding a contract', async () => {
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const update = await ctx.kernel.replaceContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: contract.slug,
					type: 'card@1.0.0',
					links: {
						foo: 'bar',
					} as any,
				},
			);

			expect(update.links).toEqual({});
		});
	});

	describe('.getContractBySlug()', () => {
		it('.getContractBySlug() there should be an admin contract', async () => {
			const contract = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				'user-admin@latest',
			);
			expect(contract).toBeTruthy();
		});

		it('.getContractBySlug() should find an active contract by its slug', async () => {
			const result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const contract = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${result.slug}@${result.version}`,
			);
			expect(contract).toEqual(result);
		});

		it('.getContractBySlug() should not find an active contract by its slug and the wrong version', async () => {
			const result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const contract = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${result.slug}@1.0.1`,
			);

			expect(contract).toBeFalsy();
		});

		it('.getContractBySlug() should not find an invalid slug when using @latest', async () => {
			const contract = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				'foo-bar@latest',
			);

			expect(contract).toBeFalsy();
		});

		it('.getContractBySlug() should find an active contract by its slug using @latest', async () => {
			const result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const contract = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${result.slug}@${result.version}`,
			);

			expect(contract).toEqual(result);
		});

		it('.getContractBySlug() should find the latest version of a contract', async () => {
			const contract1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						foo: 'bar',
					},
				},
			);

			const contract2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: contract1.slug,
					type: 'card@1.0.0',
					version: '2.0.1',
					data: {
						foo: 'baz',
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: contract1.slug,
					type: 'card@1.0.0',
					version: '1.2.1',
					data: {
						foo: 'qux',
					},
				},
			);

			const element = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${contract1.slug}@latest`,
			);

			expect(element!.data.foo).toBe('baz');
			expect(element).toEqual(contract2);
		});

		it('.getContractBySlug() should find an active contract by its slug and its type', async () => {
			const result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const contract = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				`${result.slug}@${result.version}`,
			);

			expect(contract).toEqual(result);
		});

		it('should return contract for users that satisfy markers', async () => {
			const org = await ctx.createOrg(testUtils.generateRandomId());
			const actor = await ctx.createUser(
				testUtils.generateRandomId(),
				testUtils.generateRandomId(),
			);
			await ctx.createLink(actor, org, 'is member of', 'has member');

			// org-wide markers
			let result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					markers: [org.slug],
				},
			);
			let contract = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				{ actor },
				`${result.slug}@${result.version}`,
			);
			expect(contract).toEqual(result);

			// user-specific markers
			result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					markers: [actor.slug],
				},
			);
			contract = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				{ actor },
				`${result.slug}@${result.version}`,
			);
			expect(contract).toEqual(result);

			// user+org markers
			result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					markers: [`${actor.slug}+${org.slug}`],
				},
			);
			contract = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				{ actor },
				`${result.slug}@${result.version}`,
			);
			expect(contract).toEqual(result);
		});

		it('should return null for users that do not satisfy markers', async () => {
			const org = await ctx.createOrg(testUtils.generateRandomId());
			const actor = await ctx.createUser(
				testUtils.generateRandomId(),
				testUtils.generateRandomId(),
			);
			await ctx.createLink(actor, org, 'is member of', 'has member');

			const result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					markers: ['user-admin'],
				},
			);

			const contract = await ctx.kernel.getContractBySlug(
				ctx.logContext,
				{ actor },
				`${result.slug}@${result.version}`,
			);
			expect(contract).toEqual(null);
		});
	});

	describe('.getContractById()', () => {
		it('should find an active contract by its id', async () => {
			const result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const contract = await ctx.kernel.getContractById(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				result.id,
			);
			expect(contract).toEqual(result);
		});

		it('should find an active contract by its id and type', async () => {
			const result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const contract = await ctx.kernel.getContractById(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				result.id,
			);

			expect(contract).toEqual(result);
		});

		it('should return an inactive contract by its id', async () => {
			const result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const contract = await ctx.kernel.getContractById(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				result.id,
			);
			expect(contract).toEqual(result);
		});

		it('should return contract for users that satisfy markers', async () => {
			const org = await ctx.createOrg(testUtils.generateRandomId());
			const actor = await ctx.createUser(
				testUtils.generateRandomId(),
				testUtils.generateRandomId(),
			);
			await ctx.createLink(actor, org, 'is member of', 'has member');

			// org-wide markers
			let result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					markers: [org.slug],
				},
			);
			let contract = await ctx.kernel.getContractById(
				ctx.logContext,
				{ actor },
				result.id,
			);
			expect(contract).toEqual(result);

			// user-specific markers
			result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					markers: [actor.slug],
				},
			);
			contract = await ctx.kernel.getContractById(
				ctx.logContext,
				{ actor },
				result.id,
			);
			expect(contract).toEqual(result);

			// user+org markers
			result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					markers: [`${actor.slug}+${org.slug}`],
				},
			);
			contract = await ctx.kernel.getContractById(
				ctx.logContext,
				{ actor },
				result.id,
			);
			expect(contract).toEqual(result);
		});

		it('should return null for users that do not satisfy markers', async () => {
			const org = await ctx.createOrg(testUtils.generateRandomId());
			const actor = await ctx.createUser(
				testUtils.generateRandomId(),
				testUtils.generateRandomId(),
			);
			await ctx.createLink(actor, org, 'is member of', 'has member');

			const result = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					markers: ['user-admin'],
				},
			);

			const contract = await ctx.kernel.getContractById(
				ctx.logContext,
				{ actor },
				result.id,
			);
			expect(contract).toEqual(null);
		});
	});

	describe('.query()', () => {
		it('should throw an error given an invalid regex', async () => {
			await expect(
				ctx.kernel.query(ctx.logContext, ctx.kernel.adminSession()!, {
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
				ctx.kernel.query(ctx.logContext, ctx.kernel.adminSession()!, {
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
				ctx.kernel.query(ctx.logContext, ctx.kernel.adminSession()!, {
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
			const ref = randomUUID();
			const result1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						ref,
						test: 1,
						timestamp: '2018-07-20T23:15:45.702Z',
					},
				},
			);

			const result2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						ref,
						test: 2,
						timestamp: '2018-08-20T23:15:45.702Z',
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
			const ref = randomUUID();

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						ref,
						test: 1,
						timestamp: '2018-07-20T23:15:45.702Z',
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						ref,
						test: 2,
						timestamp: '2018-08-20T23:15:45.702Z',
					},
				},
			);

			const result3 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
			const ref = randomUUID();

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						ref,
						test: 1,
						timestamp: '2018-07-20T23:15:45.702Z',
					},
				},
			);

			const result2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						ref,
						test: 2,
						timestamp: '2018-08-20T23:15:45.702Z',
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
				ctx.logContext,
				ctx.kernel.adminSession()!,
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

		it('should be able to sort linked contracts', async () => {
			const parent = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const child1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						sequence: 1,
					},
				},
			);

			const child2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						sequence: 0,
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
				results.map((contract) => {
					return {
						id: contract.id,
					};
				}),
			).toEqual([
				{
					id: parent.id,
				},
			]);
			expect(
				(results as any)[0].links['has child'].map((contract: Contract) => {
					return {
						id: contract.id,
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

		it('should be able to skip linked contracts', async () => {
			const parent = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const child1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						sequence: 1,
					},
				},
			);

			const child2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						sequence: 0,
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
				results.map((contract) => {
					return {
						id: contract.id,
					};
				}),
			).toEqual([
				{
					id: parent.id,
				},
			]);
			expect(
				(results as any)[0].links['has child'].map((contract: Contract) => {
					return {
						id: contract.id,
					};
				}),
			).toEqual([
				{
					id: child1.id,
				},
			]);
		});

		it('should be able to limit linked contracts', async () => {
			const parent = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const child1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						sequence: 1,
					},
				},
			);

			const child2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						sequence: 0,
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
				results.map((contract) => {
					return {
						id: contract.id,
					};
				}),
			).toEqual([
				{
					id: parent.id,
				},
			]);
			expect(
				results[0].links!['has child']!.map((contract) => {
					return {
						id: contract.id,
					};
				}),
			).toEqual([
				{
					id: child2.id,
				},
			]);
		});

		it('should filter contracts by the options.mask schema if set', async () => {
			const insertedContract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						sequence: 1,
					},
				},
			);

			const query: JsonSchema = {
				type: 'object',
				properties: {
					id: {
						const: insertedContract.id,
					},
				},
			};

			const mask: JsonSchema = {
				type: 'object',
				properties: {
					type: {
						const: 'foo@1.0.0',
					},
				},
			};

			const resultWithNoMask = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				query,
				{},
			);

			expect(
				resultWithNoMask.map((contract) => {
					return {
						id: contract.id,
					};
				}),
			).toEqual([
				{
					id: insertedContract.id,
				},
			]);

			const resultWithMask = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				query,
				{
					mask,
				},
			);

			expect(resultWithMask.length).toBe(0);
		});

		it('should be able to skip and limit linked contracts', async () => {
			const parent = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const child1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						sequence: 1,
					},
				},
			);

			const child2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						sequence: 0,
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
				results.map((contract) => {
					return {
						id: contract.id,
					};
				}),
			).toEqual([
				{
					id: parent.id,
				},
			]);
			expect(
				results[0].links!['has child']!.map((contract) => {
					return {
						id: contract.id,
					};
				}),
			).toEqual([
				{
					id: child1.id,
				},
			]);
		});

		it('should return the contracts that match a schema', async () => {
			const result1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						email: 'johndoe@example.io',
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						email: 'johnsmith@example.io',
					},
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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

		it('should be able to describe a property that starts with $', async () => {
			const result1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						$foo: 'bar',
					},
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
			const role = testUtils.generateRandomSlug({ prefix: 'foo' });
			const actor = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						email: 'johndoe@example.io',
						roles: [role],
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			let results = await ctx.kernel.query(
				ctx.logContext,
				{ actor },
				{
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
				},
			);
			results = results.filter((x) => x.slug !== 'user-settings');

			expect(results).toEqual([
				_.pick(CONTRACTS.user, ['type', 'slug', 'active', 'data']),
			]);
		});

		it('should take roles into account when querying for linked contracts', async () => {
			const role = testUtils.generateRandomSlug({ prefix: 'foo' });
			const actor = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						email: 'johndoe@example.io',
						roles: [role],
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const org = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'org@1.0.0',
					name: 'Foo Ltd',
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const attachment = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: testUtils.generateRandomSlug(),
					type: 'card@1.0.0',
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				{ actor },
				{
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
				},
			);

			expect(results).toEqual([]);
		});

		it('should ignore queries to properties not whitelisted by a role', async () => {
			const role = testUtils.generateRandomSlug({
				prefix: 'foo',
			});
			const actor = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						email: 'johndoe@example.io',
						roles: [role],
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			let results = await ctx.kernel.query(
				ctx.logContext,
				{ actor },
				{
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
				},
			);
			results = results.filter((x) => x.slug !== 'user-settings');

			expect(results).toEqual([
				{
					type: 'type@1.0.0',
					slug: 'user',
				},
			]);
		});

		it('should ignore $id properties in roles', async () => {
			const role = testUtils.generateRandomSlug({ prefix: 'foo' });
			const actor = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						email: 'johndoe@example.io',
						roles: [role],
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			let results = await ctx.kernel.query(
				ctx.logContext,
				{ actor },
				{
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
				},
			);
			results = results.filter((x) => x.slug !== 'user-settings');

			expect(results).toEqual([
				{
					type: 'type@1.0.0',
					slug: 'user',
				},
			]);
		});

		it('should ignore queries to disallowed properties with additionalProperties: true', async () => {
			const role = testUtils.generateRandomSlug({ prefix: 'foo' });
			const actor = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						email: 'johndoe@example.io',
						roles: [role],
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			let results = await ctx.kernel.query(
				ctx.logContext,
				{ actor },
				{
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
				},
			);
			results = results.filter((x) => x.slug !== 'user-settings');

			expect(results).toEqual([
				{
					type: 'type@1.0.0',
					slug: 'user',
				},
			]);
		});

		it('should return inactive contracts', async () => {
			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'object',
					additionalProperties: false,
					properties: {
						slug: {
							const: contract.slug,
						},
					},
					required: ['slug'],
				},
			);

			expect(results).toEqual([
				{
					slug: contract.slug,
				},
			]);
		});

		it('should take a view contract with two filters', async () => {
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					tags: ['foo'],
					data: {
						number: 1,
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						number: 1,
					},
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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

		it('should be able to request all contracts (with no properties) linked to a contract', async () => {
			const parent = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						thread: true,
						number: 1,
					},
				},
			);

			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						thread: false,
						count: 1,
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `link-${contract.slug}-is-appended-to-${parent.slug}`,
					type: 'link@1.0.0',
					version: '1.0.0',
					name: 'is appended to',
					active: true,
					data: {
						inverseName: 'has appended element',
						from: {
							id: contract.id,
							type: contract.type,
						},
						to: {
							id: parent.id,
							type: parent.type,
						},
					},
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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

		it('should get all properties of all contracts', async () => {
			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
			const parent1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						thread: true,
						number: 1,
					},
				},
			);

			const parent2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						thread: true,
						number: 2,
					},
				},
			);

			const contract1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						thread: false,
						count: 1,
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `link-${contract1.slug}-is-attached-to-${parent1.slug}`,
					type: 'link@1.0.0',
					version: '1.0.0',
					name: 'is attached to',
					active: false,
					data: {
						inverseName: 'has attached element',
						from: {
							id: contract1.id,
							type: contract1.type,
						},
						to: {
							id: parent1.id,
							type: parent1.type,
						},
					},
				},
			);

			const contract2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						thread: false,
						count: 2,
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `link-${contract2.slug}-is-attached-to-${parent2.slug}`,
					type: 'link@1.0.0',
					version: '1.0.0',
					name: 'is attached to',
					data: {
						inverseName: 'has attached element',
						from: {
							id: contract2.id,
							type: contract2.type,
						},
						to: {
							id: parent2.id,
							type: parent2.type,
						},
					},
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
			const ref = randomUUID();
			const parent1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						thread: true,
						number: 1,
					},
				},
			);

			const parent2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						thread: true,
						number: 2,
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						thread: true,
						number: 3,
					},
				},
			);

			const contract1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						thread: false,
						count: 1,
						ref,
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `link-${contract1.slug}-is-attached-to-${parent1.slug}`,
					type: 'link@1.0.0',
					version: '1.0.0',
					name: 'is attached to',
					data: {
						inverseName: 'has attached element',
						from: {
							id: contract1.id,
							type: contract1.type,
						},
						to: {
							id: parent1.id,
							type: parent1.type,
						},
					},
				},
			);

			const contract2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						thread: false,
						count: 2,
						ref,
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `link-${contract2.slug}-is-attached-to-${parent1.slug}`,
					type: 'link@1.0.0',
					version: '1.0.0',
					name: 'is attached to',
					data: {
						inverseName: 'has attached element',
						from: {
							id: contract2.id,
							type: contract2.type,
						},
						to: {
							id: parent1.id,
							type: parent1.type,
						},
					},
				},
			);

			const contract3 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						thread: false,
						count: 3,
						ref,
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `link-${contract3.slug}-is-attached-to-${parent2.slug}`,
					type: 'link@1.0.0',
					version: '1.0.0',
					name: 'is attached to',
					data: {
						inverseName: 'has attached element',
						from: {
							id: contract3.id,
							type: contract3.type,
						},
						to: {
							id: parent2.id,
							type: parent2.type,
						},
					},
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
			const parent = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const ownedContract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `link-${ownedContract.slug}-is-owned-by-${parent.slug}`,
					type: 'link@1.0.0',
					version: '1.0.0',
					name: 'is owned by',
					data: {
						inverseName: 'owns',
						from: {
							id: ownedContract.id,
							type: ownedContract.type,
						},
						to: {
							id: parent.id,
							type: parent.type,
						},
					},
				},
			);

			const attachedContract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `link-${attachedContract.slug}-is-attached-to-${parent.slug}`,
					type: 'link@1.0.0',
					version: '1.0.0',
					name: 'is attached to',
					data: {
						inverseName: 'has attached element',
						from: {
							id: attachedContract.id,
							type: attachedContract.type,
						},
						to: {
							id: parent.id,
							type: parent.type,
						},
					},
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
						id: attachedContract.id,
					},
				],
				owns: [
					{
						id: ownedContract.id,
					},
				],
			});
		});

		it('should be able to query $$links inside $$links', async () => {
			const parent = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const child = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const grandchild = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `link-${child.slug}-is-child-of-${parent.slug}`,
					type: 'link@1.0.0',
					version: '1.0.0',
					name: 'is child of',
					data: {
						inverseName: 'has child',
						from: {
							id: child.id,
							type: child.type,
						},
						to: {
							id: parent.id,
							type: parent.type,
						},
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `link-${grandchild.slug}-is-child-of-${child.slug}`,
					type: 'link@1.0.0',
					version: '1.0.0',
					name: 'is child of',
					data: {
						inverseName: 'has child',
						from: {
							id: grandchild.id,
							type: grandchild.type,
						},
						to: {
							id: child.id,
							type: child.type,
						},
					},
				},
			);

			const santa = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			for (const eternalChild of [parent, child, grandchild]) {
				await ctx.kernel.insertContract(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					{
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
					},
				);
			}

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
			const office = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const worker1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						isStressed: true,
					},
				},
			);

			const worker2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						isStressed: false,
					},
				},
			);

			const worker3 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
			const office = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const worker1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						isStressed: false,
					},
				},
			);

			const worker2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						isStressed: true,
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						isStressed: false,
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
			const office = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const worker1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						order: 0,
					},
				},
			);

			const worker2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						order: 1,
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
			const office = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const worker1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						stressedDays: [1, 3, 5],
					},
				},
			);

			const worker2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						stressedDays: [1, 2, 4],
					},
				},
			);

			const worker3 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
			const office = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const worker1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						stressedDays: [1, 3, 5],
					},
				},
			);

			const worker2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						stressedDays: [1, 'INVALID DAY', 4],
					},
				},
			);

			const worker3 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
			const office = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const worker1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const worker2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
			const office = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const worker1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						isStressed: true,
					},
				},
			);

			const worker2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						isStressed: false,
					},
				},
			);

			const worker3 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
			const office = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: testUtils.generateRandomSlug(),
					type: 'card@1.0.0',
					version: '1.0.0',
				},
			);

			const worker1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: testUtils.generateRandomSlug(),
					type: 'card@1.0.0',
					version: '1.0.0',
					data: {
						idx: 0,
						isWorking: true,
					},
				},
			);

			const worker2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						idx: 1,
						isWorking: true,
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
			const office = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			const worker1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						isStressed: true,
					},
				},
			);

			const worker2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						isStressed: false,
					},
				},
			);

			const worker3 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						isStressed: false,
					},
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
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
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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
			// Insert contracts to query for.
			const foo = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);
			const bar = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
				},
			);

			// Create scoped session for admin user.
			const adminSession = ctx.kernel.adminSession()!;
			assert(adminSession !== null);
			const scopedSession: AutumnDBSession = {
				...adminSession,
				scope: {
					type: 'object',
					properties: {
						slug: {
							type: 'string',
							const: foo.slug,
						},
					},
				},
			};

			// Query with both scoped and non-scoped sessions.
			const query: JsonSchema = {
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
				ctx.logContext,
				ctx.kernel.adminSession()!,
				query,
			);
			const scopedResults = await ctx.kernel.query(
				ctx.logContext,
				scopedSession,
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
			const contracts = [
				await ctx.kernel.insertContract(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					{
						type: 'card@1.0.0',
						version: '3.0.1',
						data: {
							foo: 1,
						},
					},
				),
				await ctx.kernel.insertContract(
					ctx.logContext,
					ctx.kernel.adminSession()!,
					{
						type: 'card@1.0.0',
						version: '3.0.2',
						data: {
							foo: 1,
						},
					},
				),
			];

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'object',
					additionalProperties: false,
					properties: {
						slug: {
							type: 'string',
						},
						version: {
							type: 'string',
							enum: [contracts[0].version, contracts[1].version],
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
					slug: contracts[0].slug,
					version: contracts[0].version,
				},
				{
					slug: contracts[1].slug,
					version: contracts[1].version,
				},
			]);
		});

		it('should be able to query root level string fields using full text search', async () => {
			const name = 'lorem ipsum dolor sit amet';
			const type = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'type@1.0.0',
					data: {
						schema: {
							type: 'object',
							properties: {
								name: {
									type: 'string',
									fullTextSearch: true,
								},
							},
						},
					},
				},
			);

			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: `${type.slug}@${type.version}`,
					name,
				},
			);
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: `${type.slug}@${type.version}`,
					name: 'foobar',
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'object',
					properties: {
						type: {
							type: 'string',
							const: `${type.slug}@${type.version}`,
						},
						name: {
							type: 'string',
							fullTextSearch: {
								// Reverse the term so its not an exact match
								term: name.split(' ').reverse().join(' '),
							},
						},
					},
				} as any,
			);

			expect(results).toHaveLength(1);
			expect(results[0].id).toBe(contract.id);
		});

		it('should be able to query root level array fields using full text search', async () => {
			const tag = 'lorem';
			const type = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'type@1.0.0',
					data: {
						schema: {
							type: 'object',
							properties: {
								tags: {
									type: 'array',
									fullTextSearch: true,
									items: {
										type: 'string',
									},
								},
							},
						},
					},
				},
			);

			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: `${type.slug}@${type.version}`,
					tags: [tag],
				},
			);
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: `${type.slug}@${type.version}`,
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'object',
					properties: {
						tags: {
							type: 'array',
							contains: {
								fullTextSearch: {
									term: tag,
								},
							},
						},
					},
					required: ['tags'],
				} as any,
			);

			expect(results).toHaveLength(1);
			expect(results[0].id).toBe(contract.id);
		});

		it('should be able to query nested string fields using full text search', async () => {
			const description = 'lorem ipsum dolor sit amet';
			const type = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'type@1.0.0',
					data: {
						schema: {
							type: 'object',
							properties: {
								data: {
									type: 'object',
									properties: {
										description: {
											fullTextSearch: true,
											type: 'string',
										},
									},
								},
							},
						},
					},
				},
			);

			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: `${type.slug}@${type.version}`,
					data: {
						description,
					},
				},
			);
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: `${type.slug}@${type.version}`,
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'object',
					required: ['data'],
					properties: {
						type: {
							type: 'string',
							const: `${type.slug}@${type.version}`,
						},
						data: {
							type: 'object',
							required: ['description'],
							properties: {
								description: {
									type: 'string',
									fullTextSearch: {
										// Reverse the term so its not an exact match
										term: description.split(' ').reverse().join(' '),
									},
								},
							},
						},
					},
				} as any,
			);

			expect(results).toHaveLength(1);
			expect(results[0].id).toBe(contract.id);
		});

		it('should be able to query nested array fields using full text search', async () => {
			const label = 'lorem';
			const type = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'type@1.0.0',
					data: {
						schema: {
							type: 'object',
							properties: {
								data: {
									type: 'object',
									properties: {
										labels: {
											type: 'array',
											fullTextSearch: true,
											items: {
												type: 'string',
											},
										},
									},
								},
							},
						},
					},
				},
			);

			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: `${type.slug}@${type.version}`,
					data: {
						labels: [label],
					},
				},
			);
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: `${type.slug}@${type.version}`,
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'object',
					properties: {
						type: {
							type: 'string',
							const: `${type.slug}@${type.version}`,
						},
						data: {
							type: 'object',
							required: ['labels'],
							properties: {
								labels: {
									type: 'array',
									contains: {
										fullTextSearch: {
											term: label,
										},
									},
								},
							},
						},
					},
					required: ['data'],
				} as any,
			);

			expect(results).toHaveLength(1);
			expect(results[0].id).toBe(contract.id);
		});

		it('should be able to query deeply nested string fields using full text search', async () => {
			const description = 'lorem ipsum dolor sit amet';
			const type = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'type@1.0.0',
					data: {
						schema: {
							type: 'object',
							properties: {
								data: {
									type: 'object',
									properties: {
										nested: {
											type: 'object',
											properties: {
												nested: {
													type: 'object',
													properties: {
														nested: {
															type: 'object',
															properties: {
																description: {
																	fullTextSearch: true,
																	type: 'string',
																},
															},
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			);

			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: `${type.slug}@${type.version}`,
					data: {
						nested: {
							nested: {
								nested: {
									description,
								},
							},
						},
					},
				},
			);
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: `${type.slug}@${type.version}`,
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'object',
					required: ['data'],
					properties: {
						type: {
							type: 'string',
							const: `${type.slug}@${type.version}`,
						},
						data: {
							type: 'object',
							required: ['nested'],
							properties: {
								nested: {
									type: 'object',
									required: ['nested'],
									properties: {
										nested: {
											type: 'object',
											required: ['nested'],
											properties: {
												nested: {
													type: 'object',
													required: ['description'],
													properties: {
														description: {
															type: 'string',
															fullTextSearch: {
																// Reverse the term so its not an exact match
																term: description
																	.split(' ')
																	.reverse()
																	.join(' '),
															},
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				} as any,
			);

			expect(results).toHaveLength(1);
			expect(results[0].id).toBe(contract.id);
		});

		it('should be able to query nested array fields inside oneOf using full text search', async () => {
			const type = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'type@1.0.0',
					data: {
						schema: {
							type: 'object',
							properties: {
								data: {
									type: 'object',
									properties: {
										labels: {
											oneOf: [
												{
													type: 'array',
													fullTextSearch: true,
													items: {
														type: 'string',
													},
												},
												{
													type: 'string',
													fullTextSearch: true,
												},
											],
										},
									},
								},
							},
						},
					},
				},
			);

			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: `${type.slug}@${type.version}`,
					data: {
						labels: ['lorem ipsum'],
					},
				},
			);
			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: `${type.slug}@${type.version}`,
					data: {
						labels: ['consecteur dis'],
					},
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'object',
					properties: {
						type: {
							type: 'string',
							const: `${type.slug}@${type.version}`,
						},
						data: {
							type: 'object',
							required: ['labels'],
							properties: {
								labels: {
									type: 'array',
									contains: {
										fullTextSearch: {
											term: 'lorem',
										},
									},
								},
							},
						},
					},
					required: ['data'],
				} as any,
			);

			expect(results).toHaveLength(1);
			expect(results[0].id).toBe(contract.id);
		});

		it('should return contract for users that satisfy markers', async () => {
			const org = await ctx.createOrg(testUtils.generateRandomId());
			const actor = await ctx.createUser(
				testUtils.generateRandomId(),
				testUtils.generateRandomId(),
			);
			await ctx.createLink(actor, org, 'is member of', 'has member');

			// org-wide markers
			let contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					markers: [org.slug],
				},
			);
			let results = await ctx.kernel.query(
				ctx.logContext,
				{ actor },
				{
					type: 'object',
					properties: {
						id: {
							type: 'string',
							const: contract.id,
						},
					},
					required: ['id'],
				},
			);
			expect(results).toEqual([contract]);

			// user-specific markers
			contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					markers: [actor.slug],
				},
			);
			results = await ctx.kernel.query(
				ctx.logContext,
				{ actor },
				{
					type: 'object',
					properties: {
						id: {
							type: 'string',
							const: contract.id,
						},
					},
					required: ['id'],
				},
			);
			expect(results).toEqual([contract]);

			// user+org markers
			contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					markers: [`${actor.slug}+${org.slug}`],
				},
			);
			results = await ctx.kernel.query(
				ctx.logContext,
				{ actor },
				{
					type: 'object',
					properties: {
						id: {
							type: 'string',
							const: contract.id,
						},
					},
					required: ['id'],
				},
			);
			expect(results).toEqual([contract]);
		});

		it('should return null for users that do not satisfy markers', async () => {
			const org = await ctx.createOrg(testUtils.generateRandomId());
			const actor = await ctx.createUser(
				testUtils.generateRandomId(),
				testUtils.generateRandomId(),
			);
			await ctx.createLink(actor, org, 'is member of', 'has member');

			const contract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					markers: ['user-admin'],
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				{ actor },
				{
					type: 'object',
					properties: {
						id: {
							type: 'string',
							const: contract.id,
						},
					},
					required: ['id'],
				},
			);
			expect(results).toEqual([]);
		});
	});

	describe('relationships', () => {
		test('instance should have list of known relationships', async () => {
			expect(ctx.kernel.relationships.length).toBeGreaterThan(0);
		});

		test('instance should be updated on new relationships', async () => {
			const relationship = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.session,
				{
					name: testUtils.generateRandomId(),
					type: 'relationship@1.0.0',
					slug: testUtils.generateRandomSlug({
						prefix: 'relationship',
					}),
					data: {
						inverseName: testUtils.generateRandomId(),
						title: testUtils.generateRandomId(),
						inverseTitle: testUtils.generateRandomId(),
						from: {
							type: 'org@1.0.0',
						},
						to: {
							type: 'card@1.0.0',
						},
					},
				},
			);
			assert(relationship);

			// Wait for the stream to update the kernel
			await ctx.retry(
				() => {
					return ctx.kernel.relationships.find((r) => r.id === relationship.id);
				},
				(contract: RelationshipContract) => {
					return contract !== undefined;
				},
			);
		});

		test('instance should be updated on soft-deleted relationship', async () => {
			const relationship = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.session,
				{
					name: testUtils.generateRandomId(),
					type: 'relationship@1.0.0',
					slug: testUtils.generateRandomSlug({
						prefix: 'relationship',
					}),
					data: {
						inverseName: testUtils.generateRandomId(),
						title: testUtils.generateRandomId(),
						inverseTitle: testUtils.generateRandomId(),
						from: {
							type: 'org@1.0.0',
						},
						to: {
							type: 'card@1.0.0',
						},
					},
				},
			);
			assert(relationship);

			// Wait for the stream to update the kernel
			await ctx.retry(
				() => {
					return ctx.kernel.relationships.find((r) => r.id === relationship.id);
				},
				(contract: RelationshipContract) => {
					return contract !== undefined;
				},
			);

			// Soft-delete the relationship
			await ctx.kernel.patchContractBySlug(
				ctx.logContext,
				ctx.session,
				`${relationship.slug}@${relationship.version}`,
				[
					{
						op: 'replace',
						path: '/active',
						value: false,
					},
				],
			);

			// Wait for the stream to update the kernel
			await ctx.retry(
				() => {
					return ctx.kernel.relationships.find((r) => r.id === relationship.id);
				},
				(contract: RelationshipContract) => {
					return contract === undefined;
				},
			);
		});

		test('instance should be updated on updated relationship', async () => {
			const relationship = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.session,
				{
					name: testUtils.generateRandomId(),
					type: 'relationship@1.0.0',
					slug: testUtils.generateRandomSlug({
						prefix: 'relationship',
					}),
					data: {
						inverseName: testUtils.generateRandomId(),
						title: testUtils.generateRandomId(),
						inverseTitle: testUtils.generateRandomId(),
						from: {
							type: 'org@1.0.0',
						},
						to: {
							type: 'card@1.0.0',
						},
						foo: 'bar',
					},
				},
			);
			assert(relationship);

			// Wait for the stream to update the kernel
			await ctx.retry(
				() => {
					return ctx.kernel.relationships.find((r) => r.id === relationship.id);
				},
				(contract: RelationshipContract) => {
					return contract !== undefined;
				},
			);

			// Update relationship data
			await ctx.kernel.patchContractBySlug(
				ctx.logContext,
				ctx.session,
				`${relationship.slug}@${relationship.version}`,
				[
					{
						op: 'replace',
						path: '/data/foo',
						value: 'buz',
					},
				],
			);

			// Wait for the stream to update the kernel
			await ctx.retry(
				() => {
					return ctx.kernel.relationships.find((r) => r.id === relationship.id);
				},
				(contract: RelationshipContract) => {
					return contract !== undefined && contract.data?.foo === 'buz';
				},
			);
		});
	});
});
