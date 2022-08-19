import * as metrics from '@balena/jellyfish-metrics';
import { EventEmitter } from 'events';
import * as _ from 'lodash';
import { Notification } from 'pg';
import * as pgFormat from 'pg-format';
import { v4 as uuidv4 } from 'uuid';
import * as backend from '.';
import type { Contract, JsonSchema, LinkContract } from '../../types';
import {
	Context,
	DatabaseNotificationHandler,
	PreparedStatement,
} from '../../context';
import type { StreamOptions } from '../../kernel';
import type { BackendQueryOptions, SelectObject } from './types';

export interface StreamChange {
	id: string;
	contractType: string;
	type: 'update' | 'insert' | 'delete' | 'unmatch';
	after?: Contract;
}

interface EventPayload {
	id: string;
	slug: string;
	cardType: string;
	type: 'update' | 'insert' | 'delete';
	linkData: null | {
		name: LinkContract['name'];
		inverseName: LinkContract['data']['inverseName'];
		from: LinkContract['data']['from'];
		to: LinkContract['data']['to'];
	};
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
			linkData JSON;
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

			IF (type  = 'link@1.0.0') THEN
				IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
					linkData := json_build_object(
						'name', NEW.name,
						'inverseName', NEW.data->'inverseName',
						'from', NEW.data->'from',
						'to', NEW.data->'to'
					);
				ELSE
					linkData := json_build_object(
						'name', OLD.name,
						'inverseName', OLD.data->'inverseName',
						'from', OLD.data->'from',
						'to', OLD.data->'to'
					);
				END IF;
			END IF;

