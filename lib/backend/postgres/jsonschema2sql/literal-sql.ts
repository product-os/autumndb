import type { SqlFragmentBuilder } from './fragment-builder';

/**
 * Class that wraps literal SQL fragments and provides `toSql` and `toSqlInto`
 * methods.
 */
export class LiteralSql {
	/**
	 * Constructor.
	 *
	 * @param {String} sql - The literal SQL fragment to wrap.
	 */
	public constructor(private sql: string) {}

	public toSql(): string {
		return this.sql;
	}

	public toSqlInto(builder: SqlFragmentBuilder): void {
		builder.push(this.sql);
	}
}
