import type { ContractDefinition } from '@balena/jellyfish-types/build/core';
import * as _ from 'lodash';
import * as skhema from 'skhema';
import { CONTRACTS } from './contracts';

const addCreatedField = (contract: ContractDefinition) => {
	return Object.assign(
		{
			created_at: new Date().toISOString(),
		},
		contract,
	);
};

describe('default core contracts', () => {
	_.each(CONTRACTS, async (value, key) => {
		test(`The "${key}" contract should validate against the contract type and its own type`, () => {
			const contract = value;
			const contractSchema = CONTRACTS.contract.data.schema;
			const typeSchema = CONTRACTS[contract.type.split('@')[0]].data.schema;
			const contractWithCreation = addCreatedField(contract);
			expect(skhema.isValid(contractSchema as any, contractWithCreation)).toBe(true);
			expect(skhema.isValid(typeSchema as any, contractWithCreation)).toBe(true);
		});
	});
});
