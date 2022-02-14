import type { SqlFragmentBuilder } from './fragment-builder';
import { SqlFilter } from './sql-filter';
import type { SqlPath } from './sql-path';

/**
 * Filter asserting that the value of a field is or is not SQL `NULL`.
 */
export class IsNullFilter extends SqlFilter {
	private path: SqlPath;

	/**
	 * Constructor.
	 *
	 * @param {SqlPath} path - Path to be tested.
	 * @param {Boolean} isNull - Whether `path` must be `NULL`, or must not be
	 *        `NULL`.
	 */
	public constructor(path: SqlPath, private isNull: boolean) {
		super();

		this.path = path.cloned();
	}

	public toSqlInto(builder: SqlFragmentBuilder): void {
		const tail = this.isNull ? ' IS NULL' : ' IS NOT NULL';

		builder.extendFrom(this.path).push(tail);
	}
}
