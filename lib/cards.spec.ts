/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import { ContractDefinition } from '@balena/jellyfish-types/build/core';
import * as _ from 'lodash';
import * as skhema from 'skhema';
import { CARDS } from './cards';

const addCreatedField = (card: ContractDefinition) => {
	return Object.assign(
		{
			created_at: new Date().toISOString(),
		},
		card,
	);
};

describe('default core contracts', () => {
	_.each(CARDS, async (value, key) => {
		test(`The "${key}" card should validate against the card type and its own type`, () => {
			const card = value;
			const cardSchema = CARDS.card.data.schema;
			const typeSchema = CARDS[card.type.split('@')[0]].data.schema;
			const cardWithCreation = addCreatedField(card);
			expect(skhema.isValid(cardSchema as any, cardWithCreation)).toBe(true);
			expect(skhema.isValid(typeSchema as any, cardWithCreation)).toBe(true);
		});
	});
});
