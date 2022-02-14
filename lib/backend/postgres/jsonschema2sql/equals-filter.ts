import * as _ from 'lodash';
import * as pgFormat from 'pg-format';
import { ExpressionFilter } from './expression-filter';
import type { SqlFragmentBuilder } from './fragment-builder';
import { IsNullFilter } from './is-null-filter';
import { SqlFilter } from './sql-filter';
import type { SqlPath, ToSqlOptions } from './sql-path';

/**
 * Filter asserting that the value of a field is equal to one or more possible
 * values.
 */
export class EqualsFilter extends SqlFilter {
	private path: SqlPath;

	/**
	 * Constructor.
	 */
	public constructor(path: SqlPath, private values: any[]) {
		super();

		this.path = path.cloned();
	}

	public toSqlInto(builder: SqlFragmentBuilder): void {
		let canBeSqlNull = false;
		const textValues = [];
		const nonTextValues = [];
		for (const value of this.values) {
			if (value === null && !this.path.isProcessingJsonProperty) {
				canBeSqlNull = true;
			} else if (_.isString(value)) {
				textValues.push(pgFormat.literal(value));
			} else {
				nonTextValues.push(SqlFilter.maybeJsonLiteral(this.path, value));
			}
		}

		const filter = new ExpressionFilter(false);
		if (canBeSqlNull) {
			filter.or(new IsNullFilter(this.path, true));
		}
		if (textValues.length > 0) {
			let innerFilter = null;
			if (textValues.length === 1) {
				innerFilter = new IsEqualFilter(this.path, true, textValues[0]);
			} else {
				innerFilter = new IsInFilter(this.path, true, textValues);
			}
			filter.or(innerFilter);
		}
		if (nonTextValues.length > 0) {
			let innerFilter = null;
			if (nonTextValues.length === 1) {
				innerFilter = new IsEqualFilter(this.path, false, nonTextValues[0]);
			} else {
				innerFilter = new IsInFilter(this.path, false, nonTextValues);
			}
			filter.or(innerFilter);
		}

		builder.extendFrom(filter);
	}
}

class IsEqualFilter extends SqlFilter {
	public constructor(
		private path: SqlPath,
		private asText: boolean,
		private value: any,
	) {
		super();
	}

	public toSqlInto(builder: SqlFragmentBuilder): void {
		const options: ToSqlOptions = this.asText
			? {
					asText: true,
			  }
			: {};
		builder
			.push(this.path.toSql(builder.getTable(), options))
			.push(' = ')
			.push(this.value);
	}
}

class IsInFilter extends SqlFilter {
	public constructor(
		private path: SqlPath,
		private asText: boolean,
		private values: any,
	) {
		super();
	}

	public toSqlInto(builder: SqlFragmentBuilder): void {
		const options: ToSqlOptions = this.asText
			? {
					asText: true,
			  }
			: {};
		builder
			.push(this.path.toSql(builder.getTable(), options))
			.push(' IN ')
			.pushParenthisedList(this.values);
	}
}
