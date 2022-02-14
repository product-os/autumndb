import * as _ from 'lodash';
import type { SqlCteBuilder } from './cte-builder';
import { ExpressionFilter } from './expression-filter';
import type { SqlFragmentBuilder } from './fragment-builder';
import type { LiteralSql } from './literal-sql';
import type { SqlFilter } from './sql-filter';
import type { SqlPath } from './sql-path';

// Types of joins
const INNER_JOIN = 0;
const LEFT_JOIN = 1;

/**
 * Builder for `SELECT` statements.
 */
export class SqlSelectBuilder {
	private list: any[];
	private from: Array<
		[string | SqlSelectBuilder | SqlCteBuilder, string | undefined, boolean]
	>;
	private joins: any[];
	private filter: null | SqlFilter | LiteralSql;
	private groupBy: Array<[string, SqlPath | LiteralSql]>;
	private orderBy: Array<[string, SqlPath | LiteralSql, boolean]>;
	private offset: number;
	private limit: null | number;

	public constructor() {
		this.list = [];
		this.from = [];
		this.joins = [];
		this.filter = null;
		this.groupBy = [];
		this.orderBy = [];
		this.offset = 0;
		this.limit = null;
	}

	/**
	 * Add a entry to the `SELECT` list.
	 *
	 * @param {String} item - The item.
	 * @param {String} alias - Item alias. Optional.
	 * @returns {SqlSelectBuilder} `this`.
	 */
	public pushSelect(item: string, alias?: string): SqlSelectBuilder {
		if (alias) {
			this.list.push(`${item} AS ${alias}`);
		} else {
			this.list.push(item);
		}
		return this;
	}

	/**
	 * Add an entry to the `FROM` clause.
	 *
	 * @param {String|SqlQuery} table - The table. This can be the name of an
	 *        actual table or anything recognized as one, such as subqueries.
	 * @param {String} alias - Table alias. Optional.
	 * @param {Boolean} isLateral - Whether `table` should be marked as
	 *        `LATERAL`. Optional, defaults to false.
	 * @returns {SqlSelectBuilder} `this`.
	 */
	public pushFrom(
		table: string | SqlSelectBuilder | SqlCteBuilder,
		alias?: string,
		isLateral: boolean = false,
	): SqlSelectBuilder {
		this.from.push([table, alias, isLateral]);
		return this;
	}
	/**
	 * Add an `INNER JOIN`.
	 *
	 * @param {String} table - The table to be joined. This can be the name of
	 *        an actual table or anything recognized as one, such as
	 *        subqueries.
	 * @param {SqlFilter} filter - The join condition. Optional, defaults to
	 *        true.
	 * @param {String} alias - Table alias. Optional.
	 * @returns {SqlSelectBuilder} `this`.
	 */
	public pushInnerJoin(
		table: string,
		filter: SqlFilter | LiteralSql,
		alias?: string,
	): SqlSelectBuilder {
		this.pushJoin(INNER_JOIN, table, filter, alias);
		return this;
	}

	/**
	 * Add a `LEFT JOIN`.
	 *
	 * @param {String} table - The table to be joined. This can be the name of
	 *        an actual table or anything recognized as one, such as
	 *        subqueries.
	 * @param {SqlFilter} filter - The join condition. Optional, defaults to
	 *        true.
	 * @param {String} alias - Table alias. Optional.
	 * @returns {SqlSelectBuilder} `this`.
	 */
	public pushLeftJoin(
		table: string,
		filter: SqlFilter | LiteralSql,
		alias?: string,
	): SqlSelectBuilder {
		this.pushJoin(LEFT_JOIN, table, filter, alias);
		return this;
	}

	private pushJoin(
		type: typeof LEFT_JOIN | typeof INNER_JOIN,
		table: string,
		filter: SqlFilter | LiteralSql,
		alias?: string,
	): void {
		this.joins.push(new SqlJoin(type, table, filter, alias));
	}

	/**
	 * Set the contents of the `WHERE` clause.
	 *
	 * @param {SqlFilter} filter - The filter.
	 * @returns {SqlSelectBuilder} `this`.
	 */
	public setFilter(filter: SqlFilter | LiteralSql): SqlSelectBuilder {
		this.filter = filter;
		return this;
	}

