/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import * as helpers from '../helpers';
import { version as packageVersion } from '../../../../package.json';

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
});
