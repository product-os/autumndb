/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const _ = require('lodash')
const pgFormat = require('pg-format')
const EventEmitter = require('events').EventEmitter
const logger = require('@balena/jellyfish-logger').getLogger(__filename)
const uuid = require('@balena/jellyfish-uuid')
const metrics = require('@balena/jellyfish-metrics')
const {
	INIT_LOCK
} = require('./cards')
const Bluebird = require('bluebird')

const INSERT_EVENT = 'insert'
const UPDATE_EVENT = 'update'
const DELETE_EVENT = 'delete'
const UNMATCH_EVENT = 'unmatch'

// Functions cannot be created concurrently
const CREATE_ROW_CHANGED_FUNCTION_LOCK = 2043989439426746

exports.start = async (context, backend, connection, table, columns) => {
	const streamer = new Streamer(backend, table)
	await streamer.init(context, await connection.connect(), columns, backend.connectRetryDelay)

	return streamer
}

const setupTrigger = async (connection, table, columns) => {
	const tableIdent = pgFormat.ident(table)
	const channel = `stream-${table}`
	const trigger = pgFormat.ident(`trigger-${channel}`)

	await connection.any(`
		BEGIN;

		SELECT pg_advisory_xact_lock(${CREATE_ROW_CHANGED_FUNCTION_LOCK});

		CREATE OR REPLACE FUNCTION rowChanged() RETURNS TRIGGER AS $$
		DECLARE
			id UUID;
			slug TEXT;
			type TEXT;
			changeType TEXT;
		BEGIN
			IF (TG_OP = 'INSERT') THEN
				id := NEW.id;
				slug := NEW.slug;
				type := NEW.type;
				changeType := '${INSERT_EVENT}';
			ELSIF (TG_OP = 'UPDATE') THEN
				id := NEW.id;
				slug := NEW.slug;
				type := NEW.type;
				changeType := '${UPDATE_EVENT}';
			ELSE
				id := OLD.id;
				slug := OLD.slug;
				type := OLD.type;
				changeType := '${DELETE_EVENT}';
			END IF;

			PERFORM pg_notify(
				TG_ARGV[0],
				json_build_object(
					'id', id,
					'cardType', type,
					'slug', slug,
					'type', changeType,
					'table', TG_TABLE_NAME
				)::text
			);

			RETURN NULL;
		END;
		$$ LANGUAGE PLPGSQL;

		COMMIT;

		BEGIN;

		SELECT pg_advisory_xact_lock(${INIT_LOCK});

		DROP TRIGGER IF EXISTS ${trigger} ON ${tableIdent};

		CREATE TRIGGER ${trigger} AFTER
		INSERT OR
		UPDATE OF ${columns.join(', ')} OR
		DELETE
		ON ${tableIdent}
		FOR EACH ROW EXECUTE PROCEDURE rowChanged(${pgFormat.literal(channel)});

		LISTEN ${pgFormat.ident(channel)};

		COMMIT;
	`)
}

const handleNotification = async (streamer, notification) => {
	const payload = JSON.parse(notification.payload)
	if (payload.table !== streamer.table) {
		return
	}

	await Promise.all(Object.values(streamer.streams).map((stream) => {
		return stream.push(payload)
	}))
}

class Streamer {
	constructor (backend, table) {
		this.backend = backend
		this.table = table
		this.connection = null
		this.streams = []
		this.notificationHandler = async (notification) => {
			return handleNotification(this, notification)
		}
		this.errorHandler = (context, error) => {
			logger.warn(context, 'Streamer database client error', {
				code: error.code,
				message: error.message
			})
		}
		this.endHandler = async (context, columns, connectRetryDelay) => {
			// Attempt reconnects to database on unexpected client ends.
			// Expected ends are performed with Streamer.close(), which nullifies "this.connection" before disconnect.
			if (this.connection) {
				logger.warn(context, 'Streamer database client disconnected, attempting reconnection')
				let reconnecting = true
				while (reconnecting) {
					try {
						await this.init(context, await this.backend.connection.connect(), columns, connectRetryDelay)
						logger.info(context, 'Streamer database client reconnected')
						reconnecting = false
					} catch (error) {
						logger.warn(context, 'Streamer database client reconnect attempt failed', {
							code: error.code,
							message: error.message
						})
						await Bluebird.delay(connectRetryDelay)
					}
				}
			}
		}
	}

	/**
	* @summary Initialize a streamer instance, and set up PG notify trigger
	* @function
	*
	* @param {Object} context - execution context
	* @param {Object} connection - pg.Client instance
	* @param {Array} columns - list of columns names used for trigger
	* @param {Number} connectRetryDelay - amount of time (ms) to wait between DB connect attempts
	*
	* @example
	* await streamer.init(context, await connection.connect(), columns, connectRetryDelay)
	*/
	async init (context, connection, columns, connectRetryDelay) {
		this.connection = connection

		await setupTrigger(connection, this.table, columns)
		connection.client.on('notification', this.notificationHandler)
		connection.client.on('error', (error) => {
			this.errorHandler(context, error)
		})
		connection.client.on('end', async () => {
			await this.endHandler(context, columns, connectRetryDelay)
		})
	}

