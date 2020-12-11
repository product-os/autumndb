/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const ava = require('ava')
const textSearch = require('../../../../../lib/backend/postgres/jsonschema2sql/text-search')

ava('toTSVector should prepare a correct to_tsvector function call for Postgres text fields', (test) => {
	const path = 'cards.name'
	const result = textSearch.toTSVector(path, false, false)

	const expected = `to_tsvector('english', ${path})`

	test.is(result, expected)
})

ava('toTSVector should prepare a correct to_tsvector function call for Postgres text[] fields', (test) => {
	const path = 'cards.tags'
	const result = textSearch.toTSVector(path, false, true)

	const expected = `to_tsvector('english', immutable_array_to_string(${path}, ' '))`

	test.is(result, expected)
})

ava('toTSVector should prepare a correct to_tsvector function call for JSONB text fields', (test) => {
	const path = 'cards.data#>\'{"payload", "message"}\''
	const result = textSearch.toTSVector(path, true, false)

	const expected = `jsonb_to_tsvector('english', ${path}, '["string"]')`

	test.is(result, expected)
})

ava('toTSVector should prepare a correct to_tsvector function call for JSONB array fields', (test) => {
	const path = 'cards.data#>\'{"tags"}\''
	const result = textSearch.toTSVector(path, true, true)

	const expected = `jsonb_to_tsvector('english', ${path}, '["string"]')`

	test.is(result, expected)
})

ava('toTSQuery should prepare a correct plainto_tsquery function call', (test) => {
	const term = 'test'
	const result = textSearch.toTSQuery(term)

	const expected = `plainto_tsquery('english', '${term}')`

	test.is(result, expected)
})
