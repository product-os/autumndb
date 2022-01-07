import * as _ from 'lodash';
import type { ArrayLengthFilter } from './array-length-filter';
import { SqlFragmentBuilder } from './fragment-builder';
import type { IsOfJsonTypesFilter } from './is-of-json-types-filter';
import type { LiteralSql } from './literal-sql';
import type { MultipleOfFilter } from './multiple-of-filter';
import { NotFilter } from './not-filter';
import { SqlFilter } from './sql-filter';

// Supported logical binary operators
const AND = 0;
const OR = 1;

// Rules for constant folding
const CONSTANT_FOLD = {
	[AND]: {
		true: (other: any) => {
			return other;
		},
		false: _.constant(false),
	},
	[OR]: {
		true: _.constant(true),
		false: (other: any) => {
			return other;
		},
	},
};

/**
 * Filter asserting that a logical expression is true.
 *
 * Note that all logical combinators (`and`, `or`, `implies`) assume they own
 * their arguments and are free to use/modify them as they please.
 */
export class ExpressionFilter extends SqlFilter {
	operator: 0 | 1;
	expr: any[];
	optionalLinks: any[];

	/**
	 * Constructor.
	 *
	 * @param {any} initialValue - Initial constant value.
	 */
	constructor(initialValue?: string | boolean | LiteralSql | SqlFilter) {
		super();

		this.operator = AND;
		this.expr = [initialValue];
		this.optionalLinks = [];
	}

	intoExpression() {
		return this;
	}

	/**
	 * Negate the whole expression.
	 *
	 * @returns {ExpressionFilter} `this`.
	 */
	negate(): ExpressionFilter {
		// To avoid copying and to make sure `this` references the right
		// expression, we move our internal state into a new `ExpressionFilter`
		// and give that to the `NotFilter` instead of `this`

		const inner = new ExpressionFilter();
		inner.operator = this.operator;
		inner.expr = this.expr;

		this.operator = AND;
		this.expr = [new NotFilter(inner)];

		return this;
	}

	/**
	 * Perform a logical conjunction with another filter. This method assumes
	 * ownership of its argument.
	 *
	 * @param {SqlFilter} other - Filter `this` will be ANDed with.
	 * @returns {ExpressionFilter} `this`.
	 */
	// TS-TODO: Duck type the filter value here
	and(
		other:
			| LiteralSql
			| ArrayLengthFilter
			| IsOfJsonTypesFilter
			| MultipleOfFilter
			| SqlFilter,
	) {
		this.applyBinaryOperator(AND, other);

		return this;
	}

	/**
	 * Perform a logical disjunction with another filter. This method assumes
	 * ownership of its argument.
	 *
	 * @param {SqlFilter} other - Filter `this` will be ORed with.
	 * @returns {ExpressionFilter} `this`.
	 */
	or(
		other:
			| LiteralSql
			| ArrayLengthFilter
			| IsOfJsonTypesFilter
			| MultipleOfFilter
			| SqlFilter,
	) {
		this.applyBinaryOperator(OR, other);

		return this;
	}

	applyBinaryOperator(
		operator: 0 | 1,
		other:
			| LiteralSql
			| ArrayLengthFilter
			| IsOfJsonTypesFilter
			| MultipleOfFilter
			| ExpressionFilter
			| SqlFilter,
	) {
		const otherIsExpression = other instanceof ExpressionFilter;
		if (this.tryConstantFolding(operator, other, otherIsExpression)) {
			return;
		}

		// Do not nest if we can avoid it

		const inlineThis = this.operator === operator || this.expr.length === 1;
		const inlineOther =
			otherIsExpression &&
			((other as ExpressionFilter).operator === operator ||
				(other as ExpressionFilter).expr.length === 1);

		if (!inlineThis) {
			const grouped = new ExpressionFilter();
			grouped.operator = this.operator;
			grouped.expr = this.expr;
			this.expr = [grouped];
		}

		this.operator = operator;
		if (otherIsExpression) {
			this.optionalLinks.push(...(other as ExpressionFilter).optionalLinks);
		}

		if (inlineOther) {
			this.expr.push(...(other as ExpressionFilter).expr);
		} else {
			this.expr.push(other);
		}
	}

