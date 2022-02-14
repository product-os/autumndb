import type { SqlFragmentBuilder } from './fragment-builder';
import { SqlFilter } from './sql-filter';
import type { SqlPath } from './sql-path';

/**
 * Filter asserting that the value of a column is or is not null.
 */
export class MultipleOfFilter extends SqlFilter {
	private path: SqlPath;

	/**
	 * Constructor.
	 *
	 * @param {SqlPath} path - Path to be tested.
	 * @param {Number} multiple - A constant that `path` must be a multiple of.
	 */
	public constructor(path: SqlPath, private multiple: number) {
		super();

		this.path = path.cloned();
	}

	public toSqlInto(builder: SqlFragmentBuilder): void {
		builder
			.pushCasted(this.path.toSql(builder.getTable()), 'numeric')
			.push(' % ')
			.push(this.multiple.toString())
			.push(' = 0');
	}
}
