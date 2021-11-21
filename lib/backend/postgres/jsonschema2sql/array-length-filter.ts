import { SqlFragmentBuilder } from './fragment-builder';
import { SqlFilter } from './sql-filter';
import { SqlPath } from './sql-path';

/**
 * Filter asserting that the array length of a field is related to a constant
 * number by an operator.
 */
export class ArrayLengthFilter extends SqlFilter {
	/**
	 * Constructor.
	 *
	 * @param {SqlPath} path - Path to be tested.
	 * @param {String} operator - The operator to test the array length of
	 *        `path` against `value`.
	 * @param {Number} value - A constant to test the array length of `path`
	 *        against.
	 */
	constructor(
		public path: SqlPath,
		public operator: any,
		public value: number,
	) {
		super();

		this.path = path.cloned();
		this.operator = operator;
		this.value = value;
	}

	toSqlInto(builder: SqlFragmentBuilder) {
		const field = this.path.toSql(builder.getTable());
		const cardinality = this.path.isProcessingJsonProperty
			? 'jsonb_array_length'
			: 'cardinality';
		builder
			.pushInvoked(cardinality, field)
			.pushSpaced(this.operator)
			.push(this.value.toString());
	}
}
