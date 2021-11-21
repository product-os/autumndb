import pgPromise = require('pg-promise');
import pg = require('pg-promise/typescript/pg-subset');
import type { PostgresBackend } from '.';
import { SqlPath } from './jsonschema2sql/sql-path';

export type DatabaseConnection = pgPromise.IDatabase<{}, pg.IClient>;
export type DatabaseBackend = PostgresBackend;

export interface Queryable {
	any<T = any>(...args: Parameters<DatabaseConnection['any']>): Promise<T[]>;
	one<T = any>(...args: [pgPromise.QueryParam, any?]): Promise<T>;
	task<T>(cb: (t: pgPromise.ITask<{}>) => Promise<T>): Promise<T>;
}

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
}
