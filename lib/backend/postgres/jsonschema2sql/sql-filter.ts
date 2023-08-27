import * as pgFormat from 'pg-format';
import { ExpressionFilter } from './expression-filter';
import { SqlFragmentBuilder } from './fragment-builder';
import type { SqlPath } from './sql-path';

/**
 * Base class for SQL boolean expressions, aka filters, constraints, or
 * conditions.
 */
export class SqlFilter {
	/**
	 * Format `value` as either a Postgres JSON literal, or an SQL literal
	 * depending on whether `path` references a JSON property or not.
	 *
	 * @param {SqlPath} path - Choose how to to format the value based on an
	 *        `SqlPath`
	 * @param {any} value - The value to be formatted.
	 * @returns {String} `value` formatted as an SQL-safe string.
	 */
	static maybeJsonLiteral(path: SqlPath, value: any): string {
		const literal = path.isProcessingJsonProperty
			? JSON.stringify(value)
			: value;

		return pgFormat.literal(literal);
	}

	/**
	 * Wrap `this` into an `ExpressionFilter`.
	 *
	 * @returns {ExpressionFilter} `this` wrapped by an `ExpressionFilter`.
	 */
	intoExpression() {
		return new ExpressionFilter(this);
	}

	/**
	 * Fill `_list` with all links, recursively, in this filter.
	 *
	 * @param {Array} _list - Array to be filled with links, if any.
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
	scrapLinksInto(_list: any) {}

	/**
	 * Format this filter by pushing string fragments into `_builder`.
	 *
	 * @param {SqlFragmentBuilder} _builder - Builder for the final SQL string.
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	toSqlInto(_builder: any) {
		throw new Error();
	}

	/**
	 * Build an SQL filter expression from `this`.
	 *
	 * @param {String} table - The table the result will refer to.
	 * @returns {String} `this` as an SQL filter expression.
	 */
	toSql(table: string) {
		return new SqlFragmentBuilder(table).extendFrom(this).toSql();
	}
}
