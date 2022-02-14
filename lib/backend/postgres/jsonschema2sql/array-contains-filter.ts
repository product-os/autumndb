import type { SqlFragmentBuilder } from './fragment-builder';
import { SqlSelectBuilder } from './select-builder';
import { SqlFilter } from './sql-filter';
import type { SqlPath } from './sql-path';

/**
 * Filter asserting that the an array contains at least one element with which
 * another filter evaluates to true.
 */
export class ArrayContainsFilter extends SqlFilter {
	private path: SqlPath;

	/**
	 * Constructor.
	 */
	public constructor(path: SqlPath, private filter: SqlFilter) {
		super();

		this.path = path.cloned();
	}

	public scrapLinksInto(list: any[]): void {
		this.filter.scrapLinksInto(list);
	}

	public toSqlInto(builder: SqlFragmentBuilder): void {
		const alias = 'contents';
		const field = this.path.toSql(builder.getTable());
		const unnest = this.path.isProcessingJsonProperty
			? 'jsonb_array_elements'
			: 'unnest';

		const context = builder.getContext();
		context.pushTable(alias);
		builder
			.push('EXISTS ')
			.extendParenthisedFrom(
				new SqlSelectBuilder()
					.pushFrom(`${unnest}(${field})`, alias)
					.setFilter(this.filter),
			);
		context.popTable();
	}
}
