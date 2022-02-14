import type { JsonSchema } from '@balena/jellyfish-types';
import type { JSONSchema7TypeName } from 'json-schema';
import * as _ from 'lodash';
import type { Context } from '../../../context';
import type { BackendQueryOptions } from '../types';
import { ArrayContainsFilter } from './array-contains-filter';
import { ArrayLengthFilter } from './array-length-filter';
import { EqualsFilter } from './equals-filter';
import { ExpressionFilter } from './expression-filter';
import { InvalidSchema } from './errors';
import { FullTextSearchFilter } from './full-text-search-filter';
import { IsNullFilter } from './is-null-filter';
import { IsOfJsonTypesFilter } from './is-of-json-types-filter';
import { JsonMapPropertyCountFilter } from './json-map-property-count-filter';
import { LinkFilter } from './link-filter';
import { LiteralSql } from './literal-sql';
import { MatchesRegexFilter } from './matches-regex-filter';
import { MultipleOfFilter } from './multiple-of-filter';
import { NotFilter } from './not-filter';
import { SelectMap } from './select-map';
import { SqlCteBuilder } from './cte-builder';
import { SqlFragmentBuilder } from './fragment-builder';
import { SqlPath } from './sql-path';
import * as REGEXES from './regexes';
import { SqlSelectBuilder } from './select-builder';
import { StringLengthFilter } from './string-length-filter';
import type { SqlFilter } from './sql-filter';
import * as util from './util';
import { ValueIsFilter } from './value-is-filter';

const FENCE_REWRAP = new LiteralSql(`
	SELECT
		unaggregated.cardId,
		array(
			SELECT row(
				edges.source,
				edges.sink,
				array_agg(edges.idx)
			)::polyLinkEdge
			FROM unnest(unaggregated.edges) AS edges
			GROUP BY edges.source, edges.sink
		) AS linkEdges
	FROM (
		SELECT
			unwrapped.cardId,
			array_agg(unwrapped.edges) AS edges
		FROM (
			SELECT (unnest(fence.arr)).*
			FROM fence
		) AS unwrapped
		GROUP BY unwrapped.cardId
	) AS unaggregated
`);
// Columns of the `cards` table
// TODO: probably worth taking this as an argument and remove the implicit
// assumptions on the table structure from the `SqlQuery` and `SqlPath` classes
const CARD_FIELDS = {
	id: {
		type: 'string',
	},
	version: {
		type: 'string',
	},
	slug: {
		type: 'string',
	},
	type: {
		type: 'string',
	},
	tags: {
		type: 'array',
		items: 'string',
	},
	markers: {
		type: 'array',
		items: 'string',
	},
	name: {
		nullable: true,
		type: 'string',
	},
	links: {
		type: 'object',
	},
	created_at: {
		type: 'string',
	},
	updated_at: {
		type: 'string',
	},
	active: {
		type: 'boolean',
	},
	requires: {
		type: 'array',
		items: 'object',
	},
	capabilities: {
		type: 'array',
		items: 'object',
	},
	data: {
		type: 'object',
	},
	linked_at: {
		type: 'object',
	},
};

interface ParentState {
	jsonPath?: string[];
	path?: SqlPath;
}

const createOrderByDefinitions = (
	table: string,
	sortBy: string | string[],
	isDescending?: boolean,
): WhateverThisIs => {
	const arrSortBy = _.castArray(sortBy);
	if (arrSortBy.length === 1 && arrSortBy[0] === 'version') {
		return [
			// No matter if the user wants the smallest or the largest version,
			// pre-releases are always of lowest interest
			{
				table,
				sql: new LiteralSql(`${table}.version_prerelease`),
				isDescending: false,
			},
			{
				table,
				sql: new LiteralSql(`${table}.version_major`),
				isDescending,
			},
			{
				table,
				sql: new LiteralSql(`${table}.version_minor`),
				isDescending,
			},
			{
				table,
				sql: new LiteralSql(`${table}.version_patch`),
				isDescending,
			},
			{
				table,
				sql: new LiteralSql(`${table}.version_build`),
				isDescending,
			},
		];
	}
	return [
		{
			table,
			sql: SqlPath.fromArray(arrSortBy),
			isDescending,
		},
	];
};

const isDescendingSort = (dir?: string): boolean => {
	return dir === 'desc';
};

const sortOrder = (dir: string): string => {
	return isDescendingSort(dir) ? 'DESC' : 'ASC';
};

