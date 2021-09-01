/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const base = require('@balena/jellyfish-config/config/jest.config')

module.exports = {
	...base,
	testTimeout: 20000, // DB connection/setup seems to be very slow sometimes in CI
	maxWorkers: 1,
	forceExit: true,
	transformIgnorePatterns: [
			// all exceptions must be first line
		"/node_modules/(?!@sindresorhus/(.*)|escape-string-regexp)",
	],
	transform: {
		"/node_modules/@sindresorhus/(.*)": 'jest-esm-transformer',
		"/node_modules/escape-string-regexp/(.*)": 'jest-esm-transformer'
	}
};
