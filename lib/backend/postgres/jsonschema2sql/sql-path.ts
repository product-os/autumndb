import * as _ from 'lodash';
import * as pgFormat from 'pg-format';
import { SqlFragmentBuilder } from './fragment-builder';

/**
 * Abstraction for SQL field paths. Note that this implicitly depends on the
 * actual database layout and if that changes this may need to be updated too.
 */
export class SqlPath {
	// These are public because having a getter causes a non-trivial drop in
	// performance. They should be treated as read-only.
	public isProcessingJsonProperty: boolean = false;
	public isProcessingTable: boolean = false;
	public isProcessingColumn: boolean = false;
	public isProcessingSubColumn: boolean = false;

	private path: string[];
	private parent: string[];
	private rootIsJson: boolean = false;

	/**
	 * Get the SQL expression for the `version` computed field. If provided,
	 * `table` is assumed to be a properly-escaped identifier.
	 */
	public static getVersionComputedField(table?: string): string {
		const tablePrefix = table ? `${table}.` : '';
		const version = `CONCAT_WS('.', ${tablePrefix}version_major, ${tablePrefix}version_minor, ${tablePrefix}version_patch)`;
		const vWithPreRelease = `CONCAT_WS('-', ${version}, NULLIF(${tablePrefix}version_prerelease, '') )`;
		const vWithPreReleaseAndBuildSuffix = `CONCAT_WS('+', ${vWithPreRelease}, NULLIF(${tablePrefix}version_build, '') )`;

		return vWithPreReleaseAndBuildSuffix;
	}

	/**
	 * Build an `SqlPath` from an array without having to push each element
	 * individually. This is also faster than pushing elements one by one as it
	 * avoids recomputing the `isProcessing*` state with each new `push()`
	 * call.
	 */
	public static fromArray(array: string[]): SqlPath {
		const path = new SqlPath();
		path.path = array;
		path.recalculateIsProcessingState();

		return path;
	}

	private static toJsonSelector(path: string[]): string {
		const selector = path
			.map((element) => {
				return JSON.stringify(element);
			})
			.join(', ');

		return pgFormat.literal(`{${selector}}`);
	}

	/**
	 * Constructor. If this `SqlPath` denotes paths in a subquery, `parent`
	 * must be the `SqlPath` that points to the field that this subquery uses
	 * as table.
	 */
	public constructor(parent?: SqlPath) {
		this.path = [];
		this.parent = parent ? parent.flattened().path : [];
		this.recalculateIsProcessingState();
		this.rootIsJson = this.isProcessingJsonProperty;
	}

	/**
	 * Extend the path by one element.
	 */
	public push(element: string): void {
		this.path.push(element);

		const pathDepth = this.getDepth();
		if (pathDepth === 1) {
			this.isProcessingTable = false;
			this.isProcessingColumn = true;
		} else if (pathDepth === 2) {
			this.isProcessingColumn = false;
			this.isProcessingSubColumn = this.getSecondToLast() !== 'data';
			this.isProcessingJsonProperty = !this.isProcessingSubColumn;
		} else if (pathDepth === 3) {
			this.isProcessingSubColumn = false;
		}
	}

	/**
	 * Pop the last element.
	 */
	public pop(): void {
		this.path.pop();
		this.recalculateIsProcessingState();
	}

	/**
	 * Get the second to last element.
	 */
	public getSecondToLast(): string | null {
		if (this.path.length === 0) {
			return this.parent[this.parent.length - 2];
		} else if (this.path.length === 1) {
			return this.parent[this.parent.length - 1];
		}

		return this.path[this.path.length - 2];
	}

	/**
	 * Get the last element.
	 */
	public getLast(): string | null {
		if (this.path.length === 0) {
			return this.parent[this.parent.length - 1];
		}

		return this.path[this.path.length - 1];
	}

	/**
	 * Set the last element without resizing the underlying array.
	 */
	public setLast(element: string): void {
		this.path[this.path.length - 1] = element;

		const pathDepth = this.getDepth();
		if (pathDepth === 1) {
			this.isProcessingJsonProperty = element === 'data';
		} else if (pathDepth === 2) {
			this.isProcessingSubColumn = this.getSecondToLast() !== 'data';
			this.isProcessingJsonProperty = !this.isProcessingSubColumn;
		}
	}

	private getDepth(): number {
		const depth = this.path.length + this.parent.length;
		const adjustment = this.path.length === 0 && this.parent.length > 0 ? 1 : 0;

		return depth + adjustment;
	}

	private recalculateIsProcessingState(): void {
		const pathDepth = this.getDepth();
		this.isProcessingTable = pathDepth === 0;
		this.isProcessingColumn = pathDepth === 1;
		this.isProcessingSubColumn =
			pathDepth === 2 && this.getSecondToLast() !== 'data';
		const isData = pathDepth === 1 && this.getLast() === 'data';
		const isDataProperty = pathDepth === 2 && !this.isProcessingSubColumn;
		this.isProcessingJsonProperty = isData || isDataProperty || pathDepth > 2;
	}

	/**
	 * Return `this` as an array where each element is a path component.
	 */
	public asArray(): string[] {
		return this.path;
	}

	/**
	 * Return a clone of `this`.
	 */
	public cloned(): SqlPath {
		const clone = _.clone(this);
		clone.path = _.clone(this.path);
		clone.parent = _.clone(this.parent);

		return clone;
	}

	/**
	 * Build a new `SqlPath` where `this` and `parent` are merged.
	 */
	public flattened(): SqlPath {
		if (this.parent.length > 0) {
			return SqlPath.fromArray(_.concat(this.parent, this.path));
		}

		return SqlPath.fromArray(_.clone(this.path));
	}

	/**
	 * Format this filter by pushing string fragments into `builder`.
	 */
	public toSqlInto(
		builder: SqlFragmentBuilder,
		options: ToSqlOptions = {},
	): void {
		const table = builder.getTable();

		if (this.isProcessingColumn && this.getLast() === 'version') {
			builder.push(SqlPath.getVersionComputedField(table));

			return;
		}

		let operator = '#>';
		let start = '';
		let end = '';
		if (options.asText) {
			operator = '#>>';
			if (this.isProcessingJsonProperty || options.forceCast) {
				start = '(';
				end = ')::text';
			}
		}
		builder.push(start).push(table);
		if (this.rootIsJson) {
			builder.push(operator).push(SqlPath.toJsonSelector(this.path));
		} else {
			const column = pgFormat.ident(this.path[0] || table);
			if (this.path.length > 0) {
				builder.push('.').push(column);
			}
			if (this.path.length > 1) {
				builder.push(operator).push(SqlPath.toJsonSelector(this.path.slice(1)));
			}
		}
		builder.push(end);
	}

	/**
	 * Build an SQL field from `this`.
	 */
	toSql(table: string, options: ToSqlOptions = {}): string {
		const builder = new SqlFragmentBuilder(table);
		this.toSqlInto(builder, options);

		return builder.toSql();
	}
}

/**
 * Options when converting an `SqlPath` into an SQL string.
 */
export interface ToSqlOptions {
	/**
	 * Cast the field to text.
	 */
	asText?: true;

	/**
	 * Always cast even if the `SqlPath` is pointing to a column.
	 */
	// TODO: doesn't sound like this makes sense
	forceCast?: true;
}
