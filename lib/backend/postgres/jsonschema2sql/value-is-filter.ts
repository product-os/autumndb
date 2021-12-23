import * as pgFormat from 'pg-format';
import type { SqlFragmentBuilder } from './fragment-builder';
import { SqlFilter } from './sql-filter';
import type { SqlPath } from './sql-path';

/**
 * Filter asserting that the value of a field, optionally cast into another
 * type, is related to a constant value by an operator.
 */
export class ValueIsFilter extends SqlFilter {
	/**
	 * Constructor.
	 *
	 * @param {SqlPath} path - Path to be tested.
	 * @param {String} operator - The operator to test `path` against `value`.
	 * @param {any} value - A constant to test `path` against.
	 * @param {String} cast - An optional type that both `path` and `value`
	 *        must be cast into before comparison.
	 */
	constructor(
		public path: SqlPath,
		public operator: string,
		public value: any,
		public cast?: string,
	) {
		super();

		this.path = path.cloned();
		this.operator = operator;
		this.value = value;
		this.cast = cast;
	}

	toSqlInto(builder: SqlFragmentBuilder) {
		if (this.cast) {
			const field = this.path.toSql(builder.getTable(), {
				asText: true,
			});
			builder
				.pushCasted(field, this.cast)
				.pushSpaced(this.operator)
				.pushCasted(pgFormat.literal(this.value), this.cast);
		} else {
			builder
				.extendFrom(this.path)
				.pushSpaced(this.operator)
				.push(SqlFilter.maybeJsonLiteral(this.path, this.value));
		}
	}
}
