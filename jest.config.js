/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

module.exports = {
	verbose: true,
	preset: "ts-jest",
	testEnvironment: "node",
	testTimeout: 20000, // DB connection/setup seems to be very slow sometimes in CI
	maxWorkers: 1,
	forceExit: true
};
