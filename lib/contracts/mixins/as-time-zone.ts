import * as ct from 'countries-and-timezones';

// This mixin contains UTC time zone data.
export const asTimeZone = () => {
	return {
		type: 'string',
		enum: Object.keys(ct.getAllTimezones()),
	};
};
