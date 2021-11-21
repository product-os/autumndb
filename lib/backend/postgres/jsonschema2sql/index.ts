import { JSONSchema } from '@balena/jellyfish-types';
import * as _ from 'lodash';
import { SqlQueryOptions } from '../types';
import { SelectMap } from './select-map';
import { SqlQuery } from './sql-query';

export const compile = (
	table: string,
	select: any,
	schema: JSONSchema,
	options: SqlQueryOptions = {},
) => {
	return SqlQuery.fromSchema(
		null,
		new SelectMap(select),
		schema,
		_.cloneDeep(options),
	).toSqlSelect(table);
};
