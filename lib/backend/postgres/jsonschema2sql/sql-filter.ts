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
	 */
	public static maybeJsonLiteral(path: SqlPath, value: any): string {
		const literal = path.isProcessingJsonProperty
			? JSON.stringify(value)
			: value;

		return pgFormat.literal(literal);
	}

	/**
	 * Wrap `this` into an `ExpressionFilter`.
	 */
	public intoExpression(): ExpressionFilter {
		return new ExpressionFilter(this);
	}

	/**
	 * Fill `_list` with all links, recursively, in this filter.
	 */
	// TS-TODO: find the right type for the argument
	public scrapLinksInto(_list: any): void {
		// Default implementation does nothing
	}

	/**
	 * Format this filter by pushing string fragments into `_builder`.
	 */
	public toSqlInto(_builder: SqlFragmentBuilder): void {
		throw new Error();
	}

	/**
	 * Build an SQL expression from `this`.
	 */
	public toSql(table: string): string {
		return new SqlFragmentBuilder(table).extendFrom(this).toSql();
	}
}
