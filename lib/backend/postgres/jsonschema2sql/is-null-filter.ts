import type { SqlFragmentBuilder } from './fragment-builder';
import { SqlFilter } from './sql-filter';
import type { SqlPath } from './sql-path';

/**
 * Filter asserting that the value of a field is or is not SQL `NULL`.
 */
export class IsNullFilter extends SqlFilter {
	/**
	 * Constructor.
	 *
	 * @param {SqlPath} path - Path to be tested.
	 * @param {Boolean} isNull - Whether `path` must be `NULL`, or must not be
	 *        `NULL`.
	 */
	constructor(
		public path: SqlPath,
		public isNull: boolean,
	) {
		super();

		this.path = path.cloned();
		this.isNull = isNull;
	}

	toSqlInto(builder: SqlFragmentBuilder) {
		const tail = this.isNull ? ' IS NULL' : ' IS NOT NULL';

		builder.extendFrom(this.path).push(tail);
	}
}
