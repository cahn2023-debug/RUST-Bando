export type CaptureValidationResult = {
  valid: boolean;
  reason?: string;
};

const MIN_CAPTURE_WIDTH = 32;
const MIN_CAPTURE_HEIGHT = 32;
const MAX_SAMPLED_PIXELS = 12000;
const VISIBLE_ALPHA = 16;
const NEAR_WHITE = 246;
const MIN_VISIBLE_RATIO = 0.02;
const MIN_NON_WHITE_RATIO = 0.01;

const isNearWhitePixel = (red: number, green: number, blue: number): boolean =>
  red >= NEAR_WHITE && green >= NEAR_WHITE && blue >= NEAR_WHITE;

export const validateMapCaptureCanvas = (canvas: HTMLCanvasElement): CaptureValidationResult => {
  if (canvas.width < MIN_CAPTURE_WIDTH || canvas.height < MIN_CAPTURE_HEIGHT) {
    return { valid: false, reason: "Ảnh bản đồ quá nhỏ hoặc chưa sẵn sàng." };
  }

  let context = canvas.getContext("2d", { willReadFrequently: true });
  let targetCanvas = canvas;

  if (!context && typeof document !== "undefined") {
    try {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
      if (tempCtx) {
        tempCtx.drawImage(canvas, 0, 0);
        context = tempCtx;
        targetCanvas = tempCanvas;
      }
    } catch {
      // ignore
    }
  }

  if (!context) {
    return { valid: false, reason: "Không đọc được dữ liệu ảnh bản đồ." };
  }

  let imageData: ImageData;
  try {
    imageData = context.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
  } catch {
    return { valid: false, reason: "Không đọc được dữ liệu ảnh bản đồ." };
  }

  const totalPixels = canvas.width * canvas.height;
  const stride = Math.max(1, Math.floor(Math.sqrt(totalPixels / MAX_SAMPLED_PIXELS)));
  let sampled = 0;
  let visible = 0;
  let nonWhite = 0;

  for (let y = 0; y < canvas.height; y += stride) {
    for (let x = 0; x < canvas.width; x += stride) {
      const index = (y * canvas.width + x) * 4;
      const alpha = imageData.data[index + 3];
      sampled += 1;
      if (alpha <= VISIBLE_ALPHA) continue;

      visible += 1;
      if (!isNearWhitePixel(imageData.data[index], imageData.data[index + 1], imageData.data[index + 2])) {
        nonWhite += 1;
      }
    }
  }

  if (sampled === 0 || visible / sampled < MIN_VISIBLE_RATIO) {
    return { valid: false, reason: "Ảnh bản đồ bị trong suốt hoặc chưa render xong." };
  }

  if (nonWhite / sampled < MIN_NON_WHITE_RATIO) {
    return { valid: false, reason: "Ảnh bản đồ bị trắng, chưa có nội dung map hợp lệ." };
  }

  return { valid: true };
};
