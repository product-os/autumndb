/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import { SqlFragmentBuilder } from './fragment-builder';

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
	constructor(public sql: string) {
		this.sql = sql;
	}

	toSql(): string {
		return this.sql;
	}

	toSqlInto(builder: SqlFragmentBuilder) {
		builder.push(this.sql);
	}
}
