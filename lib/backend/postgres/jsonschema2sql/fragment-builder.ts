import { BuilderContext } from './builder-context';
import type { SqlCteBuilder } from './cte-builder';
import type { LiteralSql } from './literal-sql';
import type { SqlSelectBuilder } from './select-builder';
import type { SqlFilter } from './sql-filter';
import type { SqlPath } from './sql-path';

/**
 * Builder for any kind of SQL fragment.
 */
export class SqlFragmentBuilder {
	private context: BuilderContext;
	private expr: string = '';

	/**
	 * Constructor.
	 */
	public constructor(tableOrContext: string | BuilderContext) {
		this.context =
			tableOrContext instanceof BuilderContext
				? tableOrContext
				: new BuilderContext(tableOrContext);
	}

	public getTable(): string {
		return this.context.getTable();
	}

	public getContext(): BuilderContext {
		return this.context;
	}

	public push(fragment: string): SqlFragmentBuilder {
		this.expr += fragment;

		return this;
	}

	public pushParenthised(fragment: string): SqlFragmentBuilder {
		this.expr += `(${fragment})`;

		return this;
	}

	public pushList(fragments: string[]): SqlFragmentBuilder {
		this.expr += fragments.join(', ');

		return this;
	}

	public pushParenthisedList(fragments: string[]): SqlFragmentBuilder {
		this.expr += '(';
		this.pushList(fragments);
		this.expr += ')';

		return this;
	}

	public pushCasted(fragment: string, cast: string): SqlFragmentBuilder {
		this.expr += `(${fragment})::${cast}`;

		return this;
	}

	public pushSpaced(fragment: string): SqlFragmentBuilder {
		this.expr += ` ${fragment} `;

		return this;
	}

	public pushInvoked(
		functionName: string,
		argument: string,
	): SqlFragmentBuilder {
		this.expr += `${functionName}(${argument})`;

		return this;
	}

	public extendFrom(
		other:
			| SqlFragmentBuilder
			| SqlFilter
			| SqlSelectBuilder
			| SqlPath
			| SqlCteBuilder
			| LiteralSql,
	): SqlFragmentBuilder {
		other.toSqlInto(this);

		return this;
	}

	public extendParenthisedFrom(
		other: SqlSelectBuilder | SqlFilter,
	): SqlFragmentBuilder {
		this.expr += '(';
		other.toSqlInto(this);
		this.expr += ')';

		return this;
	}

	public toSql(): string {
		return this.expr;
	}

	public toSqlInto(builder: SqlFragmentBuilder): void {
		builder.push(this.expr);
	}
}
