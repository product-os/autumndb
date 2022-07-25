import type { SqlFragmentBuilder } from './fragment-builder';
import { SqlFilter } from './sql-filter';

/**
 * Filter implementing a boolean if-then-else.
 */
export class IfThenElseFilter extends SqlFilter {
	/**
	 * Constructor.
	 */
	constructor(
		private ifFilter: SqlFilter,
		private thenFilter: SqlFilter,
		private elseFilter: SqlFilter,
	) {
		super();
	}

	toSqlInto(builder: SqlFragmentBuilder) {
		builder.push('CASE WHEN ');
		this.ifFilter.toSqlInto(builder);
		builder.push(' THEN ');
		this.thenFilter.toSqlInto(builder);
		builder.push(' ELSE ');
		this.elseFilter.toSqlInto(builder);
		builder.push(' END');
	}
}
