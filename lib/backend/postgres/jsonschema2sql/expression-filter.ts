import * as _ from 'lodash';
import { SqlFragmentBuilder } from './fragment-builder';
import type { LiteralSql } from './literal-sql';
import { NotFilter } from './not-filter';
import { SqlFilter } from './sql-filter';

// Supported logical binary operators
enum LogicOperator {
	AND,
	OR,
}

// Rules for constant folding
const CONSTANT_FOLD = {
	[LogicOperator.AND]: {
		true: (other: any) => {
			return other;
		},
		false: _.constant(false),
	},
	[LogicOperator.OR]: {
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
	private operator: LogicOperator = LogicOperator.AND;
	private expr: any[];
	private optionalLinks: any[] = [];

	/**
	 * Constructor.
	 */
	public constructor(
		initialValue: string | boolean | LiteralSql | SqlFilter = true,
	) {
		super();

		this.expr = [initialValue];
	}

	public intoExpression(): ExpressionFilter {
		return this;
	}

	/**
	 * Negate the whole expression.
	 */
	public negate(): ExpressionFilter {
		// To avoid copying and to make sure `this` references the right
		// expression, we move our internal state into a new `ExpressionFilter`
		// and give that to the `NotFilter` instead of `this`

		const inner = new ExpressionFilter();
		inner.operator = this.operator;
		inner.expr = this.expr;

		this.operator = LogicOperator.AND;
		this.expr = [new NotFilter(inner)];

		return this;
	}

	/**
	 * Perform a logical conjunction with another filter. This method assumes
	 * ownership of its argument.
	 */
	public and(other: SqlFilter): ExpressionFilter {
		this.applyBinaryOperator(LogicOperator.AND, other);

		return this;
	}

	/**
	 * Perform a logical disjunction with another filter. This method assumes
	 * ownership of its argument.
	 */
	public or(other: SqlFilter): ExpressionFilter {
		this.applyBinaryOperator(LogicOperator.OR, other);

		return this;
	}

	private applyBinaryOperator(operator: LogicOperator, other: SqlFilter): void {
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
	private tryConstantFolding(
		operator: LogicOperator,
		other: SqlFilter,
		otherIsExpression: boolean,
	): boolean {
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

	/**
	 * Performs a material conditional: `this -> implicant`. This method
	 * assumes ownership of its argument.
	 */
	public implies(implicant: SqlFilter): ExpressionFilter {
		return this.negate().or(implicant);
	}

	/**
	 * Make `this` always evaluate to false.
	 */
	public makeUnsatisfiable(): ExpressionFilter {
		this.expr = [false];

		return this;
	}

	/**
	 * Check if `this` always evaluates to false. Note that this check is
	 * actually NP-complete, so this method only evaluates to true either if
	 * `this` was constructed with an initial value of `false`, or if
	 * `this.makeUnsatisfiable()` was called before this method.
	 */
	public isUnsatisfiable(): boolean {
		return this.expr.length === 1 && this.expr[0] === false;
	}

	public scrapLinksInto(list: any[]): void {
		list.push(...this.optionalLinks);
		for (const item of this.expr) {
			if (item instanceof SqlFilter) {
				item.scrapLinksInto(list);
			}
		}

		this.optionalLinks = [];
	}

	public toSqlInto(builder: SqlFragmentBuilder): void {
		const operator = this.operator === LogicOperator.AND ? ' AND ' : ' OR ';
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

		// SQLize all optional links but discard the SQL as we only need the
		// modifications to the context
		const context = builder.getContext();
		const dummyBuilder = new SqlFragmentBuilder(context);
		for (const link of this.optionalLinks) {
			link.toSqlInto(dummyBuilder);
		}
	}
}
