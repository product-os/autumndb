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
	context: BuilderContext;
	expr: string;

	constructor(tableOrContext: string | BuilderContext) {
		this.context =
			tableOrContext instanceof BuilderContext
				? tableOrContext
				: new BuilderContext(tableOrContext);
		this.expr = '';
	}

	getTable(): string {
		return this.context.getTable();
	}

	getContext(): BuilderContext {
		return this.context;
	}

	push(fragment: string) {
		this.expr += fragment;
		return this;
	}

	pushParenthised(fragment: string) {
		this.expr += `(${fragment})`;
		return this;
	}

	pushList(fragments: string[]) {
		this.expr += fragments.join(', ');
		return this;
	}

	pushParenthisedList(fragments: string[]) {
		this.expr += '(';
		this.pushList(fragments);
		this.expr += ')';
		return this;
	}

	pushCasted(fragment: string, cast: string) {
		this.expr += `(${fragment})::${cast}`;
		return this;
	}

	pushSpaced(fragment: string) {
		this.expr += ` ${fragment} `;
		return this;
	}

	pushInvoked(functionName: string, argument: string) {
		this.expr += `${functionName}(${argument})`;
		return this;
	}

	extendFrom(
		other:
			| SqlFragmentBuilder
			| SqlFilter
			| SqlSelectBuilder
			| SqlPath
			| SqlCteBuilder
			| LiteralSql,
	) {
		other.toSqlInto(this);
		return this;
	}

	extendParenthisedFrom(other: SqlSelectBuilder | SqlFilter) {
		this.expr += '(';
		other.toSqlInto(this);
		this.expr += ')';
		return this;
	}

	toSql(): string {
		return this.expr;
	}

	toSqlInto(builder: SqlFragmentBuilder) {
		builder.push(this.expr);
	}
}
