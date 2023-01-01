import * as metrics from '@balena/jellyfish-metrics';
import { EventEmitter } from 'events';
import * as _ from 'lodash';
import { randomUUID } from 'node:crypto';
import { Notification } from 'pg';
import * as pgFormat from 'pg-format';
import { setTimeout as delay } from 'timers/promises';
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

const getContractTypeSql = Context.prepareQuery(`
	SELECT type
	FROM cards
	WHERE id = $1
`);

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
		return new Stream(
			this.context,
			this,
			randomUUID(),
			select,
			schema,
			options,
		);
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
	private traversesLinks: boolean = false;

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
		// We need to ensure that the select statement gets the id and type, so that unmatch events work as expected.
		// This is because we use the contract id to check if a contract has been matched previously.
		const selectWithDefaults = {
			id: {},
			type: {},
			...select,
		};
		this.streamQuery = Context.prepareQuery(
			backend.compileSchema(
				this.context,
				this.streamer.table,
				selectWithDefaults,
				schema,
				{
					...options,
					limit: backend.MAXIMUM_QUERY_LIMIT,
					extraFilter: `${this.streamer.table}.id = ANY($1::uuid[])`,
				},
			).query,
		);
		this.schema = schema;
		this.traversesLinks =
			typeof schema !== 'boolean' && schema.hasOwnProperty('$$links');
	}

	public async push(payload: EventPayload) {
		let rootIds: Set<string>;
		if (
			payload.cardType === 'link@1.0.0' &&
			payload.linkData &&
			this.traversesLinks
		) {
			/*
			 * Adding or removing links do not cause any changes to the linked
			 * contracts, so we have to look at link contracts to handle those
			 * cases.
			 * We need to use the id from the right direction of the link depending on the
			 * link name in the stream schema.
			 */

			const schema = this.schema;
			if (typeof schema === 'boolean' || !schema.$$links) {
				return;
			}
			rootIds = new Set();
			const verb = Object.keys(schema.$$links)[0];

			// If the link being inserted joins different types together
			// than what is defined in the filter schema, we can use
			// this as a heuristic to validate the trigger

			// Get a list of types the filter link expansion queries against
			const linkToTypeKeySchema = (schema.$$links[verb] as any)?.properties
				?.type;
			let linkToTypes: null | string[] = null;
			if (linkToTypeKeySchema?.const) {
				linkToTypes = [linkToTypeKeySchema.const];
			} else if (linkToTypeKeySchema?.enum) {
				linkToTypes = linkToTypeKeySchema.enum;
			}

			// Get a list of types the filter queries against
			const linkFromTypeKeySchema = schema.properties?.type as any;
			let linkFromTypes: null | string[] = null;
			if (linkFromTypeKeySchema?.const) {
				linkFromTypes = [linkFromTypeKeySchema.const];
			} else if (linkFromTypeKeySchema?.enum) {
				linkFromTypes = linkFromTypeKeySchema.enum;
			}

			// Check if the link contract references the same types as the filter
			// The type testing heuristic needs to run the other way around if the verb
			// in the filter is the inverse name
			if (verb === payload.linkData.name) {
				if (
					(linkFromTypes &&
						!linkFromTypes.includes(payload.linkData.from.type)) ||
					(linkToTypes && !linkToTypes.includes(payload.linkData.to.type))
				) {
					return false;
				}

				rootIds.add(payload.linkData.from.id);
			} else if (verb === payload.linkData.inverseName) {
				if (
					(linkToTypes && !linkToTypes.includes(payload.linkData.from.type)) ||
					(linkFromTypes && !linkFromTypes.includes(payload.linkData.to.type))
				) {
					return false;
				}

				rootIds.add(payload.linkData.to.id);

				// Abort if the link doesn't match.
			} else {
				return;
			}

			await this.contractsUpdated(rootIds, payload);

			// TODO: since we're doing an early return here we miss the case
			// where a contract is linked to another link contract. There is no
			// reason for this to happen atm so this is a sensible
			// simplification
			return;
		}

		rootIds = this.seenContractIds[payload.id];
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
				// Root contracts were upserted, including expanded links. We
				// will emit an insert event, an update event or an unmatch
				// event
				await this.contractsUpdated(new Set(rootIds), payload);
			}
		} else if (payload.type !== DELETE_EVENT) {
			// We haven't seen this contract yet. If it's deleted we don't
			// care regardless. Otherwise, heuristically filter it and if
			// necessary, emit an event
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

		await this.contractsUpdated(new Set([payload.id]), payload);
	}

	private async contractsUpdated(
		rootIds: Set<string>,
		payload: EventPayload,
		retries = 1,
	): Promise<void> {
		try {
			// TODO: This is an abomination, but it seems that you have to delay to make sure that
			// row has updated, otherwise you'll get the prior state in the query results. Even with
			// the delay you may still not get the expected result with a query on first insert,
			// which is why we have a retry here. This also compensates for situations where the trigger
			// the matched contract is a link and we need to allow a grace period for the links table
			// to be updated, as the trigger only matches against the main contract table and will have
			// run *before* the link tables have been updated..
			// This needs to be fixed, most likely by switching to using the WAL feature of Postgres
			// for streaming instead of TRIGGER/NOTIFY.
			// see: https://github.com/supabase/realtime
			await delay(50);
			const contracts = (
				await backend.runQuery(this.context, this.schema, this.streamQuery!, [
					Array.from(rootIds),
				])
			).elements;

			if (!contracts.length && retries > 0) {
				return this.contractsUpdated(rootIds, payload, retries - 1);
			}

			for (const contract of contracts) {
				if (contract.id in this.seenContractIds) {
					this.emit('data', {
						id: contract.id,
						contractType: contract.type,
						type: UPDATE_EVENT,
						after: contract,
					});
				} else {
					this.emit('data', {
						id: contract.id,
						contractType: contract.type,
						type:
							!payload.linkData && payload.type === 'update'
								? UPDATE_EVENT
								: INSERT_EVENT,
						after: contract,
					});
				}
				this.seeContractTree(contract);
			}

			if (contracts.length === 0) {
				await this.emitUnmatchFor(rootIds, payload);
			}
		} catch (error: unknown) {
			metrics.markStreamError(
				this.context.getLogContext(),
				this.streamer.table,
			);
			this.emit('error', error);
		}
	}

	private async emitUnmatchFor(rootIds: Set<string>, payload: EventPayload) {
		for (const contractId of rootIds) {
			let contractType: string;
			if (payload.id === contractId) {
				contractType = payload.cardType;
			} else if (payload.cardType === 'link@1.0.0') {
				if (payload.linkData!.from.id === contractId) {
					contractType = payload.linkData!.from.type;
				} else if (payload.linkData!.to.id === contractId) {
					contractType = payload.linkData!.to.type;
				} else {
					contractType = await this.getContractType(contractId);
				}
			} else {
				contractType = await this.getContractType(contractId);
			}

			this.unseeContractId(contractId);
			this.emit('data', {
				id: contractId,
				contractType,
				type: UNMATCH_EVENT,
				after: null,
			});
		}
	}

	private async getContractType(contractId: string): Promise<string> {
		return (await this.context.queryOne(getContractTypeSql, [contractId])).type;
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
			for (const [seenContractId, seenRootSet] of Object.entries(
				this.seenContractIds,
			)) {
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
