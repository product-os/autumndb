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
	list: any[];
	from: Array<
		[string | SqlSelectBuilder | SqlCteBuilder, string | undefined, boolean]
	>;
	joins: any[];
	filter: null | SqlFilter | LiteralSql;
	groupBy: Array<[string, SqlPath | LiteralSql]>;
	orderBy: Array<[string, SqlPath | LiteralSql, boolean]>;
	offset: number;
	limit: null | number;

	constructor() {
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
	pushSelect(item: string, alias?: string) {
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
	pushFrom(
		table: string | SqlSelectBuilder | SqlCteBuilder,
		alias?: string,
		isLateral: boolean = false,
	) {
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
	pushInnerJoin(table: string, filter: SqlFilter | LiteralSql, alias?: string) {
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
	pushLeftJoin(table: string, filter: SqlFilter | LiteralSql, alias?: string) {
		this.pushJoin(LEFT_JOIN, table, filter, alias);
		return this;
	}

	pushJoin(
		type: typeof LEFT_JOIN | typeof INNER_JOIN,
		table: string,
		filter: SqlFilter | LiteralSql,
		alias?: string,
	) {
		this.joins.push(new SqlJoin(type, table, filter, alias));
	}

	/**
	 * Set the contents of the `WHERE` clause.
	 *
	 * @param {SqlFilter} filter - The filter.
	 * @returns {SqlSelectBuilder} `this`.
	 */
	setFilter(filter: SqlFilter | LiteralSql) {
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
	pushGroupBy(table: string, path: SqlPath | LiteralSql) {
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
	pushOrderBy(
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
	setOffset(offset: number): SqlSelectBuilder {
		this.offset = offset;
		return this;
	}

	/**
	 * Set the `LIMIT`.
	 *
	 * @param {Number} limit - The value for `LIMIT`.
	 * @returns {SqlSelectBuilder} `this`.
	 */
	setLimit(limit: number): SqlSelectBuilder {
		this.limit = limit;
		return this;
	}

	/**
	 * Format this `SELECT` by pushing string fragments into `builder`.
	 *
	 * @param {SqlFragmentBuilder} builder - Builder for the final SQL string.
	 */
	toSqlInto(builder: SqlFragmentBuilder) {
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
	constructor(
		public type: typeof LEFT_JOIN | typeof INNER_JOIN,
		public table: string,
		public filter: SqlFilter | LiteralSql,
		public alias?: string,
	) {
		this.type = type;
		this.table = table;
		this.filter = filter || new ExpressionFilter(true);
		this.alias = alias;
	}

	toSqlInto(builder: SqlFragmentBuilder) {
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
