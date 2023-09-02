import { SqlFragmentBuilder } from './fragment-builder';
import { SqlSelectBuilder } from './select-builder';
import { SqlFilter } from './sql-filter';
import { SqlPath } from './sql-path';

/**
 * Filter asserting that the an array contains at least one element with which
 * another filter evaluates to true.
 */
export class ArrayContainsFilter extends SqlFilter {
	/**
	 * Constructor.
	 *
	 * @param {SqlPath} path - Path to be tested.
	 * @param {SqlFilter} filter - Filter to test elements against.
	 */
	constructor(
		public path: SqlPath,
		public filter: SqlFilter,
	) {
		super();

		this.path = path.cloned();
		this.filter = filter;
	}

	scrapLinksInto(list: any[]) {
		this.filter.scrapLinksInto(list);
	}

	toSqlInto(builder: SqlFragmentBuilder) {
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
