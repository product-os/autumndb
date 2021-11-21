import { SqlFragmentBuilder } from './fragment-builder';
import { SqlFilter } from './sql-filter';

/**
 * Filter asserting that another filter is false.
 */
export class NotFilter extends SqlFilter {
	filter: SqlFilter;

	/**
	 * Constructor.
	 *
	 * @param {SqlFilter} filter - The filter to negate. This constructor
	 *        assumes ownership of the filter.
	 */
	constructor(filter: SqlFilter) {
		super();

		this.filter = filter;
	}

	// TS-TODO: strongly type this param
	scrapLinksInto(list: any[]) {
		this.filter.scrapLinksInto(list);
	}

	toSqlInto(builder: SqlFragmentBuilder) {
		builder.push('NOT ').extendParenthisedFrom(this.filter);
	}
}
