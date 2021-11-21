import getPgp = require('pg-promise');
import * as _ from 'lodash';

const pgp = getPgp();
const pgTypes = pgp.pg.types;

const installCustomDateParserIntoPostgresDriver = () => {
	// See node_modules/pg-types/lib/textParsers.js
	const timestampOIDs = [1114, 1184];

	timestampOIDs.forEach((oid) => {
		const originalParseDate = pgTypes.getTypeParser(oid, 'text');
		const newParseDate = _.wrap(originalParseDate, (fun, value) => {
			return fun(value).toISOString();
		});
		pgTypes.setTypeParser(oid, 'text', newParseDate);
	});
};

installCustomDateParserIntoPostgresDriver();

export default pgp;
