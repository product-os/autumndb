import type { JsonSchema } from '@balena/jellyfish-types';
import * as _ from 'lodash';
import type { Context } from '../../../context';
import type { BackendQueryOptions } from '../types';
import { SelectMap } from './select-map';
import { SqlQuery } from './sql-query';

export const compile = (
	context: Context,
	table: string,
	select: any,
	schema: JsonSchema,
	options: BackendQueryOptions,
) => {
	return SqlQuery.fromSchema(
		context,
		null,
		new SelectMap(select),
		schema,
		_.cloneDeep(options),
	).toSqlSelect(table);
};

export const toExpression = (
	context: Context,
	table: string,
	schema: JsonSchema,
) => {
	const q = SqlQuery.fromSchema(context, null, new SelectMap({}), schema, {
		limit: 1,
	});
	return q.toSqlExpression(table);
};