const pushLinkedJoins = (
	// TS-TODO: can this be deduplicated with the links definition in builder-context.ts?
	linked: {
		linksAlias: string;
		linkName: string;
		joinAlias: string;
		sqlFilter: string;
	},
	innerSelect: SqlSelectBuilder,
	parentTable: string,
	cardsTable: string,
): void => {
	const linksFilter = new LiteralSql(`
		${linked.linksAlias}.fromId = ${parentTable}.id AND
		${linked.linksAlias}.name = (
			SELECT id
			FROM strings
			WHERE string = ${linked.linkName}
		)
	`);
	innerSelect.pushLeftJoin('links2', linksFilter, linked.linksAlias);
	const joinFilter = new LiteralSql(`(
		${linked.linksAlias}.name = (
			SELECT id
			FROM strings
			WHERE string = ${linked.linkName}
		) AND
		${linked.linksAlias}.toId = ${linked.joinAlias}.id
	) AND (
		${linked.sqlFilter}
	)`);
	innerSelect.pushLeftJoin(cardsTable, joinFilter, linked.joinAlias);
};

const pushLinkedLateral = (
	select: SqlFilter,
	idxStart: number,
	idxEnd: number,
	nestedLaterals: any[],
	lateralAlias: string,
	options: {
		skip: number;
		limit: number;
		sortBy: string | string[];
		sortDir: string;
	},
	cardsTable: string,
	laterals: any[][],
): void => {
	const lateralJoinFilter = new ExpressionFilter(
		new LiteralSql('linked.id = orderedEdges.sink'),
	);
	let lowestSeq = 1;
	if ('skip' in options) {
		lowestSeq = options.skip + 1;
		lateralJoinFilter.and(new LiteralSql(`orderedEdges.seq >= ${lowestSeq}`));
	}
	if ('limit' in options) {
		const highestSeq = lowestSeq + options.limit - 1;
		lateralJoinFilter.and(new LiteralSql(`orderedEdges.seq <= ${highestSeq}`));
	}
	let orderBy = '';
	if (options.sortBy) {
		const formattedPaths = [];
		const order = sortOrder(options.sortDir);
		for (const { sql } of createOrderByDefinitions('linked', options.sortBy)) {
			formattedPaths.push(`${sql.toSql('linked')} ${order} NULLS LAST`);
		}
		orderBy = ` ORDER BY ${formattedPaths.join(', ')}`;
	}
	const edgeIdxs = [];
	for (let idx = idxStart; idx < idxEnd; idx += 1) {
		edgeIdxs.push(idx);
	}
	const orderedEdges = new SqlSelectBuilder()
		.pushSelect('edges.source')
		.pushSelect('edges.sink')
		.pushSelect('edges.idxs')
		.pushSelect(
			`row_number() OVER (PARTITION BY edges.source${orderBy})`,
			'seq',
		)
		.pushFrom('unnest(main.linkEdges)', 'edges')
		.pushLeftJoin(
			cardsTable,
			new LiteralSql('linked.id = edges.sink'),
			'linked',
		)
		.setFilter(new LiteralSql(`edges.idxs && ARRAY[${edgeIdxs.join(', ')}]`));
	// TODO: support differing views
	const edgeViews = [];
	for (const idx of edgeIdxs) {
		edgeViews.push(`
			CASE
				WHEN ${idx} = any(orderedEdges.idxs) THEN ${select.toSql('linked')}
				ELSE '{}'::jsonb
			END
		`);
	}
	const lateral = new SqlSelectBuilder()
		.pushSelect('orderedEdges.source')
		.pushSelect(
			`
				coalesce(
					array_agg(
						(SELECT ${util.formatMergeJsonbViewsFor(edgeViews)})
						ORDER BY orderedEdges.seq
					)
					FILTER (WHERE linked.id IS NOT NULL),
					'{}'::jsonb[]
				)
			`,
			'linkedCards',
		)
		.pushFrom(orderedEdges, 'orderedEdges')
		.pushLeftJoin(cardsTable, lateralJoinFilter, 'linked')
		.pushGroupBy('orderedEdges', SqlPath.fromArray(['source']));
	for (const [nestedLateral, nestedLateralAlias] of nestedLaterals) {
		lateral.pushLeftJoin(
			nestedLateral,
			new LiteralSql(`${nestedLateralAlias}.source = linked.id`),
			nestedLateralAlias,
		);
	}
	laterals.push([lateral, lateralAlias]);
};

