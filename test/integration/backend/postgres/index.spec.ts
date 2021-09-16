/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import { defaultEnvironment as environment } from '@balena/jellyfish-environment';
import { v4 as uuid } from 'uuid';
import * as helpers from '../helpers';
import { version as packageVersion } from '../../../../package.json';
import { PostgresBackend } from '../../../../lib/backend/postgres';

let ctx: helpers.BackendContext;

beforeAll(async () => {
	ctx = await helpers.before();
});

afterAll(() => {
	return helpers.after(ctx);
});

describe('DB migrations', () => {
	// the helpers.before() call performs a call to .connect()
	describe('after .connect()', () => {
		it('should have run migrations and stored the version info', async () => {
			const { version, updated_at } = await ctx.backend.one(
				`SELECT id, version, updated_at FROM jf_db_migrations WHERE id=0`,
			);

			expect(version).toEqual(packageVersion);
			expect(new Date(updated_at).getTime()).toBeLessThan(new Date().getTime());
			const longestExpectedTestRun = 2 * 60 * 60 * 1000;
			expect(new Date(updated_at).getTime()).toBeGreaterThan(
				new Date().getTime() - longestExpectedTestRun,
			);
		});
	});

	describe('.connect()', () => {
		it('should safely handle multiple backend instances connecting to the same DB simultaneously', async () => {
			const dbName = `test_${uuid().replace(/-/g, '_')}`;
			const makeBackend = () => {
				const backend = new PostgresBackend(
					null,
					{},
					Object.assign({}, environment.database.options, {
						database: dbName,
					}),
				);
				return backend.connect({
					id: `CORE-DB-TEST-${uuid()}`,
				});
			};
			const result = await Promise.all([
				makeBackend(),
				makeBackend(),
				makeBackend(),
				makeBackend(),
				makeBackend(),
			]);

			expect(result.length).toBeTruthy();
		});
	});

	describe('.createTypeIndex()', () => {
		it('should safely multiple backend instances creating the same index simultaneously', async () => {
			const dbName = `test_${uuid().replace(/-/g, '_')}`;
			const fields = ['data.status'];
			const contract = {
				type: 'type@1.0.0',
				slug: 'test',
				data: {
					schema: {
						properties: {
							data: {
								type: 'object',
								required: ['status'],
								properties: {
									status: {
										type: 'string',
										enum: ['open', 'closed'],
									},
								},
							},
						},
						required: ['data'],
					},
					indexed_fields: [fields],
				},
			};

			const makeBackend = async () => {
				const backend = new PostgresBackend(
					null,
					{},
					Object.assign({}, environment.database.options, {
						database: dbName,
					}),
				);
				await backend.connect({
					id: `CORE-DB-TEST-${uuid()}`,
				});

				return backend;
			};

			const be1 = await makeBackend();
			const be2 = await makeBackend();
			const be3 = await makeBackend();
			const be4 = await makeBackend();
			const be5 = await makeBackend();

			const result = await Promise.all([
				be1.createTypeIndex(ctx.context, fields, contract),
				be2.createTypeIndex(ctx.context, fields, contract),
				be3.createTypeIndex(ctx.context, fields, contract),
				be4.createTypeIndex(ctx.context, fields, contract),
				be5.createTypeIndex(ctx.context, fields, contract),
			]);

			expect(result.length).toBeTruthy();
		});
	});

	describe('.createFullTextSearchIndex()', () => {
		it('should safely multiple backend instances creating the same index simultaneously', async () => {
			const dbName = `test_${uuid().replace(/-/g, '_')}`;
			const type = 'test@1.0.0';
			const fields = [
				{
					path: ['name'],
					isArray: false,
				},
			];

			const makeBackend = async () => {
				const backend = new PostgresBackend(
					null,
					{},
					Object.assign({}, environment.database.options, {
						database: dbName,
					}),
				);
				await backend.connect({
					id: `CORE-DB-TEST-${uuid()}`,
				});

				return backend;
			};

			const be1 = await makeBackend();
			const be2 = await makeBackend();
			const be3 = await makeBackend();
			const be4 = await makeBackend();
			const be5 = await makeBackend();

			const result = await Promise.all([
				be1.createFullTextSearchIndex(ctx.context, type, fields),
				be2.createFullTextSearchIndex(ctx.context, type, fields),
				be3.createFullTextSearchIndex(ctx.context, type, fields),
				be4.createFullTextSearchIndex(ctx.context, type, fields),
				be5.createFullTextSearchIndex(ctx.context, type, fields),
			]);

			expect(result.length).toBeTruthy();
		});
	});
});
