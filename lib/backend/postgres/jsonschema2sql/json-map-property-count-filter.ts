import { SqlFragmentBuilder } from './fragment-builder';
import { SqlFilter } from './sql-filter';
import { SqlPath } from './sql-path';

/**
 * Filter asserting that the number of properties of a JSON field is related to
 * a constant number by an operator.
 */
export class JsonMapPropertyCountFilter extends SqlFilter {
	/**
	 * Constructor.
	 *
	 * @param {SqlPath} path - Path to be tested.
	 * @param {String} operator - The operator to test the number of
	 *        properties in `path` against `value`.
	 * @param {Number} value - A constant to test the number of properties in
	 *        `path` against.
	 */
	constructor(
		public path: SqlPath,
		public operator: string,
		public value: number,
	) {
		super();

		this.path = path.cloned();
		this.operator = operator;
		this.value = value;
	}

	toSqlInto(builder: SqlFragmentBuilder) {
		builder
			.push('cardinality(array(SELECT jsonb_object_keys(')
			.extendFrom(this.path)
			.push(')))')
			.pushSpaced(this.operator)
			.push(this.value.toString());
	}
}
