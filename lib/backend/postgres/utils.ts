import * as _ from 'lodash';

// FIXME
// this function is intended to make the transition between dates as
// strings to actual dates smoother: it ensures that returned dates
// are still strings in ISO format
// beware that when reading a jsonb column with dates stored as dates
// the output json will end with '+00' rathen than 'Z'
// we should not to this conversion and instead rely on Date objects
export const convertDatesToISOString = (row: any) => {
	if (!row) {
		return row;
	}
	if (row.created_at) {
		row.created_at = new Date(row.created_at).toISOString();
	}
	if (row.updated_at) {
		row.updated_at = new Date(row.updated_at).toISOString();
	}

	return row;
};

/**
 * ParseVersion behaves like parseVersionedSlug but only
 * taking the version part into account
 *
 * @param {String} version - the version string
 * @returns {*} the different parts of the version
 */
export const parseVersion = (version: string) => {
	if (!version) {
		// We treat 'my-slug@latest' and 'my-slug' identically
		return {
			major: 0,
			minor: 0,
			patch: 0,
			prerelease: '',
			build: '',
			latest: true,
		};
	}
	const versionPattern =
		/(?<major>\d+)(\.(?<minor>\d+))?(\.(?<patch>\d+))?(-(?<prerelease>[0-9A-Za-z-]+))?(\+(?<build>[0-9A-Za-z-]+))?|(?<latest>latest)/;

	const match = versionPattern.exec(version);

	if (!match || !match.groups) {
		throw new Error(`slug version suffix is invalid: ${version}`);
	}

	const { major, minor, patch, prerelease, build, latest } = match.groups;

	return {
		major: _.toInteger(major) || 0,
		minor: _.toInteger(minor) || 0,
		patch: _.toInteger(patch) || 0,

		// Why empty string and not null?
		// Because the pg unique constraint ignores NULL values.
		prerelease: prerelease || '',
		build: build || '',
		latest: latest === 'latest',
	};
};
