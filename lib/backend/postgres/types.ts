import type { QueryOptions } from '../../';
import type { PostgresBackend } from '.';

export type DatabaseBackend = PostgresBackend;

export interface SearchFieldDef {
	path: string[];
	isArray: boolean;
}
export interface SelectObject {
	[key: string]: SelectObject;
}

export interface BackendQueryOptions extends Omit<QueryOptions, 'mask'> {
	limit: number;

	/*
	 a string that is used as the initial value for
	 `this.filter`. Useful for constraints with placeholders.
	*/
	extraFilter?: string;
}
