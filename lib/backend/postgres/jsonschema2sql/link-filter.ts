/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import { SqlFragmentBuilder } from './fragment-builder';
import { SqlFilter } from './sql-filter';

/**
 * Filter asserting that there exists a linked card through a link type that
 * passes a filter.
 */
export class LinkFilter extends SqlFilter {
	/**
	 * Constructor.
	 *
	 * @param {String} linkType - The link type.
	 * @param {SqlFilter} filter - Filter for the link.
	 */
	constructor(public linkType: string, public filter: SqlFilter) {
		super();

		this.linkType = linkType;
		this.filter = filter;
	}

	scrapLinksInto(list: any) {
		list.push(this);
		this.filter.scrapLinksInto(list);
	}

	toSqlInto(builder: SqlFragmentBuilder) {
		const joinAlias = builder.getContext().addLink(this.linkType, this.filter);
		builder.push(joinAlias);
		builder.push('.id IS NOT NULL');
	}
}
