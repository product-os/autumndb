/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import { JSONSchema } from '@balena/jellyfish-types';
import * as jsonschema2sql from './index';

describe('jsonschema2sql', () => {
	describe('.compile()', () => {
		it('should use to_tsvector and to_tsquery functions when performing full-text searches', () => {
			// TS-TODO: Casting here is due to `JSONSchema` not defining fullTextSearch as an object
			const query: JSONSchema = {
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

			const sql = jsonschema2sql.compile('cards', {}, query, options);
			expect(sql.includes('to_tsvector')).toBe(true);
			expect(sql.includes('to_tsquery')).toBe(true);
		});
	});
});
