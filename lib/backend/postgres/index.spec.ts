import * as backend from '.';

describe('backend.isIgnorableInitError()', () => {
	it('should return true for expected codes', () => {
		expect(backend.isIgnorableInitError('23505')).toBe(true);
		expect(backend.isIgnorableInitError('42P07')).toBe(true);
	});

	it('should return false for unexpected codes', () => {
		expect(backend.isIgnorableInitError('08000')).toBe(false);
	});
});