	/**
	 * Add a path to `GROUP BY`.
	 *
	 * @param {String} table - The table that `path` references.
	 * @param {SqlPath} path - The path to `GROUP BY`.
	 * @returns {SqlSelectBuilder} `this`.
	 */
	public pushGroupBy(
		table: string,
		path: SqlPath | LiteralSql,
	): SqlSelectBuilder {
		this.groupBy.push([table, path]);
		return this;
	}

	/**
	 * Add a path to `ORDER BY`.
	 *
	 * @param {String} table - The table that `path` references.
	 * @param {SqlPath} path - Path to `ORDER BY`.
	 * @param {Boolean} isDescending - Whether the sort direction is in
	 *        descending order. If false, the sort direction is ascending
	 *        order. Optional, defaults to false (ascending).
	 * @returns {SqlSelectBuilder} `this`.
	 */
	public pushOrderBy(
		table: string,
		path: SqlPath | LiteralSql,
		isDescending: boolean = false,
	): SqlSelectBuilder {
		this.orderBy.push([table, path, isDescending]);
		return this;
	}
	/**
	 * Set the `OFFSET`.
	 *
	 * @param {Number} offset - The value for `OFFSET`.
	 * @returns {SqlSelectBuilder} `this`.
	 */
	public setOffset(offset: number): SqlSelectBuilder {
		this.offset = offset;
		return this;
	}

	/**
	 * Set the `LIMIT`.
	 *
	 * @param {Number} limit - The value for `LIMIT`.
	 * @returns {SqlSelectBuilder} `this`.
	 */
	public setLimit(limit: number): SqlSelectBuilder {
		this.limit = limit;
		return this;
	}

	/**
	 * Format this `SELECT` by pushing string fragments into `builder`.
	 *
	 * @param {SqlFragmentBuilder} builder - Builder for the final SQL string.
	 */
	public toSqlInto(builder: SqlFragmentBuilder): void {
		builder.push('SELECT ');
		if (this.list.length > 0) {
			builder.pushList(this.list);
		} else {
			builder.push('1');
		}
		if (this.from.length > 0) {
			builder.push('\nFROM ');
			this.from.forEach(([table, alias, isLateral], idx) => {
				if (idx > 0) {
					builder.push(',\n');
				}
				if (isLateral) {
					builder.push('LATERAL ');
				}
				if (_.isString(table)) {
					builder.push(table);
				} else {
					builder.push('(\n').extendFrom(table).push('\n)');
				}
				if (alias) {
					builder.push(' AS ').push(alias);
				}
			});
		}
		for (const join of this.joins) {
			builder.extendFrom(join);
		}
		if (this.filter !== null) {
			builder.push('\nWHERE ').extendFrom(this.filter);
		}
		if (this.groupBy.length > 0) {
			builder.push('\nGROUP BY ');
			this.groupBy.forEach(([table, path], idx) => {
				if (idx > 0) {
					builder.push(', ');
				}
				builder.push(path.toSql(table));
			});
		}
		if (this.orderBy.length > 0) {
			builder.push('\nORDER BY ');
			this.orderBy.forEach(([table, path, isDescending], idx) => {
				if (idx > 0) {
					builder.push(', ');
				}
				builder
					.push(path.toSql(table))
					.push(isDescending ? ' DESC' : ' ASC')
					.push(' NULLS LAST');
			});
		}
		if (this.offset > 0) {
			builder.push('\nOFFSET ').push(this.offset.toString());
		}
		if (this.limit !== null) {
			builder.push('\nLIMIT ').push(this.limit.toString());
		}
	}
}

class SqlJoin {
	public constructor(
		private type: typeof LEFT_JOIN | typeof INNER_JOIN,
		private table: string,
		private filter: SqlFilter | LiteralSql,
		private alias?: string,
	) {
		this.type = type;
		this.table = table;
		this.filter = filter || new ExpressionFilter(true);
		this.alias = alias;
	}

	public toSqlInto(builder: SqlFragmentBuilder) {
		if (this.type === LEFT_JOIN) {
			builder.push('\nLEFT JOIN ');
		} else {
			builder.push('\nJOIN ');
		}
		if (_.isString(this.table)) {
			builder.push(this.table);
		} else {
			builder.push('(\n').extendFrom(this.table).push('\n)');
		}
		if (this.alias) {
			builder.push(' AS ').push(this.alias);
		}
		builder.push('\nON ').push(this.filter.toSql(this.alias || this.table));
	}
}
