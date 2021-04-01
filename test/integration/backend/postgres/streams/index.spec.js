/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const ava = require('ava')
const _ = require('lodash')
const Bluebird = require('bluebird')
const {
	v4: uuid
} = require('uuid')
const pgp = require('../../../../../lib/backend/postgres/pg-promise')
const streams = require('../../../../../lib/backend/postgres/streams')
const environment = require('@balena/jellyfish-environment').defaultEnvironment
const PostgresBackend = require('../../../../../lib/backend/postgres/index')

ava.serial.before((test) => {
	test.context.backend = new PostgresBackend(null, null, {
		database: 'test'
	})
})

ava.serial.beforeEach(async (test) => {
	const id = uuid()

	test.context.table = 'test_table'
	test.context.database = `test_streams_${id.replace(/-/g, '')}`

	test.context.context = {
		id: `TEST-STREAMS-${id}`
	}

	const bootstrapConnection = pgp({
		user: environment.postgres.user,
		password: environment.postgres.password,
		database: 'postgres',
		host: environment.postgres.host,
		port: environment.postgres.port
	})

	await bootstrapConnection.any(`
		CREATE DATABASE ${test.context.database}
		OWNER = ${environment.postgres.user}`)

	await bootstrapConnection.$pool.end()
	await bootstrapConnection.$destroy()

	test.context.createConnection = async () => {
		return pgp({
			user: environment.postgres.user,
			database: test.context.database,
			password: environment.postgres.password,
			host: environment.postgres.host,
			port: environment.postgres.port
		})
	}

	test.context.destroyConnection = async (connection) => {
		await connection.$pool.end()
		await connection.$destroy()
	}

	test.context.connection = await test.context.createConnection()
	await test.context.connection.any(`
		CREATE TABLE IF NOT EXISTS ${test.context.table} (
			id UUID PRIMARY KEY NOT NULL,
			slug VARCHAR (255) UNIQUE NOT NULL
		)`)
	test.context.triggerColumns = [ 'id', 'slug' ]
})

ava.serial.afterEach(async (test) => {
	await test.context.destroyConnection(test.context.connection)
	test.context.connection = null
})

ava('should be able to setup and teardown', async (test) => {
	await test.notThrowsAsync(async () => {
		const client = await streams.start(test.context.context,
			test.context.backend, test.context.connection, test.context.table, test.context.triggerColumns)
		await client.close()
	})
})

ava('should be able to create two instances on the same connection', async (test) => {
	await test.notThrowsAsync(async () => {
		const client1 = await streams.start(test.context.context,
			test.context.backend, test.context.connection, test.context.table, test.context.triggerColumns)
		const client2 = await streams.start(test.context.context,
			test.context.backend, test.context.connection, test.context.table, test.context.triggerColumns)
		await client1.close()
		await client2.close()
	})
})

ava('should be able to create two instances different connections', async (test) => {
	const connection1 = await test.context.createConnection()
	const connection2 = await test.context.createConnection()

	await test.notThrowsAsync(async () => {
		const client1 = await streams.start(test.context.context,
			test.context.backend, connection1, test.context.table, test.context.triggerColumns)
		const client2 = await streams.start(test.context.context,
			test.context.backend, connection2, test.context.table, test.context.triggerColumns)
		await client1.close()
		await client2.close()
	})

	await test.context.destroyConnection(connection1)
	await test.context.destroyConnection(connection2)
})

ava('should survive parallel setups', async (test) => {
	const run = async () => {
		await Bluebird.delay(_.random(0, 1000))
		const connection = await test.context.createConnection()
		const client = await streams.start(test.context.context,
			test.context.backend, connection, test.context.table, test.context.triggerColumns)
		await Bluebird.delay(_.random(0, 1000))
		await client.close()
		await Bluebird.delay(_.random(0, 1000))
		await test.context.destroyConnection(connection)
	}

	await test.notThrowsAsync(async () => {
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
			run()
		])
	})
})

ava('should automatically reconnect on disconnect', async (test) => {
	// Set up backend, which comes with its own stream client
	const backend = new PostgresBackend(null, null, {
		user: environment.postgres.user,
		database: test.context.database,
		password: environment.postgres.password,
		host: environment.postgres.host,
		port: environment.postgres.port
	})
	await backend.connect(test.context.context)

	// Disconnect client from database without using streams.close(),
	// simulating an unexpected client end event.
	await backend.streamClient.connection.client.end()

	// Use the stream client to query database, after giving a little time to reconnect.
	await Bluebird.delay(backend.connectRetryDelay)
	const result = await backend.streamClient.connection.client.query(`SELECT id FROM ${test.context.table} LIMIT 1`)
	test.truthy(result)
})
