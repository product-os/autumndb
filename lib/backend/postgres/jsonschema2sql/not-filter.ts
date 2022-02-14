import type { SqlFragmentBuilder } from './fragment-builder';
import { SqlFilter } from './sql-filter';

/**
 * Filter asserting that another filter is false.
 */
export class NotFilter extends SqlFilter {
	/**
	 * Constructor.
	 *
	 * @param {SqlFilter} filter - The filter to negate. This constructor
	 *        assumes ownership of the filter.
	 */
	public constructor(private filter: SqlFilter) {
		super();
	}

	// TS-TODO: strongly type this param
	public scrapLinksInto(list: any[]): void {
		this.filter.scrapLinksInto(list);
	}

	public toSqlInto(builder: SqlFragmentBuilder): void {
		builder.push('NOT ').extendParenthisedFrom(this.filter);
	}
}
