import { SqlFragmentBuilder } from './fragment-builder';
import { SqlFilter } from './sql-filter';
import { SqlPath } from './sql-path';
import * as textSearch from './text-search';

/**
 * Filter asserting that the value of a field matches a full text search query.
 */
export class FullTextSearchFilter extends SqlFilter {
	/**
	 * Constructor.
	 *
	 * @param {SqlPath} path - Path to be tested.
	 * @param {String} term - The term to be searched.
	 * @param {Boolean} asArray - Whether this filter should be applied to an
	 *        array of strings, or a plain string (the default). Optional.
	 */
	constructor(
		public path: SqlPath,
		public term: string,
		public asArray: boolean = false,
	) {
		super();

		this.path = path.cloned();
		this.term = term;
		this.asArray = asArray;
	}

	toSqlInto(builder: SqlFragmentBuilder) {
		const tsVector = textSearch.toTSVector(
			this.path.toSql(builder.getTable()),
			this.path.isProcessingJsonProperty,
			this.asArray,
		);
		const tsQuery = textSearch.toTSQuery(this.term);
		builder.push(tsVector).push(' @@ ').push(tsQuery);
	}
}
