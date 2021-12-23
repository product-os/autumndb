import * as assert from '@balena/jellyfish-assert';
import type {
	AssertExpression,
	AssertMessage,
	AssertErrorConstructor,
} from '@balena/jellyfish-assert';
import * as logger from '@balena/jellyfish-logger';
import type { LogContext } from '@balena/jellyfish-logger';

const LOGGER = logger.getLogger('jellyfish-core');

/**
 * Union type useful when a function can accept either a `Context` object or
 * a raw `LogContext`.
 */
export type MixedContext = Context | LogContext;

/**
 * Context object encapsulating the current log context.
 */
export class Context {
	/**
	 * Constructor.
	 */
	constructor(private logContext: LogContext) {}

	/**
	 * Build a `Context` from a `MixedContext`.
	 */
	static fromMixed(mixedContext: MixedContext): Context {
		if (mixedContext instanceof Context) {
			return mixedContext;
		}

		return new Context(mixedContext);
	}

	/**
	 * Get the wrapped log context.
	 */
	getLogContext(): LogContext {
		return this.logContext;
	}

	/**
	 * Log a debug message.
	 */
	debug(message: string, data?: object) {
		LOGGER.debug(this.logContext, message, data);
	}

	/**
	 * Log an informational message.
	 */
	info(message: string, data?: object) {
		LOGGER.info(this.logContext, message, data);
	}

	/**
	 * Log a warning message.
	 */
	warn(message: string, data?: object) {
		LOGGER.warn(this.logContext, message, data);
	}

	/**
	 * Log an error message.
	 */
	error(message: string, data?: object) {
		LOGGER.error(this.logContext, message, data);
	}

	/**
	 * Log an exception.
	 */
	exception(message: string, data: Error) {
		LOGGER.exception(this.logContext, message, data);
	}

	/**
	 * Assert an expression.
	 */
	assertInternal(
		expression: AssertExpression,
		error: AssertErrorConstructor,
		message: AssertMessage,
	) {
		assert.INTERNAL(this.logContext, expression, error, message);
	}

	/**
	 * Assert an expression.
	 */
	assertUser(
		expression: AssertExpression,
		error: AssertErrorConstructor,
		message: AssertMessage,
	) {
		assert.USER(this.logContext, expression, error, message);
	}
}
