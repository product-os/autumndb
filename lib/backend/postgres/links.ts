import * as _ from 'lodash';
import type { PostgresBackend } from '.';
import { Context } from '../../context';
import type { Contract, LinkContract } from '../../types';

// tslint:disable-next-line: no-var-requires
const { version: coreVersion } = require('../../../package.json');

const LINK_TABLE = 'links2';
const STRING_TABLE = 'strings';

export const TABLE = LINK_TABLE;
export const setup = async (
	context: Context,
	backend: PostgresBackend,
	databaseName: string,
	options: {
		// The name of the "cards" table that should be referenced
		cards: string;
	},
): Promise<void> => {
	context.debug('Creating links table', {
		table: LINK_TABLE,
		databaseName,
	});

	await context.runQuery(`
		CREATE TABLE IF NOT EXISTS ${STRING_TABLE} (
			id SERIAL PRIMARY KEY,
			string TEXT UNIQUE NOT NULL
		);

		CREATE TABLE IF NOT EXISTS ${LINK_TABLE} (
			id UUID,
			forward BOOL,
			fromId UUID REFERENCES ${options.cards} (id) NOT NULL,
			name INTEGER REFERENCES ${STRING_TABLE} (id) NOT NULL,
			toId UUID REFERENCES ${options.cards} (id) NOT NULL,
			PRIMARY KEY (id, forward)
		);

		-- Create types used during queries with links
		DO $$
		BEGIN
			IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'linkedge') THEN
				CREATE TYPE linkEdge AS (source UUID, idx INT, sink UUID);
				CREATE TYPE cardAndLinkEdges AS (cardId UUID, edges linkEdge[]);
			END IF;

			IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'polylinkedge') THEN
				CREATE TYPE polyLinkEdge AS (source UUID, sink UUID, idxs INT[]);
			END IF;
		END$$
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
};

const insertStringQuery = Context.prepareQuery(`
	INSERT INTO ${STRING_TABLE} (string)
	VALUES ($1), ($2)
	ON CONFLICT DO NOTHING
`);

const insertLinkQuery = Context.prepareQuery(`
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
`);

const deleteLinkQuery = Context.prepareQuery(`
	DELETE FROM ${LINK_TABLE}
	WHERE id = $1
`);

export const upsert = async (context: Context, link: LinkContract) => {
	if (link.active) {
		await context.runQuery(insertStringQuery, [
			link.name,
			link.data.inverseName,
		]);
		await context.runQuery(insertLinkQuery, [
			link.id,
			link.data.from.id,
			link.name,
			link.data.to.id,
			link.data.inverseName,
		]);
	} else {
		await context.runQuery(deleteLinkQuery, [link.id]);
	}
};

/**
 * @summary Parse a card link given a link card
 * @function
 * @private
 *
 * @param {Object} linkCard - link card
 * @param {Object} card - other card
 * @param {Object} joinedCard - the card that is linked via linkCard
 * @returns {(Null|Object)} results
 *
 * @example
 * const result = links.parseCard({
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
export const parseCard = (
	linkCard: LinkContract,
	card: Contract,
	joinedCard: Partial<Contract> = {},
) => {
	const fromId = linkCard.data.from.id || linkCard.data.from;
	const toId = linkCard.data.to.id || linkCard.data.to;
	if (fromId === card.id) {
		return {
			name: linkCard.name as string,
			id: toId,
			slug: joinedCard.slug,
			type: joinedCard.type,
			created_at: linkCard.created_at,
		};
	}
	if (toId === card.id) {
		return {
			name: linkCard.data.inverseName as string,
			id: fromId,
			slug: joinedCard.slug,
			type: joinedCard.type,
			created_at: linkCard.created_at,
		};
	}
	return null;
};
/**
 * @summary Add a link to the "links" materialized view
 * @function
 * @public
 *
 * @param {Object} linkCard - link card
 * @param {Object} card - card to modify
 * @param {Object} joinedCard - the card that is linked via linkCard
 * @returns {Object} card
 *
 * @example
 * const card = links.addLink({
 *   type: 'link',
 *   ...
 * }, {
 *   type: 'foo',
 *   ...
 * })
 *
 * console.log(card.links)
 */
export const addLink = (
	linkCard: LinkContract,
	card: Contract,
	joinedCard?: Contract,
) => {
	const result = parseCard(linkCard, card, joinedCard);
	if (!result) {
		return card;
	}
	if (!card.linked_at) {
		card.linked_at = {};
	}
	if (!card.linked_at[result.name]) {
		card.linked_at[result.name] = result.created_at;
	}
	return card;
};
/**
 * @summary Remove a link from the "links" materialized view
 * @function
 * @public
 *
 * @param {Object} linkCard - link card
 * @param {Object} card - card to modify
 * @returns {Object} card
 *
 * @example
 * const card = links.removeLink({
 *   type: 'link',
 *   ...
 * }, {
 *   type: 'foo',
 *   ...
 * })
 *
 * console.log(card.links)
 */
export const removeLink = (
	linkCard: LinkContract,
	card: Contract,
): Contract => {
	const result = parseCard(linkCard, card);
	if (!result || !card.links || !card.links[result.name]) {
		return card;
	}
	const links = card.links[result.name];
	card.links[result.name] = links.filter(
		(contract) => contract.id !== linkCard.id,
	);
	return card;
};
