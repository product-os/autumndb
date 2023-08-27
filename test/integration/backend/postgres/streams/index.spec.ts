import { defaultEnvironment as environment } from '@balena/jellyfish-environment';
import * as Bluebird from 'bluebird';
import * as _ from 'lodash';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import * as streams from '../../../../../lib/backend/postgres/streams';
import { Context } from '../../../../../lib/context';

let ctx: {
	context: Context;
	connectToDatabase: () => Promise<Pool>;
	database: string;
	destroyDatabaseConnection: (con: Pool) => Promise<void>;
	table: string;
	triggerColumns: string[];
};

const destroyDatabaseConnection = async (pool: Pool) => {
	await pool.end();
};

beforeEach(async () => {
	const id = randomUUID();
	const database = `test_streams_${id.replace(/-/g, '')}`;

	const table = 'test_table';

	const bootstrapConnection = new Pool({
		user: environment.postgres.user,
		password: environment.postgres.password,
		database: 'postgres',
		host: environment.postgres.host,
		// TS-TODO: Figure out why this cast is needed
		port: environment.postgres.port as any,
	});

	await bootstrapConnection.query(`
		CREATE DATABASE ${database}
		OWNER = ${environment.postgres.user}`);

	await bootstrapConnection.end();

	const connectToDatabase = async (): Promise<Pool> => {
		return new Pool({
			user: environment.postgres.user,
			database,
			password: environment.postgres.password,
			host: environment.postgres.host,
			// TS-TODO: Figure out why this cast is needed
			port: environment.postgres.port as any,
		});
	};

	const pool = await connectToDatabase();
	await pool.query(`
		CREATE TABLE IF NOT EXISTS ${table} (
			id UUID PRIMARY KEY NOT NULL,
			slug VARCHAR (255) UNIQUE NOT NULL
		)
	`);
	const context = new Context(
		{ id: `TEST-STREAMS-${id}` },
		{
			getConnection: () => {
				return pool!.connect();
			},
			releaseConnection: (connection: PoolClient) => {
				connection.release();

				return Promise.resolve();
			},
		},
	);

	const triggerColumns = ['id', 'slug'];

	ctx = {
		context,
		connectToDatabase,
		database,
		destroyDatabaseConnection,
		table,
		triggerColumns,
	};
});

describe('streams', () => {
	it('should be able to setup and teardown', async () => {
		await expect(
			(async () => {
				const client = await streams.start(ctx.context, ctx.table);
				await client.disconnect();
			})(),
		).resolves.not.toThrow();
	});

	it('should be able to create two instances on the same connection', async () => {
		await expect(
			(async () => {
				const client1 = await streams.start(ctx.context, ctx.table);
				const client2 = await streams.start(ctx.context, ctx.table);
				await client1.disconnect();
				await client2.disconnect();
			})(),
		).resolves.not.toThrow();
	});

	it('should be able to create two instances different connections', async () => {
		const connection1 = await ctx.connectToDatabase();
		const connection2 = await ctx.connectToDatabase();

		await expect(
			(async () => {
				const client1 = await streams.start(ctx.context, ctx.table);
				const client2 = await streams.start(ctx.context, ctx.table);
				await client1.disconnect();
				await client2.disconnect();
			})(),
		).resolves.not.toThrow();

		await ctx.destroyDatabaseConnection(connection1);
		await ctx.destroyDatabaseConnection(connection2);
	});

	it('should survive parallel setups', async () => {
		const run = async () => {
			await Bluebird.delay(_.random(0, 1000));
			const connection = await ctx.connectToDatabase();
			const client = await streams.start(ctx.context, ctx.table);
			await Bluebird.delay(_.random(0, 1000));
			await client.disconnect();
			await Bluebird.delay(_.random(0, 1000));
			await ctx.destroyDatabaseConnection(connection);
		};

		await expect(
			(async () => {
				await Bluebird.all([
					run(),
					run(),
					run(),
					run(),
					run(),
					run(),
					run(),
					run(),
					run(),
					run(),
					run(),
					run(),
					run(),
					run(),
					run(),
					run(),
					run(),
					run(),
					run(),
					run(),
					run(),
					run(),
					run(),
					run(),
				]);
			})(),
		).resolves.not.toThrow();
	});
});