			PERFORM pg_notify(
				TG_ARGV[0],
				json_build_object(
					'id', id,
					'cardType', type,
					'slug', slug,
					'type', changeType,
					'table', TG_TABLE_NAME,
					'linkData', linkData
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
		options: StreamOptions = {},
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
	// This is a map from contract IDs to a set of root contract IDs that link
	// to it, directly or not. Root contracts reference themselves
	private seenContractIds: { [key: string]: Set<string> } = {};

	private constCardId?: string;
	private constCardSlug?: string;
	private cardTypes: null | string[] = null;
	private streamQuery?: PreparedStatement;
	private schema: JsonSchema = false;

	public constructor(
		private context: Context,
		private streamer: Streamer,
		private id: string,
		select: SelectObject,
		schema: JsonSchema,
		options: StreamOptions = {},
	) {
		super();
		this.setMaxListeners(Infinity);

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
			});
		});
	}

	public async query(
		select: SelectObject,
		schema: JsonSchema,
		options?: Partial<BackendQueryOptions>,
	) {
		// Query the cards with the IDs so we can add them to
		// `this.seenContractIds`
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
			this.seeContractTree(contract);
		}

		// Remove the ID if that wasn't requested in the first place
		if (!selectsId && !_.get(schema, ['additionalProperties'], true)) {
			for (const contract of elements) {
				Reflect.deleteProperty(contract, 'id');
			}
		}

		return elements;
	}

	public setSchema(
		select: SelectObject,
		schema: JsonSchema,
		options: StreamOptions = {},
	) {
		this.constCardId = _.get(schema, ['properties', 'id', 'const']);
		this.constCardSlug = _.get(schema, ['properties', 'slug', 'const']);
		this.cardTypes = null;
		if (schema instanceof Object) {
			if (_.has(schema, ['properties', 'type', 'const'])) {
				this.cardTypes = [(schema.properties!.type as any).const.split('@')[0]];
			} else if (_.has(schema, ['properties', 'type', 'enum'])) {
				const deversionedTypes = (schema.properties!.type as any).enum.map(
					(typeName: string) => {
						return typeName.split('@')[0];
					},
				);
				this.cardTypes = deversionedTypes;
			} else if (_.has(schema, ['properties', 'type', 'anyOf'])) {
				const deversionedTypes = (schema.properties!.type as any).anyOf.map(
					(subSchema: JsonSchema) => {
						return typeof subSchema === 'boolean'
							? null
							: (subSchema?.const as string).split('@')[0];
					},
				);
				this.cardTypes = _.compact(deversionedTypes);
			}
		}
		this.streamQuery = Context.prepareQuery(
			backend.compileSchema(this.context, this.streamer.table, select, schema, {
				...options,
				limit: backend.MAXIMUM_QUERY_LIMIT,
				extraFilter: `${this.streamer.table}.id IN $1`,
			}).query,
		);
		this.schema = schema;
	}

	public async push(payload: EventPayload) {
		if (payload.cardType === 'link@1.0.0') {
			// Adding or removing links do not cause any changes to the linked
			// contracts, so we have to look at link contracts to handle those
			// cases
			// TODO: note that we don't hadle the case where a link contract is
			// modified to point at different contracts. This shouldn't happen
			// anyway so it shouldn't be a problem
			const rootIds: Set<string> = new Set();
			const fromRootSet = this.seenContractIds[payload.linkData!.from.id];
			if (fromRootSet) {
				for (const id of fromRootSet) {
					rootIds.add(id);
				}
			}
			const toRootSet = this.seenContractIds[payload.linkData!.to.id];
			if (toRootSet) {
				for (const id of toRootSet) {
					rootIds.add(id);
				}
			}
			await this.contractsUpdated(rootIds);

			// TODO: since we're doing an early return here we miss the case
			// where a contract is linked to another link contract. There is no
			// reason for this to happen atm so it's a sensible simplification
			return;
		}

		const rootIds = this.seenContractIds[payload.id];
		if (rootIds) {
			// We've already seen this contract so no need to heuristically
			// filter it

			if (payload.type === DELETE_EVENT && rootIds.has(payload.id)) {
				// A root contract was deleted. Emit a delete event for it
				this.unseeContractId(payload.id);
				this.emit('data', {
					id: payload.id,
					contractType: payload.cardType,
					type: DELETE_EVENT,
					after: null,
				});
			} else {
				// Root contracts were updated. We will emit an update event
				// or an unmatch event
				await this.contractsUpdated(rootIds);
			}
		} else if (payload.type !== DELETE_EVENT) {
			// We haven't seen this contract yet. And if it's deleted we don't
			// care regardless
			await this.filterContractUpdated(payload);
		}
	}

	private async filterContractUpdated(payload: EventPayload) {
		if (this.constCardId && payload.id !== this.constCardId) {
			return;
		}
		if (this.constCardSlug && payload.slug !== this.constCardSlug) {
			return;
		}
		if (
			this.cardTypes &&
			!this.cardTypes.includes(payload.cardType.split('@')[0])
		) {
			return;
		}

		await this.contractsUpdated(new Set([payload.id]));
	}

	private async contractsUpdated(rootIds: Set<string>) {
		try {
			const contracts = (await backend.runQuery(this.context, this.schema, this.streamQuery!, [rootIds])).elements;

			for (const contract of contracts) {
				rootIds.delete(contract.id);
				this.seeContractTree(contract);
				this.emit('data', {
					id: contract.id,
					contractType: contract.cardType,
					type: UPDATE_EVENT,
					after: contract,
				});
			}

			for (const contractId of rootIds) {
				this.unseeContractId(contractId);
				this.emit('data', {
					id: contractId,
					contractType: contract.cardType,
					type: UNMATCH_EVENT,
					after: null,
				});
			}
		} catch (error: unknown) {
			metrics.markStreamError(
				this.context.getLogContext(),
				this.streamer.table,
			);
			this.emit('error', error);
		}
	}

	private async tryEmitEvent(payload: EventPayload) {
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
			this.seenContractIds.delete(payload.id);
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

	private seeContractTree(contract: Contract, rootId: string = contract.id) {
		if (contract.id in this.seenContractIds) {
			this.seenContractIds[contract.id].add(rootId);
		} else {
			this.seenContractIds[contract.id] = new Set([rootId]);
		}

		if ('links' in contract) {
			for (const linkTypeLinked of Object.values(contract.links!)) {
				for (const linked of linkTypeLinked) {
					this.seeContractTree(linked, rootId);
				}
			}
		}
	}

	private unseeContractId(contractId: string) {
		const contractRootSet = this.seenContractIds[contractId];
		if (!contractRootSet) {
			// ID never seen, nothing to do
			return;
		}

		if (contractRootSet.has(contractId)) {
			// `contractId` is the ID of a root contract so remove it from
			// everyone's root set (including its own). Note that we can't
			// blindly delete `contractId`'s root set because it may also
			// appear as a linked contract
			for (const [seenContractId, seenRootSet] of Object.entries(this.seenContractIds)) {
				seenRootSet.delete(contractId);
				if (seenRootSet.size === 0) {
					Reflect.deleteProperty(this.seenContractIds, seenContractId);
				}
			}
		} else {
			// `contractId` is not the ID of a root contract so we can just
			// remove its root set
			Reflect.deleteProperty(this.seenContractIds, contractId);
		}
	}

	public close() {
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
