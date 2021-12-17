import * as _ from 'lodash';
import * as Bluebird from 'bluebird';
import { v4 as uuid } from 'uuid';
import pgp from '../../../../../lib/backend/postgres/pg-promise';
import * as streams from '../../../../../lib/backend/postgres/streams';
import { defaultEnvironment as environment } from '@balena/jellyfish-environment';
import { PostgresBackend } from '../../../../../lib/backend/postgres/index';
import { Context } from '../../../../../lib/context';
import { DatabaseConnection } from '../../../../../lib/backend/postgres/types';

let ctx: {
	connection: DatabaseConnection | null;
	context: Context;
	createConnection: () => Promise<DatabaseConnection>;
	database: string;
	destroyConnection: (con: DatabaseConnection) => Promise<void>;
	table: string;
	triggerColumns: string[];
};

const backend = new PostgresBackend(
	null,
	{},
	{
		database: 'test',
		user: environment.postgres.user,
	},
);

beforeEach(async () => {
	const id = uuid();
	const database = `test_streams_${id.replace(/-/g, '')}`;

	const context = new Context({ id: `TEST-STREAMS-${id}` });

	const table = 'test_table';

	const bootstrapConnection = pgp({
		user: environment.postgres.user,
		password: environment.postgres.password,
		database: 'postgres',
		host: environment.postgres.host,
		// TS-TODO: Figure out why this cast is needed
		port: environment.postgres.port as any,
	});

	await bootstrapConnection.any(`
		CREATE DATABASE ${database}
		OWNER = ${environment.postgres.user}`);

	await bootstrapConnection.$pool.end();
	// TS-TODO: add $destroy to connection typings
	await (bootstrapConnection as any).$destroy();

	const createConnection = async () => {
		return pgp({
			user: environment.postgres.user,
			database,
			password: environment.postgres.password,
			host: environment.postgres.host,
			// TS-TODO: Figure out why this cast is needed
			port: environment.postgres.port as any,
		});
	};

	const destroyConnection = async (con: DatabaseConnection) => {
		await con.$pool.end();
		// TS-TODO: add $destroy to connection typings
		await (con as any).$destroy();
	};

	const connection = await createConnection();
	await connection.any(`
		CREATE TABLE IF NOT EXISTS ${table} (
			id UUID PRIMARY KEY NOT NULL,
			slug VARCHAR (255) UNIQUE NOT NULL
		)`);

	const triggerColumns = ['id', 'slug'];

	ctx = {
		connection,
		context,
		createConnection,
		database,
		destroyConnection,
		table,
		triggerColumns,
	};
});

afterEach(async () => {
	if (ctx.connection) {
		await ctx.destroyConnection(ctx.connection);
	}
	ctx.connection = null;
});

describe('streams', () => {
	it('should be able to setup and teardown', async () => {
		await expect(
			(async () => {
				const client = await streams.start(
					ctx.context,
					backend,
					ctx.connection!,
					ctx.table,
					ctx.triggerColumns,
				);
				await client.close();
			})(),
		).resolves.not.toThrow();
	});

	it('should be able to create two instances on the same connection', async () => {
		await expect(
			(async () => {
				const client1 = await streams.start(
					ctx.context,
					backend,
					ctx.connection!,
					ctx.table,
					ctx.triggerColumns,
				);
				const client2 = await streams.start(
					ctx.context,
					backend,
					ctx.connection!,
					ctx.table,
					ctx.triggerColumns,
				);
				await client1.close();
				await client2.close();
			})(),
		).resolves.not.toThrow();
	});

	it('should be able to create two instances different connections', async () => {
		const connection1 = await ctx.createConnection();
		const connection2 = await ctx.createConnection();

		await expect(
			(async () => {
				const client1 = await streams.start(
					ctx.context,
					backend,
					connection1,
					ctx.table,
					ctx.triggerColumns,
				);
				const client2 = await streams.start(
					ctx.context,
					backend,
					connection2,
					ctx.table,
					ctx.triggerColumns,
				);
				await client1.close();
				await client2.close();
			})(),
		).resolves.not.toThrow();

		await ctx.destroyConnection(connection1);
		await ctx.destroyConnection(connection2);
	});

	it('should survive parallel setups', async () => {
		const run = async () => {
			await Bluebird.delay(_.random(0, 1000));
			const connection = await ctx.createConnection();
			const client = await streams.start(
				ctx.context,
				backend,
				connection,
				ctx.table,
				ctx.triggerColumns,
			);
			await Bluebird.delay(_.random(0, 1000));
			await client.close();
			await Bluebird.delay(_.random(0, 1000));
			await ctx.destroyConnection(connection);
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

	it('should automatically reconnect on disconnect', async () => {
		// Set up backend, which comes with its own stream client
		const testBackend = new PostgresBackend(
			null,
			{},
			{
				user: environment.postgres.user,
				database: ctx.database,
				password: environment.postgres.password,
				host: environment.postgres.host,
				port: environment.postgres.port,
			},
		);

		await testBackend.connect(ctx.context);

		// Disconnect client from database without using streams.close(),
		// simulating an unexpected client end event.
		await testBackend.streamClient!.connection!.done(true);

		// Use the stream client to query database, after giving a little time to reconnect.
		await Bluebird.delay(backend.connectRetryDelay);
		const result = await testBackend.streamClient!.connection!.client.query(
			`SELECT id FROM ${ctx.table} LIMIT 1`,
		);

		expect(result).toBeTruthy();
	});
});
