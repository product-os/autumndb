/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

/**
 * Merge a list of SQL expressions yielding JSONB values with
 * `merge_jsonb_views`.
 *
 * @param {Array} list - List of SQL expressions. Each expression must yield a
 *        JSONB value representing different views of the same underlying
 *        JSONB value in accordance with `merge_jsonb_views`' assumptions.
 * @returns {String} An SQL expression yielding the merge of all SQL expressions
 *          in `list`.
 */
exports.formatMergeJsonbViewsFor = (list) => {
	let sql = ''
	for (let idx = 1; idx < list.length; idx += 1) {
		sql += 'merge_jsonb_views('
	}

	if (list.length > 0) {
		sql += list[0]
	}
	if (list.length > 1) {
		sql += ', '
		sql += list[1]
	}
	for (const expression of list.slice(2)) {
		sql += '), '
		sql += expression
	}
	if (list.length > 1) {
		sql += ')'
	}

	return sql
}
