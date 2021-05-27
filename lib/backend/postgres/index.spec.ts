/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import * as backend from './index';

describe('backend.isIgnorableInitError()', () => {
	it('should return true for expected codes', () => {
		expect(backend.isIgnorableInitError('23505')).toBe(true);
		expect(backend.isIgnorableInitError('42P07')).toBe(true);
	});

	it('should return false for unexpected codes', () => {
		expect(backend.isIgnorableInitError('08000')).toBe(false);
	});
});
