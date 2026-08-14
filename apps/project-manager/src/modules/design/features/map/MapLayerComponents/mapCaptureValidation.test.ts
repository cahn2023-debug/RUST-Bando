import { describe, expect, it } from "vitest";
import { validateMapCaptureCanvas } from "./mapCaptureValidation";

const makeCanvas = (
  width: number,
  height: number,
  pixelForIndex: (index: number) => [number, number, number, number],
): HTMLCanvasElement => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const [red, green, blue, alpha] = pixelForIndex(index);
    const offset = index * 4;
    data[offset] = red;
    data[offset + 1] = green;
    data[offset + 2] = blue;
    data[offset + 3] = alpha;
  }

  return {
    width,
    height,
    getContext: () => ({
      getImageData: () => ({ data }),
    }),
  } as unknown as HTMLCanvasElement;
};

describe("validateMapCaptureCanvas", () => {
  it("accepts captures with visible non-white map pixels", () => {
    const canvas = makeCanvas(120, 80, (index) => (
      index % 5 === 0 ? [74, 124, 86, 255] : [235, 239, 228, 255]
    ));

    expect(validateMapCaptureCanvas(canvas).valid).toBe(true);
  });

  it("rejects all-white captures", () => {
    const canvas = makeCanvas(120, 80, () => [255, 255, 255, 255]);

    expect(validateMapCaptureCanvas(canvas)).toMatchObject({ valid: false });
  });

  it("rejects transparent captures", () => {
    const canvas = makeCanvas(120, 80, () => [0, 0, 0, 0]);

    expect(validateMapCaptureCanvas(canvas)).toMatchObject({ valid: false });
  });

  it("rejects captures that are too small", () => {
    const canvas = makeCanvas(20, 20, () => [74, 124, 86, 255]);

    expect(validateMapCaptureCanvas(canvas)).toMatchObject({ valid: false });
  });
});
