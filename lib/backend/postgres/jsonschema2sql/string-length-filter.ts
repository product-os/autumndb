/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import { SqlFragmentBuilder } from './fragment-builder';
import { SqlFilter } from './sql-filter';
import { SqlPath } from './sql-path';

/**
 * Filter asserting that the string length of a field is related to a constant
 * number by an operator.
 */
export class StringLengthFilter extends SqlFilter {
	/**
	 * Constructor.
	 *
	 * @param {SqlPath} path - Path to be tested.
	 * @param {String} operator - The operator to test the string length of
	 *        `path` against `value`.
	 * @param {Number} value - A constant to test the string length of `path`
	 *        against.
	 */
	constructor(
		public path: SqlPath,
		public operator: string,
		public value: number,
	) {
		super();

		this.path = path.cloned();
		this.operator = operator;
		this.value = value;
	}

	toSqlInto(builder: SqlFragmentBuilder) {
		const field = this.path.toSql(builder.getTable(), {
			asText: true,
		});
		builder
			.pushInvoked('char_length', field)
			.pushSpaced(this.operator)
			.push(this.value.toString());
	}
}