const linkedToSql = (
	data: {
		select: SqlFilter;
		linkType: string;
		variants: Array<{ nested: any; linked: any }>;
		options: any;
		parentTable: any;
		cardsTable: string;
	},
	state: { innerSelect: any; linkEdges: any; laterals: any },
) => {
	const idxStart = state.linkEdges.length;
	// TS-TODO: correctly type this
	const nestedLaterals: Array<[any, string]> = [];
	for (const { nested, linked } of data.variants) {
		pushLinkedJoins(
			linked,
			state.innerSelect,
			data.parentTable,
			data.cardsTable,
		);
		const edgeIdx = state.linkEdges.length;
		const edge = `row(${data.parentTable}.id, ${edgeIdx}, ${linked.joinAlias}.id)::linkEdge`;
		state.linkEdges.push(edge);
		for (const [nestedLinkType, nestedVariants] of Object.entries(
			nested || {},
		)) {
			linkedToSql(
				{
					select: data.select.getLink(nestedLinkType),
					linkType: nestedLinkType,
					// TS-TODO: detangle this type
					variants: nestedVariants as any,
					options: _.get(data.options.links, [nestedLinkType], {}),
					parentTable: linked.joinAlias,
					cardsTable: data.cardsTable,
				},
				{
					innerSelect: state.innerSelect,
					linkEdges: state.linkEdges,
					laterals: nestedLaterals,
				},
			);
		}
	}
	const lateralAlias = SelectMap.lateralAliasFor(data.linkType);
	pushLinkedLateral(
		data.select,
		idxStart,
		idxStart + 1,
		nestedLaterals,
		lateralAlias,
		data.options,
		data.cardsTable,
		state.laterals,
	);
};

/**
 * Class encapsulating all data needed to create an SQL query from a JSON
 * schema. This class' constructor is supposed to be private. Use the static
 * method {@link SqlQuery#fromSchema} to parse a JSON schema. Call {@link
 * SqlQuery#toSqlSelect} to generate an SQL query for the parsed JSON schema.
 */
export class SqlQuery {
	private filter: ExpressionFilter;
	private required: string[];
	private filterImpliesExists: boolean;
	private propertiesFilter: null | ExpressionFilter;
	private format: string | null;
	private select: SelectObject;
	private options: BackendQueryOptions;
	private path: SqlPath;
	private types: string[];

	public static fromSchema(
		context: Context,
		parent: null | SqlQuery,
		select: SelectObject,
		schema: boolean | JsonSchema,
		options: BackendQueryOptions,
		parentState: ParentState = {},
	): SqlQuery {
		const query = new SqlQuery(context, parent, select, options, parentState);
		if (schema === false) {
			query.filter.makeUnsatisfiable();
		} else if (schema !== true) {
			// Some keywords must be processed before the rest, for validation,
			// correctness, or optimization
			if ('additionalProperties' in schema) {
				query.setAdditionalProperties(schema.additionalProperties);
			}
			if ('type' in schema) {
				query.setType(schema.type);
			}
			if ('required' in schema) {
				query.setRequired(schema.required as string[]);
			}
			if ('format' in schema) {
				query.setFormat(schema.format as any);
			}
			for (const [key, value] of Object.entries(schema)) {
				query.visit(key, value);
			}
		}
		query.finalize();
		return query;
	}

	/**
	 * Create a new, empty SqlQuery. {@link SqlQuery#fromSchema} should be
	 * used instead of this constructor.
	 *
	 * @param {null|SqlQuery} parent - The parent SqlQuery if we're parsing a
	 *        sub schema. Optional.
	 * @param {SelectMap} select - The properties to be selected.
	 * @param {Object} options - An optional map with taking anything accepted
	 *        by {@link SqlQuery#fromSchema}, plus the following (for internal
	 *        use only):
	 *        - jsonPath: an array denoting the current path in the JSON
	 *          schema. Used to produce useful error messages when nesting
	 *          SqlQuery instances.
	 *        - parentPath: an instance of `SqlPath` denoting the current SQL
	 *          field path. This is used when creating a child SqlQuery that
	 *          refers to a different table. See {@link
	 *          SqlQuery#buildQueryFromCorrelatedSchema}.
	 *        - extraFilter: a string that is used as the initial value for
	 *          `this.filter`. Useful for constraints with placeholders.
	 */
	private constructor(
		private context: Context,
		parent: null | SqlQuery,
		select: SelectObject,
		options: BackendQueryOptions,
		private parentState: ParentState = {},
	) {
		// Set of properties that must exist
		this.required = [];
		// Query filter
		if ('extraFilter' in options) {
			this.filter = new ExpressionFilter(
				new LiteralSql(options.extraFilter as string),
			);
			Reflect.deleteProperty(options, 'extraFilter');
		} else {
			// Defaults to `true` as an empty schema matches anything
			this.filter = new ExpressionFilter(true);
		}
		// True if, and only if `this.filter` implies that the property that
		// this object represents must exist. This is used to elide needless
		// `NOT NULL` checks with the `required`/`properties` keywords
		this.filterImpliesExists = false;
		// Filter for the `properties` keyword. We need to keep this separate
		// until `finalize()` is called to apply some optimizations
		this.propertiesFilter = null;
		// Format, as specified by the `format` keyword
		this.format = null;
		// See the constructor's docs
		this.select = select;
		this.options = options;
		if (!('parentJsonPath' in this.options)) {
			this.parentState.jsonPath = [];
		}
		if (parent === null) {
			// SQL field path that is currently being processed. This may refer
			// to columns or JSONB properties
			this.path = new SqlPath(this.parentState.path);
		} else {
			this.path = parent.path;
		}
		// Array of types this schema can be. Defaults to all accepted types
		this.types = [
			'array',
			'boolean',
			'integer',
			'null',
			'number',
			'object',
			'string',
		];
		if (this.path.isProcessingTable) {
			this.types = ['object'];
		} else if (
			this.path.isProcessingColumn &&
			!this.path.isProcessingJsonProperty
		) {
			const columnType = _.get(CARD_FIELDS, [
				// TS-TODO: remove this cast
				this.path.getLast() as string,
				'type',
			]);
			if (columnType) {
				this.types = [columnType];
			}
		} else if (this.path.isProcessingSubColumn) {
			const itemsType = _.get(CARD_FIELDS, [
				// TS-TODO: remove this cast
				this.path.getSecondToLast() as string,
				'items',
			]);
			if (itemsType) {
				this.types = [itemsType];
			}
		}
	}

