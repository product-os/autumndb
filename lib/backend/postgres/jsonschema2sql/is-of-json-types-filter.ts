import * as pgFormat from 'pg-format';
import type { SqlFragmentBuilder } from './fragment-builder';
import { SqlFilter } from './sql-filter';
import type { SqlPath } from './sql-path';

/**
 * Filter asserting that the type of a JSON property is one of the accepted
 * types.
 */
export class IsOfJsonTypesFilter extends SqlFilter {
	private path: SqlPath;

	/**
	 * Constructor.
	 *
	 * @param {SqlPath} path - Path to be tested.
	 * @param {Array} types - Array of accepted JSON types.
	 */
	public constructor(path: SqlPath, private types: string[]) {
		super();

		this.path = path.cloned();
	}

	public toSqlInto(builder: SqlFragmentBuilder): void {
		const field = this.path.toSql(builder.getTable());
		builder.pushInvoked('jsonb_typeof', field);

		const types = this.types.map((type) => {
			return pgFormat.literal(type);
		});
		if (types.length === 1) {
			builder.push(' = ').push(types[0]);
		} else {
			builder.push(' IN ').pushParenthisedList(types);
		}
	}
}
