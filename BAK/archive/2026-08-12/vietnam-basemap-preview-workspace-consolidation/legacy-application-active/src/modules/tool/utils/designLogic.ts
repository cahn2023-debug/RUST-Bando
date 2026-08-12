
/**
 * Design Calculation Utils for Network Infrastructure
 */

export const designLogic = {
  /**
   * Tính toán suy hao Link Budget cơ bản cho tuyến cáp quang
   * @param distanceKm Khoảng cách tuyến (km)
   * @param spliceCount Số lượng mối nối
   * @param connectorCount Số lượng đầu nối (connectors)
   * @param fiberType Loại cáp (G.652, G.655...) - mặc định G.652
   * @returns Tổng suy hao ước tính (dB)
   */
  calculateFiberLinkBudget(
    distanceKm: number,
    spliceCount: number = 0,
    connectorCount: number = 2,
    fiberLossPerKm: number = 0.35, // dB/km at 1310nm
    spliceLoss: number = 0.1,    // dB per splice
    connectorLoss: number = 0.5  // dB per connector
  ): number {
    const fiberLoss = distanceKm * fiberLossPerKm;
    const splicingLossTotal = spliceCount * spliceLoss;
    const connectorLossTotal = connectorCount * connectorLoss;
    const shadowMargin = 3.0; // dB safety margin

    return fiberLoss + splicingLossTotal + connectorLossTotal + shadowMargin;
  },

  /**
   * Tính toán khoảng cách giữa các điểm chốt
   */
  calculateDistance(coords1: [number, number], coords2: [number, number]): number {
    const R = 6371; // Radius of the earth in km
    const dLat = (coords2[0] - coords1[0]) * Math.PI / 180;
    const dLon = (coords2[1] - coords1[1]) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(coords1[0] * Math.PI / 180) * Math.cos(coords2[0] * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  }
};