	private setAdditionalProperties(schema: boolean): void {
		this.select.setAdditionalProperties(schema);
	}

	private setType(value: JSONSchema7TypeName | JSONSchema7TypeName[]): void {
		this.types = _.intersection(this.types, _.castArray(value));
		const typeFilter = this.getIsTypesFilter(this.types);
		if (typeFilter === false) {
			this.filter.makeUnsatisfiable();
		} else if (typeFilter !== null) {
			this.filterImpliesExists = true;
			this.filter.and(typeFilter);
		}
	}

	private setRequired(required: string[]): void {
		// We clone here because other methods may modify `this.required`
		this.required = _.clone(required);
		for (const name of required) {
			this.select.see(name);
		}
	}

	private setFormat(format: string): void {
		this.context.assertInternal(format in REGEXES.format, InvalidSchema, () => {
			return `value for '${this.formatJsonPath('format')}' is invalid`;
		});
		this.format = format;
		const regex = REGEXES.format[format];
		const filter = new MatchesRegexFilter(this.path, regex);
		this.filter.and(this.ifTypeThen('string', filter));
	}

	private finalize(): void {
		const noPropertiesFilter = this.propertiesFilter === null;
		if (this.required.length === 0 && noPropertiesFilter) {
			return;
		}
		const filter = noPropertiesFilter
			? new ExpressionFilter(true)
			: (this.propertiesFilter as ExpressionFilter);
		this.path.push(null);
		for (const required of this.required) {
			this.path.setLast(required);
			const existsFilter = this.existsFilter();
			if (existsFilter !== null) {
				filter.and(existsFilter);
			}
		}
		this.path.pop();
		this.filter.and(this.ifTypeThen('object', filter));
	}

	private visit(key: string, value: unknown): void {
		const skippedKeywords = [
			'additionalProperties',
			'description',
			'examples',
			'format',
			'required',
			'title',
			'type',
		];
		if (skippedKeywords.includes(key)) {
			// Known keywords that we do not handle (at least here)
			return;
		}
		const visitor = `${key}Visitor` as keyof SqlQuery;
		this.context.assertInternal(visitor in this, InvalidSchema, () => {
			return `invalid key: ${this.formatJsonPath(key)}`;
		});

		this[visitor](value);
	}

	private $$linksVisitor(linkMap: { [s: string]: JsonSchema }): void {
		for (const [linkType, linkSchema] of Object.entries(linkMap)) {
			const linkQuery = this.buildQueryFromLinkedSchema(linkType, linkSchema, [
				'$$links',
				linkType,
			]);
			this.filter.and(new LinkFilter(linkType, linkQuery.filter));
		}
	}

	private allOfVisitor(branches: JsonSchema[]): void {
		for (const [idx, branchSchema] of branches.entries()) {
			const branchQuery = this.buildQueryFromSubSchema(branchSchema, [
				'allOf',
				idx,
			]);
			this.filter.and(branchQuery.filter);
			this.filterImpliesExists =
				this.filterImpliesExists || branchQuery.filterImpliesExists;
		}
	}

	private anyOfVisitor(branches: JsonSchema[]): void {
		let allFilterImpliesExists = true;
		const filter = new ExpressionFilter(false);
		for (const [idx, branchSchema] of branches.entries()) {
			const selectBranch = this.select.newBranch();
			const branchQuery = this.buildQueryFromSubSchema(
				branchSchema,
				['anyOf', idx],
				selectBranch,
			);
			selectBranch.setFilter(branchQuery.filter);
			filter.or(branchQuery.filter);
			allFilterImpliesExists =
				allFilterImpliesExists && branchQuery.filterImpliesExists;
		}
		this.filterImpliesExists =
			this.filterImpliesExists || allFilterImpliesExists;
		this.filter.and(filter);
	}

