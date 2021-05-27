/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import { TypedError } from 'typed-error';
import { JellyfishError } from '@balena/jellyfish-types';

export class BaseTypedError extends TypedError implements JellyfishError {
	expected: boolean = false;
}

export class InvalidSchema extends BaseTypedError implements JellyfishError {}
