import { SqlFragmentBuilder } from './fragment-builder';
import { LiteralSql } from './literal-sql';
import { SqlSelectBuilder } from './select-builder';

/**
 * Builder for common table expressions.
 */
export class SqlCteBuilder {
	subqueries: Array<[SqlSelectBuilder, string, boolean]>;

	/**
	 * Constructor.
	 *
	 * @param {SqlSelectBuilder} statement - The statement that makes use of
	 *        the CTE's temporary tables.
	 */
	constructor(public statement: SqlSelectBuilder | LiteralSql) {
		this.subqueries = [];
		this.statement = statement;
	}

	/**
	 * Add a subquery as a temporary table.
	 *
	 * @param {SqlSelectBuilder} select - The subquery.
	 * @param {String} alias - The subquery alias.
	 * @param {Boolean} isMaterialized - Whether the temporary tables are
	 *        explicitly materialized. Optional, defaults to false.
	 * @returns {SqlCteBuilder} `this`.
	 */
	pushSubquery(
		select: SqlSelectBuilder,
		alias: string,
		isMaterialized: boolean = false,
	) {
		this.subqueries.push([select, alias, isMaterialized]);
		return this;
	}
	/**
	 * Format this common table expressiong by pushing string fragments into
	 * `builder`.
	 *
	 * @param {SqlFragmentBuilder} builder - Builder for the final SQL string.
	 */
	toSqlInto(builder: SqlFragmentBuilder) {
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
