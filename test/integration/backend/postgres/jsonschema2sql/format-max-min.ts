/*
 * This is a test suite for the non-standard key words "formatMaximum" and
 * "formatMinimum" that are used by the client for query against dates
 * see: https://github.com/epoberezkin/ajv-keywords#formatmaximum--formatminimum-and-formatexclusivemaximum--formatexclusiveminimum
 */
export default {
	name: 'formatMaximum|formatMinimum',
	schemas: [
		{
			description: 'formatMaximum can filter date-time correctly',
			schema: {
				format: 'date-time',
				formatMaximum: '2019-08-08T00:00:00.000Z',
			},
			tests: [
				{
					description: 'data that is < is valid (Z format)',
					data: '2018-08-08T00:00:00.000Z',
					valid: true,
				},
				{
					description: 'data that is <= is valid (Z format)',
					data: '2019-08-08T00:00:00.000Z',
					valid: true,
				},
				{
					description: 'data that is > is invalid (Z format)',
					data: '2020-08-08T00:00:00.000Z',
					valid: false,
				},
				{
					description: 'data that is < is valid (Postgres timestamp format)',
					data: '2018-08-08 00:00:00.000+00',
					valid: true,
				},
				{
					description: 'data that is <= is valid (Postgres timestamp format)',
					data: '2019-08-08 00:00:00.000+00',
					valid: true,
				},
				{
					description: 'data that is > is invalid (Postgres timestamp format)',
					data: '2020-08-08 00:00:00.000+00',
					valid: false,
				},
			],
		},
		{
			description: 'formatMinimum can filter date-time correctly',
			schema: {
				format: 'date-time',
				formatMinimum: '2019-08-08T00:00:00.000Z',
			},
			tests: [
				{
					description: 'data that is > is valid (Z format)',
					data: '2020-08-08T00:00:00.000Z',
					valid: true,
				},
				{
					description: 'data that is >= is valid (Z format)',
					data: '2019-08-08T00:00:00.000Z',
					valid: true,
				},
				{
					description: 'data that is < is invalid (Z format)',
					data: '2018-08-08T00:00:00.000Z',
					valid: false,
				},
				{
					description: 'data that is > is valid (Postgres timestamp format)',
					data: '2020-08-08 00:00:00.000+00',
					valid: true,
				},
				{
					description: 'data that is >= is valid (Postgres timestamp format)',
					data: '2019-08-08 00:00:00.000+00',
					valid: true,
				},
				{
					description: 'data that is < is invalid (Postgres timestamp format)',
					data: '2018-08-08 00:00:00.000+00',
					valid: false,
				},
			],
		},
	],
};
