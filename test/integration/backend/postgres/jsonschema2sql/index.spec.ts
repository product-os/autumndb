import { defaultEnvironment as environment } from '@balena/jellyfish-environment';

import * as _ from 'lodash';
import jsonSchemaTestSuite = require('@json-schema-org/tests');
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresBackend } from '../../../../../lib/backend/postgres';
import * as cards from '../../../../../lib/backend/postgres/cards';
import * as jsonschema2sql from '../../../../../lib/backend/postgres/jsonschema2sql';
import * as links from '../../../../../lib/backend/postgres/links';
import type { DatabaseBackend } from '../../../../../lib/backend/postgres/types';
import { Context } from '../../../../../lib/context';
import type { Contract, JsonSchema } from '../../../../../lib/types';
import regexpTestSuite from './regexp';
import formatMaxMinTestSuite from './format-max-min';

const IS_POSTGRES = environment.database.type === 'postgres';

let ctx: {
	context: Context;
	database: string;
	backend: DatabaseBackend;
};

/*
 * List of JSON Schema keywords we support
 */
const SUPPORTED_KEYWORDS = [
	'additionalProperties',
	'allOf',
	'anyOf',
	'const',
	'contains',
	'description',
	'else',
	'enum',
	'examples',
	'exclusiveMaximum',
	'exclusiveMinimum',
	'format',
	'if',
	'items',
	'maximum',
	'maxItems',
	'maxLength',
	'maxProperties',
	'minimum',
	'minItems',
	'minLength',
	'minProperties',
	'multipleOf',
	'not',
	'oneOf',
	'pattern',
	'properties',
	'required',
	'then',
	'title',
	'type',
];

/*
 * List of values for the `format` keyword we support
 */
const SUPPORTED_FORMATS = [
	'date-time',
	'email',
	'hostname',
	'ipv4',
	'ipv6',
	'json-pointer',
	'uri-reference',
	'uri-template',
	'uri',
	'uuid',

	// The format we accept for these is different from the standard
	// 'date',
	// 'time',
];

/*
 * List of specific test cases to skip.
 */
const UNSUPPORTED_TEST_CASES: { [key: string]: [string] } = {
	// We'd have to parse and fixup regexes in the compiler to pass these
	'ECMA 262 \\w matches ascii letters only': [
		'latin-1 e-acute does not match (unlike e.g. Python)',
	],
	'ECMA 262 \\w matches everything but ascii letters': [
		'latin-1 e-acute matches (unlike e.g. Python)',
	],
};

interface RunnerOptions {
	context: Context;
	backend: (typeof ctx)['backend'];
	database: (typeof ctx)['database'];
	elements: Array<Partial<Contract>>;
	schema: JsonSchema;
	table: string;
	options?: {
		sortBy?: string[] | string;
		sortDir?: 'asc' | 'desc';
	};
}

const runner = async ({
	context,
	backend,
	database,
	elements,
	options,
	schema,
	table,
}: RunnerOptions) => {
	/*
	 * 1. Create the necessary tables for the test.
	 */
	await cards.setup(context, backend, { table });
	await links.setup(context, backend, database, {
		cards: table,
	});

	/*
	 * 2. Insert the elements we will try to query.
	 */
	for (const item of elements) {
		await cards.upsert(
			context,
			{
				slug: item.slug || `test-${randomUUID()}`,
				type: item.type,
				active: _.isBoolean(item.active) ? item.active : true,
				version: item.version || '1.0.0',
				name: item.name,
				tags: item.tags || [],
				markers: item.markers || [],
				linked_at: item.linked_at || {},
				created_at: item.created_at || new Date().toISOString(),
				links: item.links || {},
				requires: item.requires || [],
				capabilities: item.capabilities || [],
				data: item.data || {},
			} as Contract,
			{
				table,
			},
		);
	}

	/*
	 * 3. Build the query using our translator.
	 */
	const query = jsonschema2sql.compile(context, table, {}, schema, {
		limit: 1000,
		...options,
	});

	/*
	 * 4. Return the results.
	 */
	const results = await context.query(query);

	return results.map((wrapper: { payload: any }) => {
		return wrapper.payload;
	});
};

const isSupportedSchema = (schema: object | boolean): boolean => {
	if (typeof schema === 'boolean') {
		return true;
	}

	for (const [key, value] of Object.entries(schema)) {
		if (!SUPPORTED_KEYWORDS.includes(key)) {
			return false;
		}

		if (
			key !== 'const' &&
			typeof value === 'object' &&
			!isSupportedSchema(value)
		) {
			return false;
		}

		if (key === 'format' && !SUPPORTED_FORMATS.includes(value)) {
			return false;
		}

		if (key === 'additionalProperties' && typeof value === 'object') {
			return false;
		}

		if (['allOf', 'anyOf', 'oneOf'].includes(key)) {
			for (const branch of value) {
				if (!isSupportedSchema(branch)) {
					return false;
				}
			}
		}
	}

	return true;
};

