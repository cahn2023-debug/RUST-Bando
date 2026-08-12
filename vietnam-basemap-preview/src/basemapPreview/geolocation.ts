export function formatGeolocationError(error: Pick<GeolocationPositionError, 'message' | 'code'>): string {
    const reason = error.message?.trim() || ({
        1: 'quyền vị trí bị từ chối',
        2: 'không lấy được vị trí',
        3: 'hết thời gian chờ vị trí',
    }[error.code] ?? 'lỗi không xác định');
    return `Không thể định vị: ${reason}`;
}
