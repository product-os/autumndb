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
});
