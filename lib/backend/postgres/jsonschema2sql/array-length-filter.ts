import type { SqlFragmentBuilder } from './fragment-builder';
import { SqlFilter } from './sql-filter';
import type { SqlPath } from './sql-path';

/**
 * Filter asserting that the array length of a field is related to a constant
 * number by an operator.
 */
export class ArrayLengthFilter extends SqlFilter {
	private path: SqlPath;

	/**
	 * Constructor.
	 */
	public constructor(
		path: SqlPath,
		private operator: '<' | '<=' | '>' | '>=',
		private value: number,
	) {
		super();

		this.path = path.cloned();
		this.operator = operator;
		this.value = value;
	}

	public toSqlInto(builder: SqlFragmentBuilder): void {
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
