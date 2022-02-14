import type { SqlFragmentBuilder } from './fragment-builder';
import type { LiteralSql } from './literal-sql';
import type { SqlSelectBuilder } from './select-builder';

/**
 * Builder for common table expressions.
 */
export class SqlCteBuilder {
	private subqueries: Array<[SqlSelectBuilder, string, boolean]> = [];

	/**
	 * Constructor.
	 */
	public constructor(private statement: SqlSelectBuilder | LiteralSql) {}

	/**
	 * Add a subquery as a CTE table.
	 */
	public pushSubquery(
		select: SqlSelectBuilder,
		alias: string,
		isMaterialized: boolean = false,
	): void {
		this.subqueries.push([select, alias, isMaterialized]);
	}
	/**
	 * Format this common table expression by pushing string fragments into
	 * `builder`.
	 */
	public toSqlInto(builder: SqlFragmentBuilder): void {
		if (this.subqueries.length > 0) {
			builder.push('WITH ');
			this.subqueries.forEach(([select, alias, isMaterialized], idx) => {
				builder.push(alias).push(' AS ');
				if (isMaterialized) {
					builder.push(' MATERIALIZED ');
				}
				builder.push('(\n').extendFrom(select).push('\n)');
				if (idx < this.subqueries.length - 1) {
					builder.push(',');
				}
				builder.push('\n');
			});
		}
		builder.extendFrom(this.statement);
	}
}
