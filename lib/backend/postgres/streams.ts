import * as metrics from '@balena/jellyfish-metrics';
import type { JsonSchema } from '@balena/jellyfish-types';
import type { Contract } from '@balena/jellyfish-types/build/core';
import { EventEmitter } from 'events';
import * as _ from 'lodash';
import { Notification } from 'pg';
import * as pgFormat from 'pg-format';
import { v4 as uuidv4 } from 'uuid';
import {
	Context,
	DatabaseNotificationHandler,
	PreparedStatement,
} from '../../context';
import type { QueryOptions } from '../..';
import type { BackendQueryOptions, SelectObject } from './types';
import * as backend from '.';

export interface StreamChange {
	id: string;
	contractType: string;
	type: 'update' | 'insert' | 'delete' | 'unmatch';
	after?: Contract;
}

interface EventPayload {
	id: any;
	slug: any;
	cardType?: any;
	type?: any;
}

const INSERT_EVENT = 'insert';
const UPDATE_EVENT = 'update';
const DELETE_EVENT = 'delete';
const UNMATCH_EVENT = 'unmatch';

export const start = async (
	context: Context,
	table: string,
): Promise<Streamer> => {
	const streamer = new Streamer(context, table);
	await streamer.connect();

	return streamer;
};

export const setupTrigger = async (
	context: Context,
	table: string,
	columns: string[],
) => {
	const tableIdent = pgFormat.ident(table);
	const channel = `stream-${table}`;
	const trigger = pgFormat.ident(`trigger-${channel}`);
	await context.runQuery(`
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

		DROP TRIGGER IF EXISTS ${trigger} ON ${tableIdent};

		CREATE TRIGGER ${trigger}
		AFTER
			INSERT OR
			UPDATE OF ${columns.join(', ')} OR
			DELETE
		ON ${tableIdent}
		FOR EACH ROW EXECUTE PROCEDURE rowChanged(${pgFormat.literal(channel)});
	`);
};

export class Streamer {
	private channel: string;
	private streams: { [id: string]: Stream } = {};
	private notificationHandler: DatabaseNotificationHandler | null = null;

	constructor(private context: Context, public table: string) {
		this.channel = `stream-${table}`;
		this.notificationListener = this.notificationListener.bind(this);
	}

	async notificationListener(notification: Notification) {
		if (notification.channel !== this.channel) {
			return;
		}

		const payload = JSON.parse(notification.payload!);
		await Promise.all(
			Object.values(this.streams).map((stream) => {
				return stream.push(payload);
			}),
		);
	}

	async relisten() {
		this.context.error(
			'Lost connection to the database notification stream. Reconnecting...',
		);
		await this.connect();
	}

	/**
	 * @summary Initialize a streamer instance, and set up PG notify trigger
	 *
	 * @example
	 * await streamer.init(context, await connection.connect(), columns, connectRetryDelay)
	 */
	async connect() {
		await this.disconnect();

		this.notificationHandler =
			await this.context.listenForDatabaseNotifications(
				this.channel,
				this.notificationListener,
				this.relisten,
			);
	}

	async disconnect() {
		await this.notificationHandler?.end();
		this.notificationHandler = null;

		for (const stream of Object.values(this.streams)) {
			stream.close();
		}
		this.streams = {};
	}

	getAttachedStreamCount() {
		return Object.keys(this.streams).length;
	}

	async attach(
		select: SelectObject,
		schema: JsonSchema,
		options: QueryOptions = {},
	) {
		return new Stream(this.context, this, uuidv4(), select, schema, options);
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
	seenCardIds: Set<unknown>;
	streamer: Streamer;
	id: string;
	context: Context;
	constCardId?: string;
	constCardSlug?: string;
	cardTypes: null | string[];
	streamQuery?: PreparedStatement;
	schema: JsonSchema = false;

	constructor(
		context: Context,
		streamer: Streamer,
		id: string,
		select: SelectObject,
		schema: JsonSchema,
		options: QueryOptions = {},
	) {
		super();
		this.setMaxListeners(Infinity);

		this.seenCardIds = new Set();
		this.streamer = streamer;
		this.id = id;
		this.context = context;
		this.cardTypes = null;

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
		options: Partial<BackendQueryOptions>,
	) {
		// Query the cards with the IDs so we can add them to
		// `this.seenCardIds`
		const selectsId = 'id' in select;

		if (!selectsId) {
			select.id = {};
		}

		const { elements } = await backend.runQuery(
			this.context,
			schema,
			backend.compileSchema(this.context, this.streamer.table, select, schema, {
				limit: backend.MAXIMUM_QUERY_LIMIT,
				...options,
			}).query,
		);

		for (const contract of elements) {
			this.seenCardIds.add(contract.id);
		}

		// Remove the ID if that wasn't requested in the first place
		if (!selectsId && !_.get(schema, ['additionalProperties'], true)) {
			for (const contract of elements) {
				Reflect.deleteProperty(contract, 'id');
			}
		}

		return elements;
	}

	setSchema(
		select: SelectObject,
		schema: JsonSchema,
		options: QueryOptions = {},
	) {
		this.constCardId = _.get(schema, ['properties', 'id', 'const']);
		this.constCardSlug = _.get(schema, ['properties', 'slug', 'const']);
		this.cardTypes = null;
		if (schema instanceof Object) {
			if (_.has(schema, ['properties', 'type', 'const'])) {
				this.cardTypes = [(schema.properties!.type as any).const.split('@')[0]];
			}
			if (_.has(schema, ['properties', 'type', 'enum'])) {
				const deversionedTypes = (schema.properties!.type as any).enum.map(
					(typeName: string) => {
						return typeName.split('@')[0];
					},
				);
				this.cardTypes = deversionedTypes;
			}
		}
		this.streamQuery = Context.prepareQuery(
			backend.compileSchema(this.context, this.streamer.table, select, schema, {
				limit: 1,
				extraFilter: `${this.streamer.table}.id = $1`,
				...options,
			}).query,
		);
		this.schema = schema;
	}

	async push(payload: EventPayload) {
		if (await this.tryEmitEvent(payload)) {
			this.seenCardIds.add(payload.id);
		} else if (this.seenCardIds.delete(payload.id)) {
			this.emit('data', {
				id: payload.id,
				contractType: payload.cardType,
				type: UNMATCH_EVENT,
				after: null,
			});
		}
	}

	async tryEmitEvent(payload: EventPayload) {
		if (this.constCardId && payload.id !== this.constCardId) {
			return false;
		}
		if (this.constCardSlug && payload.slug !== this.constCardSlug) {
			return false;
		}
		if (
			this.cardTypes &&
			!this.cardTypes.includes(payload.cardType.split('@')[0])
		) {
			return false;
		}
		if (payload.type === DELETE_EVENT) {
			this.seenCardIds.delete(payload.id);
			this.emit('data', {
				id: payload.id,
				contractType: payload.cardType,
				type: payload.type,
				after: null,
			});
			return false;
		}
		try {
			const result = (
				await backend.runQuery(this.context, this.schema, this.streamQuery!, [
					payload.id,
				])
			).elements;
			if (result.length === 1) {
				this.emit('data', {
					id: payload.id,
					contractType: payload.cardType,
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
