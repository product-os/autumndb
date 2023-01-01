import { defaultEnvironment } from '@balena/jellyfish-environment';
import { randomUUID } from 'node:crypto';
import { PostgresBackend } from '../../lib/backend';
import { Context, TransactionIsolation } from '../../lib/context';

let context: Context;

beforeAll(async () => {
	const backend = new PostgresBackend(
		null,
		Object.assign({}, defaultEnvironment.database.options, {
			database: `test_context`,
		}),
	);
	context = new Context({ id: `test_context` }, backend);
	await backend.connect(context);
	await context.runQuery(
		'CREATE TABLE IF NOT EXISTS test(id UUID PRIMARY KEY)',
	);
});

afterAll(async () => {
	await context.runQuery('DROP TABLE test');
	await (context as any).database.disconnect(context);
});

describe('Context', () => {
	describe('transactions', () => {
		it('should be able to perform an atomic transaction', async () => {
			const id1 = randomUUID();
			const id2 = randomUUID();
			await context.withTransaction(
				TransactionIsolation.Atomic,
				async (transactionContext: Context) => {
					await context.runQuery(
						`
                        INSERT INTO test
                        VALUES ($1)
                        `,
						[id1],
					);
					await transactionContext.runQuery(
						`
                        INSERT INTO test
                        SELECT $1
                        FROM test
                        WHERE id = $2
                        `,
						[id2, id1],
					);
				},
			);

			expect(
				await context.queryOne(
					`
                    SELECT count(*)
                    FROM test
                    WHERE id IN ($1, $2)
                    `,
					[id1, id2],
				),
			).toEqual({ count: '2' });
		});

		it('should be able to perform a snapshot transaction', async () => {
			const id1 = randomUUID();
			const id2 = randomUUID();
			await context.withTransaction(
				TransactionIsolation.Snapshot,
				async (transactionContext: Context) => {
					await transactionContext.runQuery(`
                        SELECT *
                        FROM test
                    `);
					await context.runQuery(
						`
                        INSERT INTO test
                        VALUES ($1)
                        `,
						[id1],
					);
					await transactionContext.runQuery(
						`
                        INSERT INTO test
                        SELECT $1
                        FROM test
                        WHERE id = $2
                        `,
						[id2, id1],
					);
				},
			);

			expect(
				await context.query(
					`
                    SELECT id
                    FROM test
                    WHERE id IN ($1, $2)
                    `,
					[id1, id2],
				),
			).toEqual([{ id: id1 }]);
		});

		it.skip('should be able to perform a serialized transaction', async () => {
			// TODO: not sure how to reliably force a serialization error with
			// the `Context`'s interface
		});

		it('should rollback if an exception is thrown inside the callback', async () => {
			const id = randomUUID();
			try {
				await context.withTransaction(
					TransactionIsolation.Snapshot,
					async (transactionContext: Context) => {
						await transactionContext.runQuery(
							`
                            INSERT INTO test
                            VALUES ($1)
                            `,
							[id],
						);
						throw 0;
					},
				);
			} catch {
				// empty
			}

			expect(
				await context.queryZeroOrOne(
					`
                    SELECT 1
                    FROM test
                    WHERE id = ($1)
                    `,
					[id],
				),
			).toEqual(null);
		});

		it('should correctly deal with nested transactions', async () => {
			const id1 = randomUUID();
			const id2 = randomUUID();
			await context.withTransaction(
				TransactionIsolation.Snapshot,
				async (transactionContext1: Context) => {
					await transactionContext1.runQuery(
						`
                        INSERT INTO test
                        VALUES ($1)
                        `,
						[id1],
					);
					await transactionContext1.withTransaction(
						TransactionIsolation.Snapshot,
						async (transactionContext2: Context) => {
							await transactionContext2.runQuery(
								`
                                INSERT INTO test
                                VALUES ($1)
                                `,
								[id2],
							);
						},
					);
				},
			);

			expect(
				await context.queryOne(
					`
                    SELECT count(*)
                    FROM test
                    WHERE id IN ($1, $2)
                    `,
					[id1, id2],
				),
			).toEqual({ count: '2' });
		});

		it('should correctly rollback a nested transaction', async () => {
			const id1 = randomUUID();
			const id2 = randomUUID();
			await context.withTransaction(
				TransactionIsolation.Snapshot,
				async (transactionContext1: Context) => {
					await transactionContext1.runQuery(
						`
                        INSERT INTO test
                        VALUES ($1)
                        `,
						[id1],
					);
					try {
						await transactionContext1.withTransaction(
							TransactionIsolation.Snapshot,
							async (transactionContext2: Context) => {
								await transactionContext2.runQuery(
									`
                                    INSERT INTO test
                                    VALUES ($1)
                                    `,
									[id2],
								);
								throw 0;
							},
						);
					} catch {
						// empty
					}
				},
			);

			expect(
				await context.query(
					`
                    SELECT id
                    FROM test
                    WHERE id IN ($1, $2)
                    `,
					[id1, id2],
				),
			).toEqual([{ id: id1 }]);
		});

		it.skip('should serialize unawaited queries', async () => {
			const id1 = randomUUID();
			const id2 = randomUUID();
			context.runQuery(
				`
                INSERT INTO test
                VALUES ($1)
                `,
				[id1],
			);
			context.runQuery(
				`
                INSERT INTO test
                VALUES ($1)
                `,
				[id2],
			);
			await context.runQuery(
				`
                DELETE FROM test
                WHERE id = $1
                `,
				[id2],
			);

			expect(
				await context.query(
					`
                    SELECT id
                    FROM test
                    WHERE id IN ($1, $2)
                    `,
					[id1, id2],
				),
			).toEqual([{ id: id1 }]);
		});
	});
});