	// If applicable, fold constants to simplify the resulting SQL
	tryConstantFolding(
		operator: 0 | 1,
		other:
			| LiteralSql
			| ArrayLengthFilter
			| IsOfJsonTypesFilter
			| MultipleOfFilter
			| ExpressionFilter
			| SqlFilter,
		otherIsExpression: boolean,
	) {
		let folded = null;
		let foldOperator = false;
		let optionalLinks: any[] = [];
		if (this.expr.length === 1 && _.isBoolean(this.expr[0])) {
			const key = this.expr[0].toString() as 'true' | 'false';
			folded = CONSTANT_FOLD[operator][key](other);
			foldOperator = true;

			this.scrapLinksInto(optionalLinks);
			if (other instanceof SqlFilter) {
				if (_.isBoolean(folded)) {
					other.scrapLinksInto(optionalLinks);
				} else if (folded === other && otherIsExpression) {
					optionalLinks.push(...(other as ExpressionFilter).optionalLinks);
				}
			}
		} else if (
			otherIsExpression &&
			(other as ExpressionFilter).expr.length === 1 &&
			_.isBoolean((other as ExpressionFilter).expr[0])
		) {
			const key = (other as ExpressionFilter).expr[0].toString() as
				| 'true'
				| 'false';
			folded = CONSTANT_FOLD[operator][key](this);

			optionalLinks = this.optionalLinks;
			(other as ExpressionFilter).scrapLinksInto(optionalLinks);
			if (_.isBoolean(folded)) {
				this.scrapLinksInto(optionalLinks);
			}
		}

		if (folded === null) {
			return false;
		}

		this.optionalLinks = optionalLinks;

		if (folded instanceof ExpressionFilter) {
			if (foldOperator) {
				this.operator = folded.operator;
			}
			this.expr = folded.expr;
		} else {
			this.expr = [folded];
		}

		return true;
	}

	scrapLinksInto(list: any[]) {
		list.push(...this.optionalLinks);
		for (const item of this.expr) {
			if (item instanceof SqlFilter) {
				item.scrapLinksInto(list);
			}
		}

		this.optionalLinks = [];
	}

	/**
	 * Performs a material conditional: `this -> implicant`. This method
	 * assumes ownership of its argument.
	 *
	 * @param {SqlFilter} implicant - The filter that `this` will imply.
	 * @returns {ExpressionFilter} `this`.
	 */
	implies(
		implicant:
			| LiteralSql
			| ArrayLengthFilter
			| IsOfJsonTypesFilter
			| MultipleOfFilter
			| SqlFilter,
	) {
		return this.negate().or(implicant);
	}

	/**
	 * Make `this` always evaluate to false.
	 *
	 * @returns {ExpressionFilter} `this`.
	 */
	makeUnsatisfiable() {
		// TS-TODO: check if this.op is used anywhere
		(this as any).op = AND;
		this.expr = [false];

		return this;
	}

	/**
	 * Check if `this` always evaluates to false. Note that this check is
	 * actually NP-complete, so this method only evaluates to true either if
	 * `this` was constructed with an initial value of `false`, or if
	 * `this.makeUnsatisfiable()` was called before this method.
	 *
	 * @returns {Boolean} Whether `this` is unsatisfiable.
	 */
	isUnsatisfiable(): boolean {
		return this.expr.length === 1 && this.expr[0] === false;
	}

	toSqlInto(builder: SqlFragmentBuilder) {
		const operator = this.operator === AND ? ' AND ' : ' OR ';
		if (this.expr.length > 1) {
			builder.push('(');
		}

		this.expr.forEach((filter, idx) => {
			if (idx > 0) {
				builder.push(operator);
			}

			if (filter === true) {
				builder.push('true');
			} else if (filter === false) {
				builder.push('false');
			} else {
				builder.extendFrom(filter);
			}
		});

		if (this.expr.length > 1) {
			builder.push(')');
		}

		// SQLize all optional links but discontract the SQL as we only need the
		// modifications to the context
		const context = builder.getContext();
		const dummyBuilder = new SqlFragmentBuilder(context);
		for (const link of this.optionalLinks) {
			link.toSqlInto(dummyBuilder);
		}
	}
}