	private constVisitor(value: unknown): void {
		this.filterImpliesExists = true;
		this.filter.and(new EqualsFilter(this.path, [value]));
	}

	private containsVisitor(schema: JsonSchema): void {
		if (this.tryJsonContainsOptimization(schema)) {
			return;
		}
		let filter = null;
		if (schema instanceof Object && _.has(schema, ['fullTextSearch'])) {
			this.context.assertInternal(
				_.isPlainObject(schema.fullTextSearch),
				Error,
				() => {
					return `value for '${this.formatJsonPath(
						'fullTextSearch',
					)}' must be a map`;
				},
			);
			this.context.assertInternal(
				// TS-TODO: figure out why "term" isn't present on fullTextSearch
				_.isString((schema.fullTextSearch! as any).term),
				Error,
				() => {
					return `value for '${this.formatJsonPath(
						'fullTextSearch',
					)}.term' must be a string`;
				},
			);
			filter = new FullTextSearchFilter(
				this.path,
				(schema.fullTextSearch! as any).term,
				true,
			);
		} else {
			const containsQuery = this.buildQueryFromCorrelatedSchema(schema, [
				'contains',
			]);
			filter = new ArrayContainsFilter(this.path, containsQuery.filter);
		}
		this.filter.and(this.ifTypeThen('array', filter));
	}

	// If applicable, use the `@>` operator as an optimization for schemas
	// containing only the `const` keyword (and maybe a compatible `type`)
	private tryJsonContainsOptimization(schema: JsonSchema): boolean {
		if (
			schema instanceof Object &&
			_.isPlainObject(schema) &&
			'const' in schema &&
			this.path.isProcessingJsonProperty
		) {
			let filter = null;
			const value = schema.const;
			const keyCount = Object.keys(schema).length;

			if (keyCount === 1) {
				filter = new ValueIsFilter(this.path, '@>', value);
			} else if (keyCount === 2 && 'type' in schema) {
				const type = schema.type;
				// eslint-disable-next-line valid-typeof
				if (
					typeof value === type ||
					(type === 'integer' && _.isNumber(value))
				) {
					filter = new ValueIsFilter(this.path, '@>', value);
				} else {
					filter = new ExpressionFilter(false);
				}
			}

			if (filter !== null) {
				this.filter.and(this.ifTypeThen('array', filter));

				return true;
			}
		}

		return false;
	}

	private enumVisitor(values: unknown[]): void {
		this.context.assertInternal(values.length > 0, InvalidSchema, () => {
			return `value for '${this.formatJsonPath(
				'enum',
			)}' must be a non-empty array`;
		});
		this.filterImpliesExists = true;
		this.filter.and(new EqualsFilter(this.path, values as any[]));
	}

	private exclusiveMaximumVisitor(limit: number): void {
		const filter = new ValueIsFilter(this.path, '<', limit);
		this.filter.and(this.ifTypeThen('number', filter));
	}

	private exclusiveMinimumVisitor(limit: number): void {
		const filter = new ValueIsFilter(this.path, '>', limit);
		this.filter.and(this.ifTypeThen('number', filter));
	}

	private formatMaximumVisitor(limit: string): void {
		this.context.assertInternal(this.format !== null, InvalidSchema, () => {
			return `missing '${this.formatJsonPath('format')}' for formatMaximum`;
		});
		const filter = new ValueIsFilter(
			this.path,
			'<=',
			limit,
			this.formatToPostgresType('formatMaximum'),
		);
		this.filter.and(this.ifTypeThen('string', filter));
	}

	private formatMinimumVisitor(limit: string): void {
		this.context.assertInternal(this.format !== null, InvalidSchema, () => {
			return `missing '${this.formatJsonPath('format')}' for formatMinimum`;
		});
		const filter = new ValueIsFilter(
			this.path,
			'>=',
			limit,
			this.formatToPostgresType('formatMinimum'),
		);
		this.filter.and(this.ifTypeThen('string', filter));
	}

	private formatToPostgresType(keyword: string): string {
		if (this.format === 'date') {
			return 'date';
		} else if (this.format === 'time') {
			return 'time';
		} else if (this.format === 'date-time') {
			return 'timestamp';
		}
		throw new InvalidSchema(
			`value for '${this.formatJsonPath('format')}' ('${
				this.format
			}') is not valid for ${keyword}`,
		);
	}

	private itemsVisitor(schema: JsonSchema | JsonSchema[]): void {
		if (Array.isArray(schema)) {
			this.tupleMustMatch(schema);
		} else {
			this.arrayContentsMustMatch(schema);
		}
	}

	private arrayContentsMustMatch(schema: JsonSchema): void {
		const itemsQuery = this.buildQueryFromCorrelatedSchema(schema, ['items']);
		const filter = new ArrayContainsFilter(
			this.path,
			itemsQuery.filter.negate(),
		);
		this.filter.and(this.ifTypeThen('array', new NotFilter(filter)));
	}

