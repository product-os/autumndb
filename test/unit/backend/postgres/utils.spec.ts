import * as utils from '../../../../lib/backend/postgres/utils';

describe('utils.parseVersion', () => {
	it('should parse valid version strings', () => {
		expect(utils.parseVersion('1.2.3')).toEqual({
			major: 1,
			minor: 2,
			patch: 3,
			prerelease: '',
			build: '',
			latest: false,
		});

		// TODO: Add tests that include build and prerelease

		expect(utils.parseVersion('latest')).toEqual({
			major: 0,
			minor: 0,
			patch: 0,
			prerelease: '',
			build: '',
			latest: true,
		});

		expect(utils.parseVersion('1.0.0-alpha')).toEqual({
			major: 1,
			minor: 0,
			patch: 0,
			prerelease: 'alpha',
			build: '',
			latest: false,
		});

		expect(utils.parseVersion('1.0.0-alpha+001')).toEqual({
			major: 1,
			minor: 0,
			patch: 0,
			prerelease: 'alpha',
			build: '001',
			latest: false,
		});

		expect(utils.parseVersion('1.0.0+001')).toEqual({
			major: 1,
			minor: 0,
			patch: 0,
			prerelease: '',
			build: '001',
			latest: false,
		});
	});

	it('should default to 0.0.0@latest on empty version string', () => {
		expect(utils.parseVersion('')).toEqual({
			major: 0,
			minor: 0,
			patch: 0,
			prerelease: '',
			build: '',
			latest: true,
		});
	});

	it('should throw an error on invalid version string', () => {
		expect(() => {
			utils.parseVersion('foobar');
		}).toThrow('slug version suffix is invalid: foobar');
	});
});
