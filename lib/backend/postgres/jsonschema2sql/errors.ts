import { TypedError } from 'typed-error';
import { JellyfishError } from '../../../errors';

export class BaseTypedError extends TypedError implements JellyfishError {
	expected: boolean = false;
}

export class InvalidSchema extends BaseTypedError implements JellyfishError {}
