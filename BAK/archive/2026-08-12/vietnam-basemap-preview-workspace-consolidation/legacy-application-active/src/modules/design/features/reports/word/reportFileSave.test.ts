import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@IMPLEMENT/lib/tauri";
import { encodeRawBinaryFilePath, RAW_BINARY_PATH_HEADER, saveReportDocxFile } from "./reportFileSave";

vi.mock("@IMPLEMENT/lib/tauri", () => ({
  safeInvoke: vi.fn(),
}));

const decodeRawBinaryFilePath = (encoded: string): string => {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

describe("reportFileSave", () => {
  beforeEach(() => {
    vi.mocked(safeInvoke).mockReset();
  });

  it("encodes Unicode file paths as UTF-8 Base64", () => {
    const path = "D:\\Báo cáo\\Nguyễn Phong Sắc - thiết kế.docx";

    expect(decodeRawBinaryFilePath(encodeRawBinaryFilePath(path))).toBe(path);
  });

  it("sends the docx bytes as the top-level raw invoke body", async () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255]);
    const path = "D:\\Báo cáo\\file test.docx";

    await saveReportDocxFile(path, bytes.buffer);

    expect(safeInvoke).toHaveBeenCalledWith(
      "save_binary_file_raw",
      expect.any(Uint8Array),
      {
        headers: {
          [RAW_BINARY_PATH_HEADER]: encodeRawBinaryFilePath(path),
        },
      },
    );
    const [, body] = vi.mocked(safeInvoke).mock.calls[0];
    expect(body).toBeInstanceOf(Uint8Array);
    expect(Array.from(body as Uint8Array)).toEqual(Array.from(bytes));
  });
});
