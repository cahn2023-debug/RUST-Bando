import { describe, expect, it } from 'vitest';
import { formatGeolocationError } from './geolocation';

describe('formatGeolocationError', () => {
    it('preserves browser diagnostics', () => {
        expect(formatGeolocationError({ code: 1, message: 'Permission denied' })).toBe('Không thể định vị: Permission denied');
    });

    it('provides a diagnostic when the browser omits a message', () => {
        expect(formatGeolocationError({ code: 2, message: '' })).toBe('Không thể định vị: không lấy được vị trí');
    });
});
