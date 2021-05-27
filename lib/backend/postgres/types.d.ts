/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import pgPromise = require('pg-promise');
import pg = require('pg-promise/typescript/pg-subset');

export type BackendConnection = pgPromise.IDatabase<{}, pg.IClient>;
export type BackendTransaction = pgPromise.ITask<{}>;

export interface SearchFieldDef {
	path: string[];
	isArray: boolean;
}

// TS-TODO: strongly type this object
export interface SelectObject {
	type?: { [key: string]: any };
	data?: { [key: string]: any };
	id?: { [key: string]: any };
	slug?: { [key: string]: any };
	links?: { [key: string]: any };
	properties?: { [key: string]: any };
}

export interface SqlQueryOptions {
	/*
	 an array denoting the current path in the JSON
	 schema. Used to produce useful error messages when nesting
	 SqlQuery instances.
	*/
	parentJsonPath?: string[];

	/*
	 an instance of `SqlPath` denoting the current SQL
	 field path. This is used when creating a child SqlQuery that
	 refers to a different table. See {@link SqlQuery#buildQueryFromCorrelatedSchema}.
	*/
	parentPath?: SqlPath;

	/*
	 a string that is used as the initial value for
	 `this.filter`. Useful for constraints with placeholders.
	*/
	extraFilter?: string;

	/*
   path to field that should be used for sorting
	*/
	sortBy?: string | string[];

	/*
   the direction results should be sorted in
	*/
	sortDir?: 'asc' | 'desc';

	/*
   the number of records to skip when querying results
	*/
	skip?: number;

	/*
   the maximum number of records that should be returned by the query
	*/
	limit?: number;

	// TS-TODO: strongly type this option
	links?: any;
}

export interface BackendQueryOptions extends SqlQueryOptions {
	limit: number;

	// if true, the query parameters will be logged on every request
	profile?: boolean;

	// different PG connection to use, typically used for transactions
	connection?: BackendConnection | BackendTransaction | null;
}
