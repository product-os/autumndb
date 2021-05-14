/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import { SqlFragmentBuilder } from './fragment-builder';
import { SqlFilter } from './sql-filter';
import { SqlPath } from './sql-path';

/**
 * Filter asserting that the value of a column is or is not null.
 */
export class MultipleOfFilter extends SqlFilter {
	/**
	 * Constructor.
	 *
	 * @param {SqlPath} path - Path to be tested.
	 * @param {Number} multiple - A constant that `path` must be a multiple of.
	 */
	constructor(public path: SqlPath, public multiple: number) {
		super();

		this.path = path.cloned();
		this.multiple = multiple;
	}

	toSqlInto(builder: SqlFragmentBuilder) {
		builder
			.pushCasted(this.path.toSql(builder.getTable()), 'numeric')
			.push(' % ')
			.push(this.multiple.toString())
			.push(' = 0');
	}
}
