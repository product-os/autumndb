import { testUtils } from '../../../lib';

let ctx: testUtils.TestContext;

beforeAll(async () => {
	ctx = await testUtils.newContext();
});

afterAll(async () => {
	await testUtils.destroyContext(ctx);
});

describe('Cache', () => {
	describe('.set()', () => {
		it('should be able to retrieve item by id', async () => {
			const element1 = {
				id: '4a962ad9-20b5-4dd8-a707-bf819593cc84',
				version: '1.0.0',
				slug: 'test',
			};

			await ctx.kernel.backend.cache!.set('test', element1 as any);

			const el: any = await ctx.kernel.backend.cache!.getById(
				'test',
				element1.id,
			);

			expect(element1).toEqual(el.element);
		});

		it('should be able to retrieve item by slug', async () => {
			const element1 = {
				id: '4a962ad9-20b5-4dd8-a707-bf819593cc84',
				version: '1.0.0',
				slug: 'test',
			};

			await ctx.kernel.backend.cache!.set('test', element1 as any);

			const el: any = await ctx.kernel.backend.cache!.getBySlug(
				'test',
				element1.slug,
				element1.version,
			);

			expect(element1).toEqual(el.element);
		});

		it('should not be able to retrieve item by slug given the wrong version', async () => {
			const element1 = {
				id: '4a962ad9-20b5-4dd8-a707-bf819593cc84',
				version: '1.0.0',
				slug: 'test',
			};

			await ctx.kernel.backend.cache!.set('test', element1 as any);

			const el: any = await ctx.kernel.backend.cache!.getBySlug(
				'test',
				element1.slug,
				'2.0.0',
			);

			expect(el.hit).toBeFalsy();
			expect(el.element).toBeFalsy();
		});
	});

	describe('.setMissingId()', () => {
		it('should prevent card from being fetched by ID', async () => {
			const element1 = {
				id: '4a962ad9-20b5-4dd8-a707-bf819593cc84',
				version: '1.0.0',
				slug: 'test',
			};

			await ctx.kernel.backend.cache!.set('test', element1 as any);
			await ctx.kernel.backend.cache!.setMissingId('test', element1.id);
			const el: any = await ctx.kernel.backend.cache!.getById(
				'test',
				element1.id,
			);

			expect(el.hit).toBeTruthy();
			expect(el.element).toBeFalsy();
		});
	});

	describe('.setMissingSlug()', () => {
		it('should prevent card from being fetched by slug', async () => {
			const element1 = {
				id: '4a962ad9-20b5-4dd8-a707-bf819593cc84',
				version: '1.0.0',
				slug: 'test',
			};

			await ctx.kernel.backend.cache!.set('test', element1 as any);
			await ctx.kernel.backend.cache!.setMissingSlug(
				'test',
				element1.slug,
				element1.version,
			);
			const el: any = await ctx.kernel.backend.cache!.getBySlug(
				'test',
				element1.slug,
				element1.version,
			);

			expect(el.hit).toBeTruthy();
			expect(el.element).toBeFalsy();
		});

		it('should not prevent other versions from being fetched by slug', async () => {
			const element1 = {
				id: '4a962ad9-20b5-4dd8-a707-bf819593cc84',
				version: '1.0.0',
				slug: 'test',
			};

			const element2 = {
				id: '9af7cf33-1a29-4f0c-a73b-f6a2b149850c',
				version: '1.0.1',
				slug: 'test',
			};

			await ctx.kernel.backend.cache!.set('test', element1 as any);
			await ctx.kernel.backend.cache!.set('test', element2 as any);
			await ctx.kernel.backend.cache!.setMissingSlug(
				'test',
				element1.slug,
				element1.version,
			);

			const result1: any = await ctx.kernel.backend.cache!.getBySlug(
				'test',
				element2.slug,
				element2.version,
			);
			expect(result1.hit).toBeTruthy();
			expect(result1.element).toEqual(element2);

			const result2: any = await ctx.kernel.backend.cache!.getBySlug(
				'test',
				element1.slug,
				element1.version,
			);
			expect(result2.hit).toBeTruthy();
			expect(result2.element).toBeFalsy();
		});
	});

	describe('.getById()', () => {
		it('should get the correct element', async () => {
			const element1 = {
				id: '4a962ad9-20b5-4dd8-a707-bf819593cc84',
				version: '1.0.0',
				slug: 'test1',
			};

			const element2 = {
				id: '5a962ad9-20b5-4dd8-a707-bf819593cc84',
				version: '1.0.0',
				slug: 'test2',
			};

			await ctx.kernel.backend.cache!.set('test', element1 as any);
			await ctx.kernel.backend.cache!.set('test', element2 as any);

			const el1: any = await ctx.kernel.backend.cache!.getById(
				'test',
				element1.id,
			);
			const el2: any = await ctx.kernel.backend.cache!.getById(
				'test',
				element2.id,
			);

			expect(element1).toEqual(el1.element);
			expect(element2).toEqual(el2.element);
		});
	});

	describe('.getBySlug()', () => {
		it('should get the correct element', async () => {
			const element1 = {
				id: '4a962ad9-20b5-4dd8-a707-bf819593cc84',
				version: '1.0.0',
				slug: 'test1',
			};

			const element2 = {
				id: '5a962ad9-20b5-4dd8-a707-bf819593cc84',
				version: '1.0.0',
				slug: 'test2',
			};

			await ctx.kernel.backend.cache!.set('test', element1 as any);
			await ctx.kernel.backend.cache!.set('test', element2 as any);

			const el1: any = await ctx.kernel.backend.cache!.getBySlug(
				'test',
				element1.slug,
				element1.version,
			);
			const el2: any = await ctx.kernel.backend.cache!.getBySlug(
				'test',
				element2.slug,
				element2.version,
			);

			expect(element1).toEqual(el1.element);
			expect(element2).toEqual(el2.element);
		});
	});

	describe('.unset()', () => {
		it('should remove an element from the cache', async () => {
			const element1 = {
				id: '4a962ad9-20b5-4dd8-a707-bf819593cc84',
				version: '1.0.0',
				slug: 'test1',
			};

			const element2 = {
				id: '5a962ad9-20b5-4dd8-a707-bf819593cc84',
				version: '1.0.0',
				slug: 'test2',
			};

			await ctx.kernel.backend.cache!.set('test', element1 as any);
			await ctx.kernel.backend.cache!.set('test', element2 as any);

			await ctx.kernel.backend.cache!.unset(element1 as any);
			const el1: any = await ctx.kernel.backend.cache!.getBySlug(
				'test',
				element1.slug,
				element1.version,
			);
			const el2: any = await ctx.kernel.backend.cache!.getBySlug(
				'test',
				element2.slug,
				element2.version,
			);

			expect(el1.element).toBeUndefined();
			expect(element2).toEqual(el2.element);
		});
	});
});
