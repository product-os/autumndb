import { strict as assert } from 'assert';
import * as _ from 'lodash';
import { v4 as uuid } from 'uuid';
import { errors, testUtils } from '../../lib';

let ctx: testUtils.TestContext;

beforeAll(async () => {
	ctx = await testUtils.newContext();
});

afterAll(async () => {
	await testUtils.destroyContext(ctx);
});

describe('Kernel', () => {
	describe('.insertContract() links', () => {
		it('should be able to create a link between two valid contracts', async () => {
			const contract1 = await insertCardContract();

			const contract2 = await insertCardContract();

			await upsertRelationshipCardIsAttachedTo();

			const linkContract = await ctx.kernel.insertContract(
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

			const element = await ctx.kernel.getContractById(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				linkContract.id,
			);

			assert(element !== null);

			expect(element.data.from).not.toBe(element.data.to);
		});

		it('should be able to create a direction-less link between two valid contracts', async () => {
			const contract1 = await insertCardContract();
			const contract2 = await insertCardContract();
			await upsertRelationshipIsLinkedTo();

			const linkContract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `link-${contract1.slug}-is-linked-to-${contract2.slug}`,
					type: 'link@1.0.0',
					name: 'is linked to',
					data: {
						inverseName: 'is linked to',
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

			const element = await ctx.kernel.getContractById(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				linkContract.id,
			);
			assert(element !== null);
			expect(element.data.from).not.toBe(element.data.to);
			expect(element.name).toBe(element.data.inverseName);
		});

		it('should be able to create two different links between two valid contracts', async () => {
			const contract1 = await insertCardContract();

			const contract2 = await insertCardContract();

			await upsertRelationshipCardIsAttachedTo();

			const linkContract1 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `link-${contract1.slug}-is-linked-to-${contract2.slug}`,
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
							id: contract2.id,
							type: contract2.type,
						},
					},
				},
			);

			const linkContract2 = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `link-${contract1.slug}-is-attached-to-${contract2.slug}`,
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
							id: contract2.id,
							type: contract2.type,
						},
					},
				},
			);

			expect((linkContract1 as any).data.from.id).toBe(
				(linkContract2 as any).data.from.id,
			);
			expect((linkContract1 as any).data.to.id).toBe(
				(linkContract2 as any).data.to.id,
			);
		});

		it('should not add a link if not inserting a contract with a target', async () => {
			const contract1 = await insertCardContract();

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					type: 'card@1.0.0',
					data: {
						foo: contract1.id,
					},
				},
			);

			const results = await ctx.kernel.query(
				ctx.logContext,
				ctx.kernel.adminSession()!,
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

		it('should not be able to create a link between two valid contracts if there is no relationship between their types', async () => {
			const contract1 = await insertCardContract();

			const contract2 = await insertCardContract();

			await expect(
				ctx.kernel.insertContract(ctx.logContext, ctx.kernel.adminSession()!, {
					slug: `link-${contract1.slug}-is-xxx-invalid-xxx-to-${contract2.slug}`,
					type: 'link@1.0.0',
					name: 'is xxx-invalid-xxx to',
					data: {
						inverseName: 'has xxx-invalid-xxx element',
						from: {
							id: contract1.id,
							type: contract1.type,
						},
						to: {
							id: contract2.id,
							type: contract2.type,
						},
					},
				}),
			).rejects.toThrow(errors.JellyfishUnknownRelationship);
		});

		it('should be able to create a link between two valid contracts if there is a "to wildcard" type relationship', async () => {
			const contract1 = await insertCardContract();

			const contract2 = await insertCardContract();

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `relationship-card-is-xxx-card-to-wildcard-xxx-to-card`,
					type: 'relationship@1.0.0',
					name: 'is xxx-card-to-wildcard-xxx to',
					data: {
						inverseName: 'has xxx-card-to-wildcard-xxx element',
						title: 'Left',
						inverseTitle: 'Right',
						from: {
							type: 'card',
						},
						to: {
							type: '*',
						},
					},
				},
			);

			const linkContract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `link-${contract1.slug}-is-linked-to-${contract2.slug}`,
					type: 'link@1.0.0',
					version: '1.0.0',
					name: 'is xxx-card-to-wildcard-xxx to',
					data: {
						inverseName: 'has xxx-card-to-wildcard-xxx element',
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

			const element = await ctx.kernel.getContractById(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				linkContract.id,
			);

			assert(element !== null);
		});

		it('should be able to create a link between two valid contracts if there is a "from wildcard" type relationship', async () => {
			const contract1 = await insertCardContract();

			const contract2 = await insertCardContract();

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `relationship-card-is-xxx-wildcard-to-card-xxx-to-card`,
					type: 'relationship@1.0.0',
					name: 'is xxx-wildcard-to-card-xxx to',
					data: {
						inverseName: 'has xxx-wildcard-to-card-xxx element',
						title: 'Left',
						inverseTitle: 'Right',
						from: {
							type: '*',
						},
						to: {
							type: 'card',
						},
					},
				},
			);

			const linkContract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `link-${contract1.slug}-is-linked-to-${contract2.slug}`,
					type: 'link@1.0.0',
					version: '1.0.0',
					name: 'is xxx-wildcard-to-card-xxx to',
					data: {
						inverseName: 'has xxx-wildcard-to-card-xxx element',
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

			const element = await ctx.kernel.getContractById(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				linkContract.id,
			);

			assert(element !== null);
		});

		it('should be able to create a link between two valid contracts if there is a unversioned type relationship', async () => {
			const contract1 = await insertCardContract();

			const contract2 = await insertCardContract();

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `relationship-card-is-xxx-versioned-to-card-xxx-to-card`,
					type: 'relationship@1.0.0',
					name: 'is xxx-versioned-to-card-xxx to',
					data: {
						inverseName: 'has xxx-versioned-to-card-xxx element',
						title: 'Left',
						inverseTitle: 'Right',
						from: {
							type: 'card@1.0.0',
						},
						to: {
							type: 'card',
						},
					},
				},
			);

			const linkContract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `link-${contract1.slug}-is-linked-to-${contract2.slug}`,
					type: 'link@1.0.0',
					version: '1.0.0',
					name: 'is xxx-versioned-to-card-xxx to',
					data: {
						inverseName: 'has xxx-versioned-to-card-xxx element',
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

			const element = await ctx.kernel.getContractById(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				linkContract.id,
			);

			assert(element !== null);
		});

		it('should be able to create a link between two valid contracts with a relationship defined from inverseName to name', async () => {
			const contract1 = await insertCardContract();

			const contract2 = await insertCardContract();

			await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `relationship-card-is-xxx-forward-xxx-to-card`,
					type: 'relationship@1.0.0',
					name: 'is xxx-forward-xxx to',
					data: {
						inverseName: 'is xxx-reverse-xxx to',
						title: 'Left',
						inverseTitle: 'Right',
						from: {
							type: 'card',
						},
						to: {
							type: 'card',
						},
					},
				},
			);

			const linkContract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `link-${contract1.slug}-is-linked-to-${contract2.slug}`,
					type: 'link@1.0.0',
					version: '1.0.0',
					name: 'is xxx-reverse-xxx to',
					data: {
						inverseName: 'is xxx-forward-xxx to',
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

			const element = await ctx.kernel.getContractById(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				linkContract.id,
			);

			assert(element !== null);
		});

		it('should be able to create a link from a concrete type to the any type', async () => {
			const createContract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					id: uuid(),
					type: 'card@1.0.0',
				},
			);

			const supportThreadContract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					id: uuid(),
					type: 'card@1.0.0',
				},
			);

			const relationship = await ctx.kernel.replaceContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `relationship-card-forwards-to-any`,
					type: 'relationship@1.0.0',
					name: 'forwards to',
					data: {
						inverseName: 'is forwarded by',
						title: 'Card',
						inverseTitle: 'Destination',
						from: {
							type: 'card@1.0.0',
						},
						to: {
							type: '*',
						},
					},
				},
			);

			assert(createContract !== null);
			assert(supportThreadContract !== null);
			assert(relationship !== null);

			const linkContract = await ctx.kernel.insertContract(
				ctx.logContext,
				ctx.kernel.adminSession()!,
				{
					slug: `link-${createContract.slug}-forwards-to-${supportThreadContract.slug}`,
					type: 'link@1.0.0',
					version: '1.0.0',
					name: 'forwards to',
					data: {
						inverseName: 'is forwarded by',
						from: {
							id: createContract.id,
							type: createContract.type,
						},
						to: {
							id: supportThreadContract.id,
							type: supportThreadContract.type,
						},
					},
				},
			);
			assert(linkContract !== null);
		});
	});
});

async function insertCardContract() {
	return ctx.kernel.insertContract(ctx.logContext, ctx.kernel.adminSession()!, {
		type: 'card@1.0.0',
	});
}

async function upsertRelationshipCardIsAttachedTo() {
	return ctx.kernel.replaceContract(
		ctx.logContext,
		ctx.kernel.adminSession()!,
		{
			slug: `relationship-card-is-attached-to-card`,
			type: 'relationship@1.0.0',
			name: 'is attached to',
			data: {
				inverseName: 'has attached element',
				title: 'Attachment',
				inverseTitle: 'Container',
				from: {
					type: 'card@1.0.0',
				},
				to: {
					type: 'card@1.0.0',
				},
			},
		},
	);
}

async function upsertRelationshipIsLinkedTo() {
	return ctx.kernel.replaceContract(
		ctx.logContext,
		ctx.kernel.adminSession()!,
		{
			slug: `relationship-card-is-linked-to-card`,
			type: 'relationship@1.0.0',
			name: 'is linked to',
			data: {
				inverseName: 'is linked to',
				title: 'LeftCard',
				inverseTitle: 'RightCard',
				from: {
					type: 'card',
				},
				to: {
					type: 'card',
				},
			},
		},
	);
}