	getAttachedStreamCount () {
		return Object.keys(this.streams).length
	}

	async attach (context, select, schema, options) {
		return new Stream(context, this, await uuid.random(), select, schema, options)
	}

	async close () {
		const connection = this.connection
		if (connection === null) {
			return
		}
		this.connection = null

		connection.client.removeListener('notification', this.notificationHandler)
		for (const stream of Object.values(this.streams)) {
			stream.close()
		}

		await connection.done()
	}

	register (id, stream) {
		this.streams[id] = stream
	}

	unregister (id) {
		if (this.streams !== null) {
			Reflect.deleteProperty(this.streams, id)
		}
	}
}

class Stream extends EventEmitter {
	constructor (context, streamer, id, select, schema, options) {
		super()

		this.setMaxListeners(Infinity)

		this.seenCardIds = new Set()

		this.streamer = streamer
		this.id = id
		this.context = context
		this.setSchema(select, schema, options)

		logger.info(context, 'Attaching new stream', {
			id,
			table: streamer.table,
			attachedStreams: streamer.getAttachedStreamCount()
		})
		streamer.register(id, this)
		metrics.markStreamOpened(context, streamer.table)

		// If an EventEmitter does not have at least one listener for the `error` event
		// an exception will be raised and the nodeJS process will exit. To avoid
		// this we always add an error listener that will log a warning.
		// https://nodejs.org/api/events.html#events_error_events
		this.on('error', (error) => {
			logger.error(context, 'Encountered an error in stream', {
				id,
				table: streamer.table,
				message: error.message,
				schema
			})
		})
	}

	async query (select, schema, options) {
		// Query the cards with the IDs so we can add them to
		// `this.seenCardIds`
		const selectsId = 'id' in select
		if (!selectsId) {
			select.id = {}
		}

		const cards = await this.streamer.backend.query(
			this.context,
			select,
			schema,
			options
		)
		for (const card of cards) {
			this.seenCardIds.add(card.id)
		}

		// Remove the ID if that wasn't requested in the first place
		if (!selectsId && !_.get(schema, [ 'additionalProperties' ], true)) {
			for (const card of cards) {
				Reflect.deleteProperty(card, 'id')
			}
		}

		return cards
	}

	setSchema (select, schema, options) {
		console.log('============================')
		console.log('PR streams setSchema')
		console.log('select:', select)
		console.log('schema:', schema)
		console.log('options:', options)

		this.constCardId = _.get(schema, [ 'properties', 'id', 'const' ])
		this.constCardSlug = _.get(schema, [ 'properties', 'slug', 'const' ])
		console.log('SLUG:', this.constCardSlug)
		console.log('============================')
		this.cardTypes = null
		if (_.has(schema, [ 'properties', 'type', 'const' ])) {
			this.cardTypes = [ schema.properties.type.const.split('@')[0] ]
		}

		if (_.has(schema, [ 'properties', 'type', 'enum' ])) {
			const deversionedTypes = schema.properties.type.enum.map((typeName) => {
				return typeName.split('@')[0]
			})
			this.cardTypes = deversionedTypes
		}

		this.streamQuery = this.streamer.backend.prepareQueryForStream(
			this.context,
			this.id,
			select,
			schema,
			options
		)
	}

	async push (payload) {
		if (await this.tryEmitEvent(payload)) {
			this.seenCardIds.add(payload.id)
		} else if (this.seenCardIds.delete(payload.id)) {
			this.emit('data', {
				id: payload.id,
				type: UNMATCH_EVENT,
				after: null
			})
		}
	}

	async tryEmitEvent (payload) {
		if (this.constCardId && payload.id !== this.constCardId) {
			return false
		}

		if (this.constCardSlug && payload.slug !== this.constCardSlug) {
			return false
		}

		if (this.cardTypes && !this.cardTypes.includes(payload.cardType.split('@')[0])) {
			return false
		}

		if (payload.type === DELETE_EVENT) {
			this.seenCardIds.delete(payload.id)
			this.emit('data', {
				id: payload.id,
				type: payload.type,
				after: null
			})

			return false
		}

		try {
			const result = await this.streamQuery(payload.id)

			if (result.length === 1) {
				this.emit('data', {
					id: payload.id,
					type: payload.type,
					after: result[0]
				})
			} else {
				return false
			}
		} catch (error) {
			metrics.markStreamError(this.context, this.streamer.table)
			this.emit('error', error)
		}

		return true
	}

	close () {
		logger.info(this.context, 'Detaching stream', {
			id: this.id,
			table: this.streamer.table,
			attachedStreams: this.streamer.getAttachedStreamCount()
		})
		this.streamer.unregister(this.id)
		metrics.markStreamClosed(this.context, this.streamer.table)
		this.emit('closed')
	}
}
