import * as _ from 'lodash';
import * as Bluebird from 'bluebird';
import * as pgFormat from 'pg-format';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as metrics from '@balena/jellyfish-metrics';
import type {
	BackendQueryOptions,
	DatabaseBackend,
	DatabaseConnection,
	Queryable,
	SelectObject,
	SqlQueryOptions,
} from './types';
import type { Context } from '../../context';
import type { IConnected } from 'pg-promise';
import type { IClient } from 'pg-promise/typescript/pg-subset';
import { strict as nativeAssert } from 'assert';
import type { JsonSchema } from '@balena/jellyfish-types';

type StreamConnection = IConnected<{}, IClient>;

interface EventPayload {
	id: any;
	slug: any;
	contractType?: any;
	type?: any;
}

const INSERT_EVENT = 'insert';
const UPDATE_EVENT = 'update';
const DELETE_EVENT = 'delete';
const UNMATCH_EVENT = 'unmatch';

export const start = async (
	context: Context,
	backend: DatabaseBackend,
	connection: DatabaseConnection,
	// The name of the table to stream changes from
	table: string,
	// The table columns that should be watched for updates
	columns: string[],
) => {
	const streamer = new Streamer(backend, table);
	await streamer.init(
		context,
		await connection.connect(),
		columns,
		backend.connectRetryDelay,
	);
	return streamer;
};

export const setupTrigger = async (
	connection: Queryable,
	table: string,
	columns: string[],
) => {
	const tableIdent = pgFormat.ident(table);
	const channel = `stream-${table}`;
	const trigger = pgFormat.ident(`trigger-${channel}`);
	await connection.any(
		`CREATE OR REPLACE FUNCTION rowChanged() RETURNS TRIGGER AS $$
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
					'contractType', type,
					'slug', slug,
					'type', changeType,
					'table', TG_TABLE_NAME
				)::text
			);

			RETURN NULL;
		END;
		$$ LANGUAGE PLPGSQL;

		DROP TRIGGER IF EXISTS ${trigger} ON ${tableIdent};

		CREATE TRIGGER ${trigger} AFTER
		INSERT OR
		UPDATE OF ${columns.join(', ')} OR
		DELETE
		ON ${tableIdent}
		FOR EACH ROW EXECUTE PROCEDURE rowChanged(${pgFormat.literal(channel)});
	`,
	);
};

const startListen = async (connection: StreamConnection, table: string) => {
	const channel = `stream-${table}`;
	await connection.any(`LISTEN ${pgFormat.ident(channel)};`);
};

const handleNotification = async (streamer: Streamer, notification: any) => {
	const payload = JSON.parse(notification.payload);
	if (payload.table !== streamer.table) {
		return;
	}
	await Promise.all(
		Object.values(streamer.streams).map((stream) => {
			return stream.push(payload);
		}),
	);
};

export class Streamer {
	backend: DatabaseBackend;
	table: string;
	connection: null | StreamConnection;
	streams: { [id: string]: Stream };

	constructor(backend: DatabaseBackend, table: string) {
		this.backend = backend;
		this.table = table;
		this.connection = null;
		this.streams = {};
		this.notificationHandler = this.notificationHandler.bind(this);
	}

	async notificationHandler(notification: any) {
		return handleNotification(this, notification);
	}

	errorHandler(context: Context, error: any) {
		context.warn('Streamer database client error', {
			code: error.code,
			message: error.message,
		});
	}