	private tupleMustMatch(schemas: JsonSchema[]): void {
		const filter = new ExpressionFilter(true);
		if (!this.select.getAdditionalProperties()) {
			filter.and(new ArrayLengthFilter(this.path, '<=', schemas.length));
		}
		for (const [idx, schema] of schemas.entries()) {
			this.path.push(idx.toString());

			const elementQuery = this.buildQueryFromSubSchema(schema, ['items', idx]);
			this.path.pop();
			const lengthFilter = new ArrayLengthFilter(this.path, '>', idx)
				.intoExpression()
				.implies(elementQuery.filter);
			filter.and(lengthFilter);
		}
		this.filter.and(this.ifTypeThen('array', filter));
	}

	private maximumVisitor(limit: number): void {
		const filter = new ValueIsFilter(this.path, '<=', limit);
		this.filter.and(this.ifTypeThen('number', filter));
	}

	private maxLengthVisitor(limit: number): void {
		const filter = new StringLengthFilter(this.path, '<=', limit);
		this.filter.and(this.ifTypeThen('string', filter));
	}

	private maxItemsVisitor(limit: number): void {
		const filter = new ArrayLengthFilter(this.path, '<=', limit);
		this.filter.and(this.ifTypeThen('array', filter));
	}

	private maxPropertiesVisitor(limit: number): void {
		const filter = new JsonMapPropertyCountFilter(this.path, '<=', limit);
		this.filter.and(this.ifTypeThen('object', filter));
	}

	private minimumVisitor(limit: number): void {
		const filter = new ValueIsFilter(this.path, '>=', limit);
		this.filter.and(this.ifTypeThen('number', filter));
	}

	private minLengthVisitor(limit: number): void {
		const filter = new StringLengthFilter(this.path, '>=', limit);
		this.filter.and(this.ifTypeThen('string', filter));
	}

	private minItemsVisitor(limit: number): void {
		const filter = new ArrayLengthFilter(this.path, '>=', limit);
		this.filter.and(this.ifTypeThen('array', filter));
	}

	private minPropertiesVisitor(limit: number): void {
		const filter = new JsonMapPropertyCountFilter(this.path, '>=', limit);
		this.filter.and(this.ifTypeThen('object', filter));
	}

	private multipleOfVisitor(multiple: number): void {
		const filter = new MultipleOfFilter(this.path, multiple);
		this.filter.and(this.ifTypeThen('number', filter));
	}

	private notVisitor(schema: JsonSchema): void {
		const subQuery = this.buildQueryFromSubSchema(schema, ['not']);
		this.filter.and(subQuery.filter.negate());
	}

	private patternVisitor(pattern: string): void {
		const filter = new MatchesRegexFilter(this.path, pattern);
		this.filter.and(this.ifTypeThen('string', filter));
	}

	private propertiesVisitor(propertiesMap: { [s: string]: JsonSchema }): void {
		this.propertiesFilter = new ExpressionFilter(true);
		this.path.push(null);
		for (const [propertyName, propertySchema] of Object.entries(
			propertiesMap,
		)) {
			this.path.setLast(propertyName);
			const propertyQuery = this.buildQueryFromSubSchema(
				propertySchema,
				['properties', propertyName],
				this.select.getProperty(propertyName),
			);
			const isRequired = this.required.includes(propertyName);
			if (isRequired) {
				_.pull(this.required, propertyName);
			}
			// Add a filter for the existence of a property according to
			// whether it is required or not, and whether the property filter
			// itself implies that the property exists. This is slightly
			// contrived to make sure we only add one such check
			let filter = propertyQuery.filter;
			const cantExist = filter.isUnsatisfiable();
			const ensureExists = isRequired && !propertyQuery.filterImpliesExists;
			const allowNotExists = !isRequired;
			if (cantExist || ensureExists || allowNotExists) {
				const exists = this.existsFilter();

				if (exists !== null) {
					const filterExpression = exists.intoExpression();
					if (cantExist) {
						if (ensureExists) {
							filter.makeUnsatisfiable();
						} else {
							filter = filterExpression.negate();
						}
					} else if (ensureExists) {
						filter.and(filterExpression);
					} else if (allowNotExists) {
						filter = filterExpression.implies(filter);
					}
				}
			}
			this.filterImpliesExists =
				this.filterImpliesExists || propertyQuery.filterImpliesExists;
			this.propertiesFilter.and(filter);
		}
		this.path.pop();
	}

	private regexpVisitor(value: string | { flags: 'i'; pattern: string }): void {
		let filter = null;
		if (typeof value === 'string') {
			filter = new MatchesRegexFilter(this.path, value);
		} else {
			const flags: any = {};
			if (value.flags && value.flags === 'i') {
				flags.ignoreCase = true;
			}
			filter = new MatchesRegexFilter(this.path, value.pattern, flags);
		}
		this.filter.and(this.ifTypeThen('string', filter));
	}

