import * as _ from 'lodash';
import type {
	Contract,
	LinkContract,
} from '@balena/jellyfish-types/build/core';
import type { Context } from '../../context';
import type { Queryable } from './types';
import type { PostgresBackend } from '.';

// tslint:disable-next-line: no-var-requires
const { version: coreVersion } = require('../../../package.json');

const LINK_ORIGIN_PROPERTY = '$link';
const LINK_TABLE = 'links2';
const STRING_TABLE = 'strings';

export const TABLE = LINK_TABLE;
export const setup = async (
	context: Context,
	backend: PostgresBackend,
	database: string,
	options: {
		// The name of the "contracts" table that should be referenced
		contracts: string;
	},
) => {
	context.debug('Creating links table', {
		table: LINK_TABLE,
		database,
	});
	const initTasks = [
		backend.any(
			`DO $$
		BEGIN
			IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'linkedge') THEN
				CREATE TYPE linkEdge AS (source UUID, idx INT, sink UUID);
				CREATE TYPE contractAndLinkEdges AS (contractId UUID, edges linkEdge[]);
			END IF;

			IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'polylinkedge') THEN
				CREATE TYPE polyLinkEdge AS (source UUID, sink UUID, idxs INT[]);
			END IF;
		END$$;`,
		),
	];
	await backend.any(`
		CREATE TABLE IF NOT EXISTS ${STRING_TABLE} (
			id SERIAL PRIMARY KEY,
			string TEXT UNIQUE NOT NULL
		)
	`);
	await backend.any(`
		CREATE TABLE IF NOT EXISTS ${LINK_TABLE} (
			id UUID,
			forward BOOL,
			fromId UUID REFERENCES ${options.contracts} (id) NOT NULL,
			name INTEGER REFERENCES ${STRING_TABLE} (id) NOT NULL,
			toId UUID REFERENCES ${options.contracts} (id) NOT NULL,
			PRIMARY KEY (id, forward)
		)
	`);
	for (const [name, column] of [
		['idx_links2_fromid_name_toid', 'fromid, name, toid'],
		['idx_links2_toid_name_fromid', 'toid, name, fromid'],
	]) {
		await backend.createIndex(
			context,
			`${LINK_TABLE}`,
			name,
			coreVersion,
			`USING BTREE (${column})`,
		);
	}
	await Promise.all(initTasks);
};

export const upsert = async (
	_context: Context,
	connection: Queryable,
	link: LinkContract,
) => {
	if (link.active) {
		await connection.any({
			text: `
				INSERT INTO ${STRING_TABLE} (string)
				VALUES ($1), ($2)
				ON CONFLICT DO NOTHING
			`,
			values: [link.name, link.data.inverseName],
		});
		await connection.any({
			text: `
				INSERT INTO ${LINK_TABLE} (
					id,
					forward,
					fromId,
					name,
					toId
				)
				VALUES
					(
						$1,
						true,
						$2,
						(
							SELECT id
							FROM ${STRING_TABLE}
							WHERE string = $3
						),
						$4
					),
					(
						$1,
						false,
						$4,
						(
							SELECT id
							FROM ${STRING_TABLE}
							WHERE string = $5
						),
						$2
					)
				ON CONFLICT (id, forward) DO UPDATE SET
					fromId = EXCLUDED.fromId,
					name = EXCLUDED.name,
					toId = EXCLUDED.toId
			`,
			values: [
				link.id,
				link.data.from.id,
				link.name,
				link.data.to.id,
				link.data.inverseName,
			],
		});
	} else {
		await connection.any({
			text: `DELETE FROM ${LINK_TABLE} WHERE id = $1`,
			values: [link.id],
		});
	}
};
/**
 * @summary Parse a contract link given a link contract
 * @function
 * @private
 *
 * @param {Object} linkContract - link contract
 * @param {Object} contract - other contract
 * @param {Object} joinedContract - the contract that is linked via linkContract
 * @returns {(Null|Object)} results
 *
 * @example
 * const result = links.parseContract({
 *   name: 'is attached to',
 *   data: {
 *     inverseName: 'has attached element',
 *     from: 'xxxx',
 *     to: 'yyyy'
 *   }
 * }, {
 *   id: 'xxxx',
 *   ...
 * })
 *
 * if (result) {
 *   console.log(result.name)
 *   console.log(result.id)
 * }
 *
 * > 'is attached to'
 * > 'yyy'
 */
export const parseContract = (
	linkContract: LinkContract,
	contract: Contract,
	joinedContract: Partial<Contract> = {},
) => {
	const fromId = linkContract.data.from.id || linkContract.data.from;
	const toId = linkContract.data.to.id || linkContract.data.to;
	if (fromId === contract.id) {
		return {
			name: linkContract.name as string,
			id: toId,
			slug: joinedContract.slug,
			type: joinedContract.type,
			created_at: linkContract.created_at,
		};
	}
	if (toId === contract.id) {
		return {
			name: linkContract.data.inverseName as string,
			id: fromId,
			slug: joinedContract.slug,
			type: joinedContract.type,
			created_at: linkContract.created_at,
		};
	}
	return null;
};
/**
 * @summary Add a link to the "links" materialized view
 * @function
 * @public
 *
 * @param {Object} linkContract - link contract
 * @param {Object} contract - contract to modify
 * @param {Object} joinedContract - the contract that is linked via linkContract
 * @returns {Object} contract
 *
 * @example
 * const contract = links.addLink({
 *   type: 'link',
 *   ...
 * }, {
 *   type: 'foo',
 *   ...
 * })
 *
 * console.log(contract.links)
 */
export const addLink = (
	linkContract: LinkContract,
	contract: Contract,
	joinedContract?: Contract,
) => {
	const result = parseContract(linkContract, contract, joinedContract);
	if (!result) {
		return contract;
	}
	if (!contract.linked_at) {
		contract.linked_at = {};
	}
	contract.linked_at[result.name] = result.created_at;
	return contract;
};
/**
 * @summary Remove a link from the "links" materialized view
 * @function
 * @public
 *
 * @param {Object} linkContract - link contract
 * @param {Object} contract - contract to modify
 * @returns {Object} contract
 *
 * @example
 * const contract = links.removeLink({
 *   type: 'link',
 *   ...
 * }, {
 *   type: 'foo',
 *   ...
 * })
 *
 * console.log(contract.links)
 */
export const removeLink = (linkContract: LinkContract, contract: Contract) => {
	const result = parseContract(linkContract, contract);
	if (!result || !contract.links || !contract.links[result.name]) {
		return contract;
	}
	contract.links[result.name] = _.reject(contract.links[result.name], [
		LINK_ORIGIN_PROPERTY,
		linkContract.id,
	]);
	return contract;
};
