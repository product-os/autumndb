import * as textSearch from './text-search';

describe('textSearch', () => {
	describe('.toTSVector()', () => {
		it('should prepare a correct to_tsvector function call for Postgres text fields', () => {
			const path = 'contracts.name';
			const result = textSearch.toTSVector(path, false, false);

			const expected = `to_tsvector('english', ${path})`;

			expect(result).toBe(expected);
		});

		it('should prepare a correct to_tsvector function call for Postgres text[] fields', () => {
			const path = 'contracts.tags';
			const result = textSearch.toTSVector(path, false, true);

			const expected = `to_tsvector('english', immutable_array_to_string(${path}, ' '))`;

			expect(result).toBe(expected);
		});

		it('should prepare a correct to_tsvector function call for JSONB text fields', () => {
			const path = 'contracts.data#>\'{"payload", "message"}\'';
			const result = textSearch.toTSVector(path, true, false);

			const expected = `jsonb_to_tsvector('english', ${path}, '["string"]')`;

			expect(result).toBe(expected);
		});

		it('should prepare a correct to_tsvector function call for JSONB array fields', () => {
			const path = 'contracts.data#>\'{"tags"}\'';
			const result = textSearch.toTSVector(path, true, true);

			const expected = `jsonb_to_tsvector('english', ${path}, '["string"]')`;

			expect(result).toBe(expected);
		});
	});

	describe('.toTSQuery()', () => {
		it('should prepare a correct plainto_tsquery function call', () => {
			const term = 'test';
			const result = textSearch.toTSQuery(term);

			const expected = `plainto_tsquery('english', '${term}')`;

			expect(result).toBe(expected);
		});
	});
});
