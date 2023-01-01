import { defaultEnvironment as environment } from '@balena/jellyfish-environment';
import { randomUUID } from 'node:crypto';
import { INDEX_TABLE, PostgresBackend } from '../../../../lib/backend/postgres';
import { Context } from '../../../../lib/context';
import { TABLE as CONTRACTS_TABLE } from '../../../../lib/backend/postgres/cards';
import { version as packageVersion } from '../../../../package.json';
import * as helpers from '../helpers';

let ctx: helpers.BackendContext;

beforeAll(async () => {
	ctx = await helpers.before();
});

afterAll(() => {
	return helpers.after(ctx);
});

describe('Setup', () => {
	// the helpers.before() call performs a call to .connect()
	describe('after .connect()', () => {
		it('should have run migrations and stored the version info', async () => {
			const { version, updated_at } = await ctx.context.queryOne(
				`SELECT id, version, updated_at FROM jf_db_migrations WHERE id=0`,
			);

			expect(version).toEqual(packageVersion);
			expect(new Date(updated_at).getTime()).toBeLessThan(new Date().getTime());
			const longestExpectedTestRun = 2 * 60 * 60 * 1000;
			expect(new Date(updated_at).getTime()).toBeGreaterThan(
				new Date().getTime() - longestExpectedTestRun,
			);
		});

		it('index state table should exist and be populated', async () => {
			const { count } = await ctx.context.queryOne(
				`SELECT count(index_name) FROM ${INDEX_TABLE}`,
			);
			expect(parseInt(count, 10)).toBeGreaterThan(0);
		});
	});

	describe('.connect()', () => {
		it('should safely handle multiple backend instances connecting to the same DB simultaneously', async () => {
			const dbName = `test_${randomUUID().replace(/-/g, '_')}`;
			const makeBackend = () => {
				const backend = new PostgresBackend(
					null,
					Object.assign({}, environment.database.options, {
						databaseName: dbName,
					}),
				);
				return backend.connect(
					new Context({ id: `CORE-DB-TEST-${randomUUID()}` }),
				);
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
			const dbName = `test_${randomUUID().replace(/-/g, '_')}`;
			const fields = ['data.status'];
			const contract = {
				type: 'type@1.0.0',
				slug: 'test',
				version: '1.0.0',
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
					Object.assign({}, environment.database.options, {
						database: dbName,
					}),
				);
				await backend.connect(
					new Context({ id: `CORE-DB-TEST-${randomUUID()}` }),
				);

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
			const dbName = `test_${randomUUID().replace(/-/g, '_')}`;
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
					Object.assign({}, environment.database.options, {
						database: dbName,
					}),
				);
				await backend.connect(
					new Context({ id: `CORE-DB-TEST-${randomUUID()}` }),
				);

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

describe('.createIndex()', () => {
	it('should create an index', async () => {
		const tableName = 'cards';
		const indexName = `foobar_${randomUUID().split('-')[0]}_idx`;
		const predicate = 'USING btree (loop)';
		const version = '1.0.0';
		await ctx.backend.createIndex(
			ctx.context,
			tableName,
			indexName,
			version,
			predicate,
		);

		// Check that the index exists.
		expect(
			await ctx.context.queryOne(
				`
				SELECT indexdef
				FROM pg_indexes
				WHERE tablename=$1 AND indexname=$2
				`,
				[tableName, indexName],
			),
		).toEqual({
			indexdef: `CREATE INDEX ${indexName} ON public.${tableName} ${predicate}`,
		});

		const res = await ctx.context.queryOne(
			`
			SELECT table_name, sql, version
			FROM ${INDEX_TABLE}
			WHERE index_name=$1
			`,
			[indexName],
		);
		res.sql = res.sql.replaceAll(/\s+/g, ' ').trim();
		expect(res).toEqual({
			table_name: tableName,
			sql: `CREATE INDEX IF NOT EXISTS "${indexName}" ON ${tableName} ${predicate}`,
			version,
		});
	});

	it('should create indexes with unique flag', async () => {
		const tableName = CONTRACTS_TABLE;
		const indexName = `foobar_${randomUUID().split('-')[0]}_idx`;
		const predicate = 'USING btree (loop)';
		const version = '1.0.0';
		await ctx.backend.createIndex(
			ctx.context,
			tableName,
			indexName,
			version,
			predicate,
			'',
			true,
		);

		// Check that the index exists.
		expect(
			await ctx.context.queryOne(
				`
				SELECT indexdef
				FROM pg_indexes
				WHERE tablename=$1 AND indexname=$2
				`,
				[tableName, indexName],
			),
		).toEqual({
			indexdef: `CREATE UNIQUE INDEX ${indexName} ON public.${tableName} ${predicate}`,
		});

		const res = await ctx.context.queryOne(
			`
			SELECT table_name, sql, version
			FROM ${INDEX_TABLE}
			WHERE index_name=$1
			`,
			[indexName],
		);
		res.sql = res.sql.replaceAll(/\s+/g, ' ').trim();
		expect(res).toEqual({
			table_name: tableName,
			sql: `CREATE UNIQUE INDEX IF NOT EXISTS "${indexName}" ON ${tableName} ${predicate}`,
			version,
		});
	});
});