	private fullTextSearchVisitor(value: { term: string }): void {
		this.filter.and(
			this.ifTypeThen(
				'string',
				new FullTextSearchFilter(this.path, value.term),
			),
		);
	}

	private ifTypeThen(type: string, filter: SqlFilter): SqlFilter {
		if (this.types.length === 1 && type === this.types[0]) {
			// No need for a conditional since the field can only be of one
			// type. Also this effectively simplifies `x && (!x || y)` to
			// `x && y`, where `x` is the type filter. PG doesn't apply this
			// optimization
			return filter;
		}
		const typeFilter = this.getIsTypesFilter([type]);
		if (typeFilter === null) {
			return filter;
		} else if (typeFilter === false) {
			// Normally the filter we return is a material conditional, which
			// has the form `!x || y` where `x` is the type filter. If we know
			// that the type filter always evaluates to false, this expression
			// simplifies to true.
			return new ExpressionFilter(true);
		}
		return typeFilter.intoExpression().implies(filter);
	}

	// Returns:
	// - `null` if an explicit check isn't necessary
	// - `false` if the types are incompatible with `this.types`
	// - A filter testing for the type otherwise
	private getIsTypesFilter(types: string[]): null | false | SqlFilter {
		const validTypes = _.intersection(types, this.types);
		if (validTypes.length === 0) {
			return false;
		}
		if (!this.path.isProcessingJsonProperty) {
			// Only JSON properties require type checks
			return null;
		}
		if (validTypes.includes('integer')) {
			// JSON doesn't have the concept of integers, so this requires
			// some extra checks
			const filter = new ExpressionFilter(true);
			filter.and(new IsOfJsonTypesFilter(this.path, ['number']));
			filter.and(new MultipleOfFilter(this.path, 1));
			const nonIntegerTypes = _.without(validTypes, 'integer');
			if (nonIntegerTypes.length > 0) {
				filter.or(new IsOfJsonTypesFilter(this.path, nonIntegerTypes));
			}
			return filter;
		}
		return new IsOfJsonTypesFilter(this.path, validTypes);
	}

	private existsFilter(): SqlFilter | null {
		if (
			this.path.isProcessingColumn &&
			// TS-TODO: remove this cast
			!_.get(CARD_FIELDS, [this.path.getLast() as string, 'nullable'])
		) {
			return null;
		}
		return new IsNullFilter(this.path, false);
	}

	private formatJsonPath(suffix: string | string[]): string {
		return _.concat(this.parentState.jsonPath, _.castArray(suffix)).join('/');
	}

	// Subschemas are just what the name implies. They have the same context as
	// `this` and are just build as a separate object for organizational
	// purposes
	private buildQueryFromSubSchema(
		schema: JsonSchema,
		suffix: string | any[],
		select?: SelectObject,
	): SqlQuery {
		this.parentState.jsonPath?.push(...suffix);
		const query = SqlQuery.fromSchema(
			this.context,
			this,
			select || this.select,
			schema,
			this.options,
		);
		// tslint:disable-next-line: prefer-for-of
		for (const _item of suffix) {
			this.parentState.jsonPath?.pop();
		}
		return query;
	}

	// Correlated schemas are subschemas that are implemented as subqueries at
	// the SQL level, so the tables (or table aliases) they refer to are
	// different, but they still rely on some shared context with `this`
	private buildQueryFromCorrelatedSchema(
		schema: JsonSchema,
		suffix: string | any[],
	): SqlQuery {
		let parentPath = null;
		if (_.isEmpty(this.parentState.path)) {
			parentPath = this.path;
		} else {
			parentPath = this.path.flattened();
		}
		this.parentState.jsonPath?.push(...suffix);
		const query = SqlQuery.fromSchema(
			this.context,
			null,
			this.select,
			schema,
			this.options,
			{
				jsonPath: this.parentState.jsonPath,
				path: parentPath,
			},
		);
		for (const _item of suffix) {
			this.parentState.jsonPath?.pop();
		}
		return query;
	}

	// Linked schemas are almost completely independent schemas. They denote
	// cards that are linked to the current schema
	private buildQueryFromLinkedSchema(
		linkType: string,
		schema: JsonSchema,
		suffix: string | any[],
	): SqlQuery {
		this.parentState.jsonPath?.push(...suffix);
		const select = this.select.getLink(linkType);
		const query = SqlQuery.fromSchema(
			this.context,
			null,
			select,
			schema,
			this.options,
			{
				jsonPath: this.parentState.jsonPath,
			},
		);
		for (const _item of suffix) {
			this.parentState.jsonPath?.pop();
		}
		return query;
	}

