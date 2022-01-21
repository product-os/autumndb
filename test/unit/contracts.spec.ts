import * as _ from 'lodash';
import * as skhema from 'skhema';
import { CONTRACTS } from '../../lib/contracts';

describe('default core contracts', () => {
	_.each(CONTRACTS, async (value, key) => {
		test(`The "${key}" contract should validate against the contract type and its own type`, () => {
			const contract = value;
			const contractSchema = CONTRACTS.card.data.schema;
			const typeSchema = CONTRACTS[contract.type.split('@')[0]].data.schema;

			const contractWithCreationDate = Object.assign(
				{
					created_at: new Date().toISOString(),
				},
				contract,
			);
			expect(
				skhema.isValid(contractSchema as any, contractWithCreationDate),
			).toBe(true);

			expect(skhema.isValid(typeSchema as any, contractWithCreationDate)).toBe(
				true,
			);
		});
	});
});