beforeAll(async () => {
	if (!IS_POSTGRES) {
		return;
	}

	/*
	 * Create a randomly generated database name where all the
	 * test tables will be scoped. This ensures that can repeately
	 * run the test suite without conflicts.
	 */
	const database = `test_${randomUUID().replace(/-/g, '')}`;

	/*
	 * Connect to the default postgres database and use that
	 * connection to create the randomly generated database.
	 */
	await new Pool({
		user: environment.postgres.user,
		password: environment.postgres.password,
		database: 'postgres',
		host: environment.postgres.host,
		// TS-TODO: fix this cast
		port: environment.postgres.port as any,
	}).query(`
		CREATE DATABASE ${database} OWNER = ${environment.postgres.user};
	`);

	/*
	 * Now that the auto-generated database is created, we
	 * can connect to it, and store the connection in the context
	 * so we can use it for queries and insertions.
	 */
	const backend = new PostgresBackend(null, {
		user: environment.postgres.user,
		database,
		password: environment.postgres.password,
		host: environment.postgres.host,
		port: environment.postgres.port,
	});
	const context = new Context({ id: 'jsonschema2sql-test' }, backend);
	await backend.connect(context);

	ctx = {
		context,
		database,
		backend,
	};
});

/*
 * Load the standard set of draft7 tests
 */
const testSuites = jsonSchemaTestSuite.draft7();

/*
 * Add a test suite for the non-standard key word "regexp" that is used by the
 * client for doing case insensitive pattern matching.
 * see: https://github.com/epoberezkin/ajv-keywords#regexp
 */
testSuites.push(regexpTestSuite as any);

/*
 * Add a test suite for the non-standard key words "formatMaximum" and
 * "formatMinimum" that are used by the client for query against dates
 * see: https://github.com/epoberezkin/ajv-keywords#formatmaximum--formatminimum-and-formatexclusivemaximum--formatexclusiveminimum
 */
testSuites.push(formatMaxMinTestSuite as any);

describe('jsonschema2sql: JSON Schema compatibility', () => {
	/*
	 * The JSON Schema tests are divided in suites, where
	 * each of them corresponds to a JSON Schema keyword.
	 */
	for (const suite of testSuites) {
		describe(suite.name, () => {
			/*
			 * Each suite is then divided in scenarios, which
			 * describe an object, along with a series of schemas
			 * that may or may not match the object.
			 */
			for (const scenario of suite.schemas) {
				/*
				 * Skip the scenario if the schema contains keywords or values
				 * that are not currently supported.
				 */
				const scenarioIsSupported = isSupportedSchema(scenario.schema);

				/*
				 * Each test case in an scenario contains a boolean
				 * flag to determine whether it should match or
				 * not the scenario's object.
				 */
				for (const testCase of scenario.tests) {
					/*
					 * We will execute each test case in a different
					 * table.
					 */
					const table = [
						suite.name,
						suite.schemas.indexOf(scenario),
						scenario.tests.indexOf(testCase),
					]
						.join('_')
						.replace(/[^0-9a-z_]/gi, '');

					/*
					 * A readable title for the Ava test case
					 */
					const title = [
						`${table}:`,
						scenario.description,
						'-',
						testCase.description,
					].join(' ');

					/*
					 * Skip this test case if we don't support that test suite.
					 * We could have omitted it from the suites list in the
					 * first place, but this is a nice way to measure how far
					 * we are from supporting the whole set of tests.
					 */
					const testCaseIsSupported = !UNSUPPORTED_TEST_CASES[
						scenario.description
					]?.includes(testCase.description);
					const autotestFn =
						testCaseIsSupported && scenarioIsSupported && IS_POSTGRES
							? test
							: test.skip;

					/*
					 * Run the test without any modification. We will insert
					 * the scenario object, query it back with the test case
					 * schema, and we expect to get a result of the schema
					 * is expected to match.
					 */
					if (_.isPlainObject(testCase.data)) {
						autotestFn(`${title} [Normal]`, async () => {
							const results = await runner({
								context: ctx.context,
								backend: ctx.backend,
								database: ctx.database,
								table: table.toLowerCase(),
								elements: [
									{
										version: '1.0.0',
										type: 'contract',
										data: testCase.data,
									},
								],
								schema: {
									type: 'object',
									required: ['id', 'data'],
									properties: {
										id: {
											type: 'string',
										},
										data: scenario.schema,
									},
								},
							});

							expect(results.length === 1).toBe(testCase.valid);

							if (testCase.valid) {
								expect(results[0].data).toEqual(testCase.data);
							}
						});
					}

					/*
					 * Pretty much the same as before, but wrap the scenario
					 * object into another object and wrap the schema
					 * accordingly.
					 */
					autotestFn(`${title} [Nested object]`, async () => {
						const results = await runner({
							context: ctx.context,
							backend: ctx.backend,
							database: ctx.database,
							table: `NESTED_${table}`.toLowerCase(),
							elements: [
								{
									version: '1.0.0',
									type: 'contract',
									data: {
										wrapper: testCase.data,
									},
								},
							],
							schema: {
								type: 'object',
								required: ['id', 'data'],
								properties: {
									id: {
										type: 'string',
									},
									data: {
										type: 'object',
										required: ['wrapper'],
										properties: {
											wrapper: scenario.schema,
										},
									},
								},
							},
						});

						expect(results.length === 1).toBe(testCase.valid);
						if (testCase.valid) {
							expect(results[0].data).toEqual({
								wrapper: testCase.data,
							});
						}
					});
				}
			}
		});
	}
});