	async endHandler(
		context: Context,
		columns: string[],
		connectRetryDelay: number,
	) {
		// Attempt reconnects to database on unexpected client ends.
		// Expected ends are performed with Streamer.close(), which nullifies "this.connection" before disconnect.
		if (this.connection) {
			context.warn(
				'Streamer database client disconnected, attempting reconnection',
			);
			let reconnecting = true;
			while (reconnecting) {
				try {
					nativeAssert(
						this.backend.isConnected(),
						'Database connection required',
					);

					await this.init(
						context,
						await this.backend.pgConnect(),
						columns,
						connectRetryDelay,
					);

					context.info('Streamer database client reconnected');

					reconnecting = false;
				} catch (error: any) {
					context.warn('Streamer database client reconnect attempt failed', {
						code: error.code,
						message: error.message,
					});

					await Bluebird.delay(connectRetryDelay);
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
	async init(
		context: Context,
		connection: StreamConnection,
		columns: string[],
		connectRetryDelay: number,
	) {
		this.connection = connection;
		await startListen(connection, this.table);
		connection.client.on('notification', this.notificationHandler);
		connection.client.on('error', (error) => {
			this.errorHandler(context, error);
		});
		connection.client.on('end', async () => {
			await this.endHandler(context, columns, connectRetryDelay);
		});
	}

	getAttachedStreamCount() {
		return Object.keys(this.streams).length;
	}

	async attach(
		context: Context,
		select: SelectObject,
		schema: JsonSchema,
		options: SqlQueryOptions = {},
	) {
		return new Stream(context, this, uuidv4(), select, schema, options);
	}
	async close() {
		const connection = this.connection;
		if (connection === null) {
			return;
		}
		this.connection = null;
		connection.client.removeListener('notification', this.notificationHandler);
		for (const stream of Object.values(this.streams)) {
			stream.close();
		}
		await connection.done();
	}

	register(id: string, stream: Stream) {
		this.streams[id] = stream;
	}
	unregister(id: string) {
		if (this.streams !== null) {
			Reflect.deleteProperty(this.streams, id);
		}
	}
}

export class Stream extends EventEmitter {
	seenContractIds: Set<unknown>;
	streamer: Streamer;
	id: string;
	context: Context;
	constContractId?: string;
	constContractSlug?: string;
	contractTypes: null | string[];
	streamQuery: any;

	constructor(
		context: Context,
		streamer: Streamer,
		id: string,
		select: SelectObject,
		schema: JsonSchema,
		options: SqlQueryOptions = {},
	) {
		super();
		this.setMaxListeners(Infinity);
		this.seenContractIds = new Set();
		this.streamer = streamer;
		this.id = id;
		this.context = context;
		this.contractTypes = null;
		this.setSchema(select, schema, options);
		context.info('Attaching new stream', {
			id,
			table: streamer.table,
			attachedStreams: streamer.getAttachedStreamCount(),
		});
		streamer.register(id, this);
		// TODO: `markStreamOpened` need to be fixed to use the correct type
		metrics.markStreamOpened(context.getLogContext(), streamer.table);
		// If an EventEmitter does not have at least one listener for the `error` event
		// an exception will be raised and the nodeJS process will exit. To avoid
		// this we always add an error listener that will log a warning.
		// https://nodejs.org/api/events.html#events_error_events
		this.on('error', (error) => {
			context.error('Encountered an error in stream', {
				id,
				table: streamer.table,
				message: error.message,
				schema,
			});
		});
	}

	async query(
		select: SelectObject,
		schema: JsonSchema,
		options: BackendQueryOptions,
	) {
		// Query the contracts with the IDs so we can add them to
		// `this.seenContractIds`
		const selectsId = 'id' in select;

		if (!selectsId) {
			select.id = {};
		}

		const contracts = await this.streamer.backend.query(
			this.context,
			select,
			schema,
			options,
		);

		for (const contract of contracts) {
			this.seenContractIds.add(contract.id);
		}

		// Remove the ID if that wasn't requested in the first place
		if (!selectsId && !_.get(schema, ['additionalProperties'], true)) {
			for (const contract of contracts) {
				Reflect.deleteProperty(contract, 'id');
			}
		}

		return contracts;
	}

	setSchema(
		select: SelectObject,
		schema: JsonSchema,
		options: SqlQueryOptions = {},
	) {
		this.constContractId = _.get(schema, ['properties', 'id', 'const']);
		this.constContractSlug = _.get(schema, ['properties', 'slug', 'const']);
		this.contractTypes = null;
		if (schema instanceof Object) {
			if (_.has(schema, ['properties', 'type', 'const'])) {
				this.contractTypes = [(schema.properties!.type as any).const.split('@')[0]];
			}
			if (_.has(schema, ['properties', 'type', 'enum'])) {
				const deversionedTypes = (schema.properties!.type as any).enum.map(
					(typeName: string) => {
						return typeName.split('@')[0];
					},
				);
				this.contractTypes = deversionedTypes;
			}
		}
		this.streamQuery = this.streamer.backend.prepareQueryForStream(
			this.context,
			this.id,
			select,
			schema,
			options,
		);
	}

	async push(payload: EventPayload) {
		if (await this.tryEmitEvent(payload)) {
			this.seenContractIds.add(payload.id);
		} else if (this.seenContractIds.delete(payload.id)) {
			this.emit('data', {
				id: payload.id,
				contractType: payload.contractType,
				type: UNMATCH_EVENT,
				after: null,
			});
		}
	}

	async tryEmitEvent(payload: EventPayload) {
		if (this.constContractId && payload.id !== this.constContractId) {
			return false;
		}
		if (this.constContractSlug && payload.slug !== this.constContractSlug) {
			return false;
		}
		if (
			this.contractTypes &&
			!this.contractTypes.includes(payload.contractType.split('@')[0])
		) {
			return false;
		}
		if (payload.type === DELETE_EVENT) {
			this.seenContractIds.delete(payload.id);
			this.emit('data', {
				id: payload.id,
				contractType: payload.contractType,
				type: payload.type,
				after: null,
			});
			return false;
		}
		try {
			const result = await this.streamQuery(payload.id);
			if (result.length === 1) {
				this.emit('data', {
					id: payload.id,
					contractType: payload.contractType,
					type: payload.type,
					after: result[0],
				});
			} else {
				return false;
			}
		} catch (error) {
			metrics.markStreamError(
				this.context.getLogContext(),
				this.streamer.table,
			);
			this.emit('error', error);
		}
		return true;
	}

	close() {
		this.context.info('Detaching stream', {
			id: this.id,
			table: this.streamer.table,
			attachedStreams: this.streamer.getAttachedStreamCount(),
		});
		this.streamer.unregister(this.id);
		// TODO: `markStreamClosed` need to be fixed to use the correct type
		metrics.markStreamClosed(this.context.getLogContext(), this.streamer.table);
		this.emit('closed');
	}
}
