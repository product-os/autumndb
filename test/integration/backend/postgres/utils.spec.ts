/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import * as helpers from '../helpers';
import * as cards from '../../../../lib/backend/postgres/cards';
import * as utils from '../../../../lib/backend/postgres/utils';

let ctx: helpers.BackendContext;

beforeAll(async () => {
	ctx = await helpers.before();
});

afterAll(() => {
	return helpers.after(ctx);
});

describe('utils', () => {
	describe('.createIndex()', () => {
		it('should create indexes', async () => {
			const name = `${ctx.generateRandomSlug().replace(/-/g, '_')}_idx`;
			await utils.createIndex(
				ctx.context,
				ctx.backend.connection!,
				cards.TABLE,
				name,
				'USING btree (updated_at)',
			);

			const index = await ctx.backend.connection!.one(
				`SELECT EXISTS (SELECT FROM pg_indexes WHERE indexname='${name}')`,
			);

			expect(index.exists).toBeTruthy();
		});
	});
});