	public toSqlSelect(table: string): string {
		// Set common stuff for our `SELECT`
		const select = new SqlSelectBuilder().pushFrom(table);
		this.fillOrderBy(table, select);
		if (this.options.skip) {
			select.setOffset(this.options.skip);
		}
		if (this.options.limit) {
			select.setLimit(this.options.limit);
		}
		const filterBuilder = new SqlFragmentBuilder(table).extendFrom(this.filter);
		const filterContext = filterBuilder.getContext();
		const links = filterContext.getLinks();
		const hoistedFilters = filterContext.getHoistedFilters();
		const tableFilter = filterBuilder.toSql();
		let rootFilter = null;
		if (hoistedFilters.length > 0) {
			rootFilter = `(${tableFilter}) AND (${hoistedFilters})`;
		} else {
			rootFilter = tableFilter;
		}
		rootFilter = new LiteralSql(rootFilter);
		if (_.isEmpty(links)) {
			// Queries without links are fairly simple
			select
				.pushSelect(this.select.toSql(table), 'payload')
				.setFilter(rootFilter);
		} else {
			// Queries with links are more complex for performance reasons.
			// They have two parts separated by a `MATERIALIZED` CTE. The CTE
			// serves as an optimization barrier to avoid bad query plans (at
			// least with PG 12) and to reorganize the data produced by the
			// inner `SELECT` for consumption by the outer part.
			// This inner `SELECT` only duty is to fetch the IDs of all cards
			// and all linked cards that matches the filters. The IDs are
			// organized as a list of `(<parentCard>, <linkType>, <childCard>)`
			// tuples representing graph edges, plus the root card ID so that
			// the correct structure can be reconstructed by the outer select.
			// This is because fetching anything but the primary key has the
			// potential to send PG's query planner right out of the happy
			// path.
			const innerSelect = new SqlSelectBuilder()
				.pushFrom(table)
				.setFilter(rootFilter);
			this.fillInnerOrderAndGroupBy(table, innerSelect);
			this.setInnerLimit(innerSelect);

			const linkEdges: any[] = [];

			const laterals: any[] = [];
			for (const [linkType, variants] of Object.entries(links)) {
				linkedToSql(
					{
						select: this.select.getLink(linkType),
						linkType,
						// TS-TODO: Remove this cast
						variants: variants as any,
						options: _.get(this.options.links, [linkType], {}),
						parentTable: table,
						cardsTable: table,
					},
					{
						innerSelect,
						linkEdges,
						laterals,
					},
				);
			}
			innerSelect.pushSelect(
				`
				array_agg(
					row(
						${table}.id,
						array[
							${linkEdges.join(', ')}
						]
					)::cardAndLinkEdges
				)`,
				'arr',
			);
			// The outer `SELECT`, meanwhile, uses the IDs from the inner
			// `SELECT` to fetch the actual data and build the `links` map.
			const fence = new SqlCteBuilder(FENCE_REWRAP);
			fence.pushSubquery(innerSelect, 'fence', true);
			select
				.pushSelect(this.select.toSql(table), 'payload')
				.pushFrom(fence, 'main')
				.setFilter(new LiteralSql(`${table}.id = main.cardId`));
			for (const [lateral, alias] of laterals) {
				select.pushFrom(lateral, alias, true);
			}
		}
		return new SqlFragmentBuilder(table).extendFrom(select).toSql();
	}

	private fillOrderBy(table: string, select: SqlSelectBuilder): void {
		if (!this.options.sortBy) {
			return;
		}
		const isDescending = this.isDescendingSort();
		for (const orderBy of createOrderByDefinitions(
			table,
			this.options.sortBy,
			isDescending,
		)) {
			select.pushOrderBy(orderBy.table, orderBy.sql, orderBy.isDescending);
		}
	}

	private fillInnerOrderAndGroupBy(
		table: string,
		innerSelect: SqlSelectBuilder,
	): void {
		if (this.options.sortBy) {
			const orderByDefs = createOrderByDefinitions(
				table,
				this.options.sortBy,
				this.isDescendingSort(),
			);
			for (const orderBy of orderByDefs) {
				innerSelect.pushGroupBy(orderBy.table, orderBy.sql);
				innerSelect.pushOrderBy(
					orderBy.table,
					orderBy.sql,
					orderBy.isDescending,
				);
			}
		} else {
			innerSelect.pushGroupBy(table, SqlPath.fromArray(['id']));
		}
	}

	private isDescendingSort(): boolean {
		return isDescendingSort(this.options.sortDir);
	}

	private setInnerLimit(innerSelect: SqlSelectBuilder): void {
		if (!this.options.limit) {
			return;
		}
		let limit = this.options.limit;
		if (this.options.skip) {
			limit += this.options.skip;
		}
		innerSelect.setLimit(limit);
	}
}
