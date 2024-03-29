import * as pgFormat from 'pg-format';
import type { SqlFragmentBuilder } from './fragment-builder';
import { SqlFilter } from './sql-filter';
import type { SqlPath } from './sql-path';

/**
 * Filter asserting that the value of a column, as a string, matches a regular
 * expression.
 */
export class MatchesRegexFilter extends SqlFilter {
	operator: '~*' | '~';

	/**
	 * Constructor.
	 *
	 * @param {SqlPath} path - Path to be tested.
	 * @param {String} regex - An SQL-compatible regex to test `path` against.
	 * @param {Object} flags - An optional object containing extra flags.
	 *        Accepted flags are:
	 *        - `ignoreCase`: perform a case-insensitive regex matching.
	 */
	constructor(
		public path: SqlPath,
		public regex: string,
		flags: { ignoreCase?: boolean } = {},
	) {
		super();
		this.path = path.cloned();
		this.operator = flags.ignoreCase ? '~*' : '~';
		this.regex = pgFormat.literal(regex);
	}

	toSqlInto(builder: SqlFragmentBuilder) {
		this.path.toSqlInto(builder, {
			asText: true,
			forceCast: true,
		});
		builder.pushSpaced(this.operator).push(this.regex);
	}
}