/*
 * Some extra tests not covered by the official JSON Schema test suite, focused on
 * database specific checks.
 */

const testFn = IS_POSTGRES ? test : test.skip;

describe('jsonschema2sql: Postgres specific', () => {
	describe('injection', () => {
		testFn('should escape malicious query keys', async () => {
			const table = 'malicious_queries_0';

			const schema: JsonSchema = {
				type: 'object',
				required: ['id', 'data'],
				properties: {
					id: {
						type: 'string',
					},
					data: {
						type: 'object',
						required: [`Robert'); DROP TABLE ${cards.TABLE}; --`],
						properties: {
							[`Robert'); DROP TABLE ${cards.TABLE}; --`]: {
								type: 'object',
								properties: {
									[`Robert'); DROP TABLE ${cards.TABLE}; --`]: {
										type: 'string',
										const: 'foo',
									},
								},
							},
						},
					},
				},
			};

			const elements = [
				{
					version: '1.0.0',
					type: 'contract',
					data: {
						[`Robert'); DROP TABLE ${cards.TABLE}; --`]: {
							[`Robert'); DROP TABLE ${cards.TABLE}; --`]: 'foo',
						},
					},
				},
			];

			const results = await runner({
				context: ctx.context,
				backend: ctx.backend,
				database: ctx.database,
				table,
				elements,
				schema,
			});

			expect(results).toHaveLength(1);
		});

		testFn('should escape malicious query values', async () => {
			const table = 'malicious_queries_1';

			const schema: JsonSchema = {
				type: 'object',
				required: ['id', 'data'],
				properties: {
					id: {
						type: 'string',
					},
					data: {
						type: 'object',
						required: ['foo'],
						properties: {
							foo: {
								type: 'string',
								const: `Robert'); DROP TABLE ${cards.TABLE}; --`,
							},
						},
					},
				},
			};

			const elements = [
				{
					version: '1.0.0',
					type: 'contract',
					data: {
						foo: `Robert'); DROP TABLE ${cards.TABLE}; --`,
					},
				},
			];

			const results = await runner({
				context: ctx.context,
				backend: ctx.backend,
				database: ctx.database,
				table,
				elements,
				schema,
			});

			expect(results).toHaveLength(1);
		});
	});

	describe('order', () => {
		testFn(
			'should sort values in ascending order by default when specifying "sortBy"',
			async () => {
				const table = 'order_0';

				const schema: JsonSchema = {
					type: 'object',
					properties: {
						slug: {
							type: 'string',
						},
						data: {
							type: 'object',
							required: ['foo'],
							properties: {
								foo: {
									type: 'number',
									const: 1,
								},
							},
						},
					},
					required: ['slug', 'data'],
				};

				const elements = [
					{
						slug: 'beta',
						version: '1.0.0',
						type: 'contract',
						data: {
							foo: 1,
							timestamp: 1549016200000,
						},
					},
					{
						slug: 'gamma',
						version: '1.0.0',
						type: 'contract',
						data: {
							foo: 1,
							timestamp: 1549016300000,
						},
					},
					{
						slug: 'alpha',
						version: '1.0.0',
						type: 'contract',
						data: {
							foo: 1,
							timestamp: 1549016100000,
						},
					},
				];

				const results = await runner({
					context: ctx.context,
					backend: ctx.backend,
					database: ctx.database,
					table,
					elements,
					schema,
					options: {
						sortBy: ['data', 'timestamp'],
					},
				});

				expect(
					_.map(results, (item) => {
						return _.pick(item, ['slug', 'data']);
					}),
				).toEqual([
					_.pick(elements[2], ['slug', 'data']),
					_.pick(elements[0], ['slug', 'data']),
					_.pick(elements[1], ['slug', 'data']),
				]);
			},
		);

		testFn('should be able to sort values in descending order', async () => {
			const table = 'order_1';

			const schema: JsonSchema = {
				type: 'object',
				properties: {
					slug: {
						type: 'string',
					},
					data: {
						type: 'object',
						required: ['foo'],
						properties: {
							foo: {
								type: 'number',
								const: 1,
							},
						},
					},
				},
				required: ['slug', 'data'],
			};

			const elements = [
				{
					slug: 'beta',
					version: '1.0.0',
					type: 'contract',
					data: {
						foo: 1,
						timestamp: 1549016200000,
					},
				},
				{
					slug: 'gamma',
					version: '1.0.0',
					type: 'contract',
					data: {
						foo: 1,
						timestamp: 1549016300000,
					},
				},
				{
					slug: 'alpha',
					version: '1.0.0',
					type: 'contract',
					data: {
						foo: 1,
						timestamp: 1549016100000,
					},
				},
			];

			const results = await runner({
				context: ctx.context,
				backend: ctx.backend,
				database: ctx.database,
				table,
				elements,
				schema,
				options: {
					sortBy: ['data', 'timestamp'],
					sortDir: 'desc',
				},
			});

			expect(
				_.map(results, (item) => {
					return _.pick(item, ['slug', 'data']);
				}),
			).toEqual([
				_.pick(elements[1], ['slug', 'data']),
				_.pick(elements[0], ['slug', 'data']),
				_.pick(elements[2], ['slug', 'data']),
			]);
		});

		testFn(
			'should be able to sort values by a single string value',
			async () => {
				const table = 'order_2';

				const schema: JsonSchema = {
					type: 'object',
					properties: {
						slug: {
							type: 'string',
						},
						data: {
							type: 'object',
							required: ['foo'],
							properties: {
								foo: {
									type: 'number',
									const: 1,
								},
							},
						},
					},
					required: ['slug', 'data'],
				};

				const elements = [
					{
						slug: 'beta',
						version: '1.0.0',
						type: 'contract',
						data: {
							foo: 1,
							timestamp: 1549016200000,
						},
					},
					{
						slug: 'gamma',
						version: '1.0.0',
						type: 'contract',
						data: {
							foo: 1,
							timestamp: 1549016300000,
						},
					},
					{
						slug: 'alpha',
						version: '1.0.0',
						type: 'contract',
						data: {
							foo: 1,
							timestamp: 1549016100000,
						},
					},
				];

				const results = await runner({
					context: ctx.context,
					backend: ctx.backend,
					database: ctx.database,
					table,
					elements,
					schema,
					options: {
						sortBy: 'slug',
					},
				});

				expect(
					_.map(results, (item) => {
						return _.pick(item, ['slug', 'data']);
					}),
				).toEqual([
					_.pick(elements[2], ['slug', 'data']),
					_.pick(elements[0], ['slug', 'data']),
					_.pick(elements[1], ['slug', 'data']),
				]);
			},
		);

		testFn('should be able to sort by version (asc)', async () => {
			const table = 'order_3';

			const schema: JsonSchema = {
				type: 'object',
				properties: {
					slug: {
						type: 'string',
					},
					data: {
						type: 'object',
						required: ['bar'],
						properties: {
							bar: {
								type: 'number',
								const: 1,
							},
						},
					},
				},
				required: ['slug', 'data'],
			};

			const elements = [
				{
					slug: `contract-${randomUUID()}`,
					version: '1.0.0-beta',
					type: 'contract',
					data: {
						bar: 1,
					},
				},
				{
					slug: `contract-${randomUUID()}`,
					version: '1.0.0',
					type: 'contract',
					data: {
						bar: 1,
					},
				},
				{
					slug: `contract-${randomUUID()}`,
					version: '1.0.0-alpha+001',
					type: 'contract',
					data: {
						bar: 1,
					},
				},
				{
					slug: `contract-${randomUUID()}`,
					version: '1.0.0-beta+001',
					type: 'contract',
					data: {
						bar: 1,
					},
				},
				{
					slug: `contract-${randomUUID()}`,
					version: '1.0.1',
					type: 'contract',
					data: {
						bar: 1,
					},
				},
				{
					slug: `contract-${randomUUID()}`,
					version: '1.1.0',
					type: 'contract',
					data: {
						bar: 1,
					},
				},
			];

			const results = await runner({
				context: ctx.context,
				backend: ctx.backend,
				database: ctx.database,
				table,
				elements,
				schema,
				options: {
					sortBy: ['version'],
					sortDir: 'asc',
				},
			});

			expect(
				_.map(results, (item) => {
					return _.pick(item, ['version']);
				}),
			).toEqual([
				_.pick(elements[1], ['version']),
				_.pick(elements[4], ['version']),
				_.pick(elements[5], ['version']),
				_.pick(elements[2], ['version']),
				_.pick(elements[0], ['version']),
				_.pick(elements[3], ['version']),
			]);
		});

		testFn('should be able to sort by version (desc)', async () => {
			const table = 'order_4';

			const schema: JsonSchema = {
				type: 'object',
				properties: {
					slug: {
						type: 'string',
					},
					data: {
						type: 'object',
						required: ['bar'],
						properties: {
							bar: {
								type: 'number',
								const: 1,
							},
						},
					},
				},
				required: ['slug', 'data'],
			};

			const elements = [
				{
					slug: `contract-${randomUUID()}`,
					version: '1.0.0-beta',
					type: 'contract',
					data: {
						bar: 1,
					},
				},
				{
					slug: `contract-${randomUUID()}`,
					version: '1.0.0',
					type: 'contract',
					data: {
						bar: 1,
					},
				},
				{
					slug: `contract-${randomUUID()}`,
					version: '1.0.0-alpha+001',
					type: 'contract',
					data: {
						bar: 1,
					},
				},
				{
					slug: `contract-${randomUUID()}`,
					version: '1.0.0-beta+001',
					type: 'contract',
					data: {
						bar: 1,
					},
				},
				{
					slug: `contract-${randomUUID()}`,
					version: '1.0.1',
					type: 'contract',
					data: {
						bar: 1,
					},
				},
				{
					slug: `contract-${randomUUID()}`,
					version: '1.1.0',
					type: 'contract',
					data: {
						bar: 1,
					},
				},
			];

			const results = await runner({
				context: ctx.context,
				backend: ctx.backend,
				database: ctx.database,
				table,
				elements,
				schema,
				options: {
					sortBy: ['version'],
					sortDir: 'desc',
				},
			});

			expect(
				_.map(results, (item) => {
					return _.pick(item, ['version']);
				}),
			).toEqual([
				_.pick(elements[5], ['version']),
				_.pick(elements[4], ['version']),
				_.pick(elements[1], ['version']),
				_.pick(elements[2], ['version']),
				_.pick(elements[3], ['version']),
				_.pick(elements[0], ['version']),
			]);
		});
	});
	describe('anyOf', () => {
		testFn('should handle nested anyOf statements', async () => {
			const table = 'any_of_nested_0';

			const schema: JsonSchema = {
				type: 'object',
				required: ['slug'],
				properties: {
					slug: {
						type: 'string',
						pattern: '^foo*',
					},
				},
				anyOf: [
					{
						type: 'object',
						anyOf: [
							{
								type: 'object',
								required: ['active'],
								properties: {
									active: {
										type: 'boolean',
										const: true,
									},
								},
							},
							{
								type: 'object',
								required: ['name'],
								properties: {
									name: {
										type: 'string',
										const: 'active',
									},
								},
							},
						],
					},
				],
			};

			const elements = [
				{
					slug: 'foo-1',
					version: '1.0.0',
					type: 'contract',
					active: true,
					name: 'active',
					data: {
						xxx: 'foo',
					},
				},
				{
					slug: 'foo-2',
					version: '1.0.0',
					type: 'contract',
					active: false,
					name: 'inactive',
					data: {
						xxx: 'foo',
					},
				},
				{
					slug: 'foo-3',
					version: '1.0.0',
					type: 'contract',
					active: true,
					name: 'inactive',
					data: {
						xxx: 'foo',
					},
				},
				{
					slug: 'foo-4',
					version: '1.0.0',
					type: 'contract',
					active: false,
					name: 'active',
					data: {
						xxx: 'foo',
					},
				},
				{
					slug: 'bar-1',
					version: '1.0.0',
					type: 'contract',
					active: true,
					name: 'active',
					data: {
						xxx: 'bar',
					},
				},
				{
					slug: 'bar-2',
					version: '1.0.0',
					type: 'contract',
					active: false,
					name: 'inactive',
					data: {
						xxx: 'bar',
					},
				},
				{
					slug: 'bar-3',
					version: '1.0.0',
					type: 'contract',
					active: true,
					name: 'inactive',
					data: {
						xxx: 'bar',
					},
				},
				{
					slug: 'bar-4',
					version: '1.0.0',
					type: 'contract',
					active: false,
					name: 'active',
					data: {
						xxx: 'bar',
					},
				},
			];

			const results = await runner({
				context: ctx.context,
				backend: ctx.backend,
				database: ctx.database,
				table,
				elements,
				schema,
			});

			expect(_.map(results, 'slug')).toEqual(['foo-1', 'foo-3', 'foo-4']);
		});
	});

	describe('jsonb_pattern', () => {
		testFn('inside items in a jsonb column', async () => {
			const table = 'pattern_items_jsonb';

			const schema: JsonSchema = {
				type: 'object',
				required: ['id', 'slug', 'type', 'data'],
				properties: {
					id: {
						type: 'string',
					},
					slug: {
						type: 'string',
					},
					type: {
						type: 'string',
					},
					data: {
						type: 'object',
						additionalProperties: true,
						required: ['mirrors'],
						properties: {
							mirrors: {
								type: 'array',
								items: {
									type: 'string',
									pattern: '^https',
								},
							},
						},
					},
				},
			};

			const elements = [
				{
					slug: 'test-pattern-1',
					version: '1.0.0',
					type: 'contract',
					active: true,
					name: 'active',
					data: {
						mirrors: [],
					},
				},
				{
					slug: 'test-pattern-2',
					version: '1.0.0',
					type: 'contract',
					active: true,
					name: 'active',
					data: {
						mirrors: [
							'https://github.com/product-os/jellyfish-test-github/issues/5998',
						],
					},
				},
			];

			const results = await runner({
				context: ctx.context,
				backend: ctx.backend,
				database: ctx.database,
				table,
				elements,
				schema,
			});

			expect(_.map(results, 'slug')).toEqual([
				'test-pattern-1',
				'test-pattern-2',
			]);
		});

		testFn('pattern keyword should be case sensitive', async () => {
			const table = 'pattern_case_jsonb';

			const schema: JsonSchema = {
				type: 'object',
				required: ['id', 'slug', 'type', 'data'],
				properties: {
					id: {
						type: 'string',
					},
					slug: {
						type: 'string',
					},
					type: {
						type: 'string',
					},
					name: {
						pattern: 'foo',
					},
				},
			};

			const elements = [
				{
					slug: 'test-pattern-1',
					version: '1.0.0',
					type: 'contract',
					active: true,
					name: 'foo',
				},
				{
					slug: 'test-pattern-2',
					version: '1.0.0',
					type: 'contract',
					active: true,
					name: 'FOO',
				},
			];

			const results = await runner({
				context: ctx.context,
				backend: ctx.backend,
				database: ctx.database,
				table,
				elements,
				schema,
			});

			expect(results).toHaveLength(1);
			expect(results[0].slug).toBe(elements[0].slug);
		});
	});

	describe('minItems', () => {
		testFn('should work on TEXT array columns', async () => {
			const table = 'minitems_text_array';

			const schema: JsonSchema = {
				type: 'object',
				required: ['markers'],
				properties: {
					markers: {
						type: 'array',
						minItems: 1,
					},
				},
				additionalProperties: true,
			};

			const elements = [
				{
					slug: 'test-1',
					version: '1.0.0',
					type: 'contract',
					active: true,
					markers: ['foobar'],
				},
				{
					slug: 'test-2',
					version: '1.0.0',
					type: 'contract',
					active: true,
				},
			];

			const results = await runner({
				context: ctx.context,
				backend: ctx.backend,
				database: ctx.database,
				table,
				elements,
				schema,
			});

			expect(results).toHaveLength(1);
			expect(results[0].slug).toEqual(elements[0].slug);
		});
	});

	describe('maxItems', () => {
		testFn('should work on TEXT array columns', async () => {
			const table = 'maxitems_text_array';

			const schema: JsonSchema = {
				type: 'object',
				required: ['markers'],
				properties: {
					markers: {
						type: 'array',
						maxItems: 1,
					},
				},
				additionalProperties: true,
			};

			const elements = [
				{
					slug: 'test-1',
					version: '1.0.0',
					type: 'contract',
					active: true,
					markers: ['foobar'],
				},
				{
					slug: 'test-2',
					version: '1.0.0',
					type: 'contract',
					active: true,
					markers: ['foobar', 'bazbuzz'],
				},
			];

			const results = await runner({
				context: ctx.context,
				backend: ctx.backend,
				database: ctx.database,
				table,
				elements,
				schema,
			});

			expect(results).toHaveLength(1);
			expect(results[0].slug).toBe(elements[0].slug);
		});
	});

	describe('const', () => {
		testFn('should work for boolean values', async () => {
			const table = 'const_boolean_value';

			const schema: JsonSchema = {
				type: 'object',
				required: ['data'],
				properties: {
					data: {
						type: 'object',
						required: ['checked'],
						properties: {
							checked: {
								const: true,
							},
						},
					},
				},
				additionalProperties: true,
			};

			const elements = [
				{
					slug: 'test-1',
					version: '1.0.0',
					type: 'contract',
					active: true,
					data: {
						checked: true,
					},
				},
				{
					slug: 'test-2',
					version: '1.0.0',
					type: 'contract',
					active: true,
					data: {
						checked: false,
					},
				},
			];

			const results = await runner({
				context: ctx.context,
				backend: ctx.backend,
				database: ctx.database,
				table,
				elements,
				schema,
			});

			expect(results).toHaveLength(1);
			expect(results[0].slug).toBe(elements[0].slug);
		});

		testFn(
			'boolean value should not match against a string equivalent',
			async () => {
				const table = 'const_boolean_string';

				const schema: JsonSchema = {
					type: 'object',
					required: ['data'],
					properties: {
						data: {
							type: 'object',
							required: ['checked'],
							properties: {
								checked: {
									const: true,
								},
							},
						},
					},
					additionalProperties: true,
				};

				const elements = [
					{
						slug: 'test-1',
						version: '1.0.0',
						type: 'contract',
						active: true,
						data: {
							checked: true,
						},
					},
					{
						slug: 'test-2',
						version: '1.0.0',
						type: 'contract',
						active: true,
						data: {
							checked: 'true',
						},
					},
				];

				const results = await runner({
					context: ctx.context,
					backend: ctx.backend,
					database: ctx.database,
					table,
					elements,
					schema,
				});

				expect(results).toHaveLength(1);
				expect(results[0].slug).toBe(elements[0].slug);
			},
		);

		testFn(
			'number value should not match against a string equivalent',
			async () => {
				const table = 'const_number_string';

				const schema: JsonSchema = {
					type: 'object',
					required: ['data'],
					properties: {
						data: {
							type: 'object',
							required: ['checked'],
							properties: {
								checked: {
									const: 1,
								},
							},
						},
					},
					additionalProperties: true,
				};

				const elements = [
					{
						slug: 'test-1',
						version: '1.0.0',
						type: 'contract',
						active: true,
						data: {
							checked: 1,
						},
					},
					{
						slug: 'test-2',
						version: '1.0.0',
						type: 'contract',
						active: true,
						data: {
							checked: '1',
						},
					},
				];

				const results = await runner({
					context: ctx.context,
					backend: ctx.backend,
					database: ctx.database,
					table,
					elements,
					schema,
				});

				expect(results).toHaveLength(1);
				expect(results[0].slug).toBe(elements[0].slug);
			},
		);

		testFn(
			'matches against strings nested in contains should work',
			async () => {
				const table = 'contains_const_string';

				const schema: JsonSchema = {
					type: 'object',
					required: ['data'],
					properties: {
						data: {
							type: 'object',
							required: ['collection'],
							properties: {
								collection: {
									type: 'array',
									contains: {
										const: 'foo',
									},
								},
							},
						},
					},
					additionalProperties: true,
				};

				const elements = [
					{
						slug: 'test-1',
						version: '1.0.0',
						type: 'contract',
						active: true,
						data: {
							collection: ['foo'],
						},
					},
					{
						slug: 'test-2',
						version: '1.0.0',
						type: 'contract',
						active: true,
						data: {
							collection: ['bar'],
						},
					},
				];

				const results = await runner({
					context: ctx.context,
					backend: ctx.backend,
					database: ctx.database,
					table,
					elements,
					schema,
				});

				expect(results).toHaveLength(1);
				expect(results[0].slug).toBe(elements[0].slug);
			},
		);

		testFn(
			'matches against strings nested in contains should work against top level fields',
			async () => {
				const table = 'contains_const_string_tl';

				const schema: JsonSchema = {
					type: 'object',
					properties: {
						markers: {
							type: 'array',
							contains: {
								const: 'foo',
							},
						},
					},
					additionalProperties: true,
				};

				const elements = [
					{
						slug: 'test-1',
						version: '1.0.0',
						type: 'contract',
						active: true,
						markers: ['foo'],
					},
					{
						slug: 'test-2',
						version: '1.0.0',
						type: 'contract',
						active: true,
						markers: ['bar'],
					},
				];

				const results = await runner({
					context: ctx.context,
					backend: ctx.backend,
					database: ctx.database,
					table,
					elements,
					schema,
				});

				expect(results).toHaveLength(1);
				expect(results[0].slug).toBe(elements[0].slug);
			},
		);
	});
	describe('contains', () => {
		testFn('items of type object should be handled correctly', async () => {
			const table = 'contains_object';

			const schema: JsonSchema = {
				type: 'object',
				required: ['data'],
				properties: {
					data: {
						type: 'object',
						required: ['array'],
						properties: {
							array: {
								type: 'array',
								contains: {
									type: 'object',
									required: ['name'],
									properties: {
										name: {
											type: 'string',
											pattern: 'abc',
										},
									},
								},
							},
						},
					},
				},
			};

			const elements = [
				{
					slug: 'test-1',
					type: 'contract',
					data: {
						array: [
							{
								name: 'abc',
							},
						],
					},
				},
				{
					slug: 'test-2',
					type: 'contract',
					data: {
						array: [
							{
								name: 'cba',
							},
						],
					},
				},
			];

			const results = await runner({
				context: ctx.context,
				backend: ctx.backend,
				database: ctx.database,
				table,
				elements,
				schema,
			});

			expect(results).toHaveLength(1);
			expect(results[0].slug).toBe(elements[0].slug);
		});
	});

	describe('required/optional properties', () => {
		const requiresNothing = {
			desc: 'nothing is required',
			value: [],
		};
		const requiresActor = {
			desc: '`actor` is required',
			value: ['actor'],
		};
		const requiresOther = {
			desc: '`other` is required',
			value: ['other'],
		};
		const actorContents = 'qwerty';
		const notActorContents = 'asdfg';
		const reqoptTestCases = {
			'`actor` true': {
				actor: true,
				cases: [
					{
						required: requiresNothing,
						valid: true,
					},
					{
						required: requiresActor,
						valid: true,
					},
					{
						required: requiresOther,
						valid: false,
					},
				],
			},

			'`actor` false': {
				actor: false,
				cases: [
					{
						required: requiresNothing,
						valid: false,
					},
					{
						required: requiresActor,
						valid: false,
					},
					{
						required: requiresOther,
						valid: false,
					},
				],
			},

			'`actor` matching const': {
				actor: {
					const: actorContents,
				},
				cases: [
					{
						required: requiresNothing,
						valid: true,
					},
					{
						required: requiresActor,
						valid: true,
					},
					{
						required: requiresOther,
						valid: false,
					},
				],
			},

			'`actor` not matching const': {
				actor: {
					const: notActorContents,
				},
				cases: [
					{
						required: requiresNothing,
						valid: false,
					},
					{
						required: requiresActor,
						valid: false,
					},
					{
						required: requiresOther,
						valid: false,
					},
				],
			},

			'`actor` matching pattern': {
				actor: {
					pattern: actorContents,
				},
				cases: [
					{
						required: requiresNothing,
						valid: true,
					},
					{
						required: requiresActor,
						valid: true,
					},
					{
						required: requiresOther,
						valid: false,
					},
				],
			},

			'`actor` not matching pattern': {
				actor: {
					pattern: notActorContents,
				},
				cases: [
					{
						required: requiresNothing,
						valid: false,
					},
					{
						required: requiresActor,
						valid: false,
					},
					{
						required: requiresOther,
						valid: false,
					},
				],
			},

			'`other` true': {
				other: true,
				cases: [
					{
						required: requiresNothing,
						valid: true,
					},
					{
						required: requiresActor,
						valid: true,
					},
					{
						required: requiresOther,
						valid: false,
					},
				],
			},

			'`other` false': {
				other: false,
				cases: [
					{
						required: requiresNothing,
						valid: true,
					},
					{
						required: requiresActor,
						valid: true,
					},
					{
						required: requiresOther,
						valid: false,
					},
				],
			},

			'`other` const': {
				other: {
					const: 'asd',
				},
				cases: [
					{
						required: requiresNothing,
						valid: true,
					},
					{
						required: requiresActor,
						valid: true,
					},
					{
						required: requiresOther,
						valid: false,
					},
				],
			},

			'`other` pattern': {
				other: {
					pattern: 'asd',
				},
				cases: [
					{
						required: requiresNothing,
						valid: true,
					},
					{
						required: requiresActor,
						valid: true,
					},
					{
						required: requiresOther,
						valid: false,
					},
				],
			},
		};

		for (const [name, testCases] of Object.entries(reqoptTestCases)) {
			for (const [idx, testCase] of testCases.cases.entries()) {
				testFn(
					`schema ${name} - ${testCase.required.desc}`,
					/* eslint-disable no-loop-func */
					async () => {
						const table = ['reqopt', name, idx]
							.join('_')
							.replace(/ /g, '_')
							.replace(/`/g, '');

						const schema: JsonSchema = {
							properties: {
								data: {
									properties: {},
								},
							},
						};
						const required = testCase.required.value;
						if (required.length > 0) {
							// TS-TODO: Its weird that `data` has to be cast to "any" here
							(schema.properties!.data as any).required = required;
						}
						if ('actor' in testCases) {
							(schema.properties!.data as any).properties.actor =
								testCases.actor;
						}
						if ('other' in testCases) {
							(schema.properties!.data as any).properties.other =
								testCases.other;
						}

						const elements = [
							{
								slug: 'test-1',
								type: 'contract',
								data: {
									actor: actorContents,
								},
							},
						];

						const results = await runner({
							context: ctx.context,
							backend: ctx.backend,
							database: ctx.database,
							table,
							elements,
							schema,
						});

						// TODO: This check is vulnerable to errors where the results length is greater than 1
						expect(results.length === 1).toBe(testCase.valid);
					},
				);
			}
		}

		testFn(
			"should generate unambiguous aliases for subqueries that can't use qualified SQL identifiers",
			async () => {
				const table = 'unambiguous_alias';

				const schema: JsonSchema = {
					properties: {
						data: {
							properties: {
								tags: {
									contains: {
										pattern: 'test',
									},
								},
							},
						},
					},
				};

				const elements = [
					{
						slug: 'test-1',
						type: 'contract',
						data: {
							tags: ['test'],
						},
					},
				];

				const results = await runner({
					context: ctx.context,
					backend: ctx.backend,
					database: ctx.database,
					table,
					elements,
					schema,
				});

				expect(results).toHaveLength(1);
				expect(results[0].slug).toBe(elements[0].slug);
			},
		);
	});
});
