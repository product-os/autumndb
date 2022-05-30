import { TypedError } from 'typed-error';

export interface JellyfishError extends Error {
	/**
	 * True if the error could be expected in normal circumstances.
	 *
	 * i.e. if expected is true, this error isn't a result of a bug
	 * or an out-of-memory or segmentation-fault error etc.
	 */
	expected: boolean;
}

export class BaseTypedError extends TypedError implements JellyfishError {
	expected: boolean = false;
}

export class JellyfishAuthenticationError extends BaseTypedError {}
export class JellyfishBadResultSetSize extends BaseTypedError {}
export class JellyfishCacheError extends BaseTypedError {}
export class JellyfishDatabaseError extends BaseTypedError {}
export class JellyfishDatabaseTimeoutError extends BaseTypedError {}
export class JellyfishElementAlreadyExists extends BaseTypedError {}
export class JellyfishInvalidEnvironmentVariable extends BaseTypedError {}
export class JellyfishInvalidExpression extends BaseTypedError {}
export class JellyfishInvalidId extends BaseTypedError {}
export class JellyfishInvalidLimit extends BaseTypedError {}
export class JellyfishInvalidPatch extends BaseTypedError {}
export class JellyfishInvalidRegularExpression extends BaseTypedError {}
export class JellyfishInvalidSchema extends BaseTypedError {}
export class JellyfishInvalidSession extends BaseTypedError {}
export class JellyfishInvalidSlug extends BaseTypedError {}
export class JellyfishInvalidTransactionIsolation extends BaseTypedError {}
export class JellyfishInvalidTransactionNesting extends BaseTypedError {}
export class JellyfishInvalidVersion extends BaseTypedError {}
export class JellyfishNoAction extends BaseTypedError {}
export class JellyfishNoElement extends BaseTypedError {}
export class JellyfishNoIdentifier extends BaseTypedError {}
export class JellyfishNoLinkTarget extends BaseTypedError {}
export class JellyfishNoView extends BaseTypedError {}
export class JellyfishPermissionsError extends BaseTypedError {}
export class JellyfishSchemaMismatch extends BaseTypedError {}
export class JellyfishSessionExpired extends BaseTypedError {}
export class JellyfishTransactionError extends BaseTypedError {}
export class JellyfishUnknownCardType extends BaseTypedError {}
export class JellyfishUnknownRelationship extends BaseTypedError {}
