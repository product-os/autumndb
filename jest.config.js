const base = require('@balena/jellyfish-config/config/jest.config')

module.exports = {
	...base,
	testTimeout: 20000, // DB connection/setup seems to be very slow sometimes in CI
	maxWorkers: 1,
	forceExit: true
};
