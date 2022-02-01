import type { QueryOptions } from '../../';
import type { PostgresBackend } from '.';

export type DatabaseBackend = PostgresBackend;

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

export interface BackendQueryOptions extends Omit<QueryOptions, 'mask'> {
	limit: number;

	/*
	 a string that is used as the initial value for
	 `this.filter`. Useful for constraints with placeholders.
	*/
	extraFilter?: string;
}
