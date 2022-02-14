import type { SqlFragmentBuilder } from './fragment-builder';
import { SqlFilter } from './sql-filter';
import type { SqlPath } from './sql-path';

/**
 * Filter asserting that the number of properties of a JSON field is related to
 * a constant number by an operator.
 */
export class JsonMapPropertyCountFilter extends SqlFilter {
	private path: SqlPath;

	/**
	 * Constructor.
	 *
	 * @param {SqlPath} path - Path to be tested.
	 * @param {String} operator - The operator to test the number of
	 *        properties in `path` against `value`.
	 * @param {Number} value - A constant to test the number of properties in
	 *        `path` against.
	 */
	public constructor(
		path: SqlPath,
		private operator: string,
		private value: number,
	) {
		super();

		this.path = path.cloned();
	}

	public toSqlInto(builder: SqlFragmentBuilder): void {
		builder
			.push('cardinality(array(SELECT jsonb_object_keys(')
			.extendFrom(this.path)
			.push(')))')
			.pushSpaced(this.operator)
			.push(this.value.toString());
	}
}
