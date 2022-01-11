import type { JsonSchema } from '@balena/jellyfish-types';
import { Context } from '../../../context';
import * as jsonschema2sql from '.';

describe('jsonschema2sql', () => {
	describe('.compile()', () => {
		it('should use to_tsvector and to_tsquery functions when performing full-text searches', () => {
			// TS-TODO: Casting here is due to `JsonSchema` not defining fullTextSearch as an object
			const query: JsonSchema = {
				type: 'object',
				additionalProperties: true,
				required: ['active', 'type'],
				anyOf: [
					{
						properties: {
							name: {
								type: 'string',
								fullTextSearch: {
									term: 'test',
								},
							},
						},
						required: ['name'],
					},
				],
			} as any;

			const options = {
				limit: 1,
			};

			const sql = jsonschema2sql.compile(
				new Context({
					id: 'jsonschema2sql-test',
				}),
				'cards',
				{},
				query,
				options,
			);
			expect(sql.includes('to_tsvector')).toBe(true);
			expect(sql.includes('to_tsquery')).toBe(true);
		});
	});
});
