module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	roots: [
		"lib",
		"test",
	],
	testTimeout: 20000, // DB connection/setup seems to be very slow sometimes in CI
	maxWorkers: 1,
	forceExit: true
};
