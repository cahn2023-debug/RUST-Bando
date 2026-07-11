use wasm_bindgen::prelude::*;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement, ImageData};

#[wasm_bindgen]
pub struct StreetViewRenderer {
    canvas: HtmlCanvasElement,
    context: CanvasRenderingContext2d,
}

#[wasm_bindgen]
impl StreetViewRenderer {
    #[wasm_bindgen(constructor)]
    pub fn new(canvas: HtmlCanvasElement) -> Result<StreetViewRenderer, JsValue> {
        let context = canvas
            .get_context("2d")?
            .ok_or("Failed to get 2d context")?
            .dyn_into::<CanvasRenderingContext2d>()?;

        Ok(StreetViewRenderer { canvas, context })
    }

    /// Render raw image bytes to canvas.
    /// In a real scenario, you'd decode the image here or use browser's ImageBitmap.
    /// For this example, we'll assume we're drawing a simple buffer or triggering a redraw.
    pub fn render_bytes(&self, data: &[u8], width: u32, height: u32) -> Result<(), JsValue> {
        let image_data = ImageData::new_with_u8_clamped_array_and_sh(
            wasm_bindgen::Clamped(data),
            width,
            height,
        )?;

        self.context.put_image_data(&image_data, 0.0, 0.0)?;
        Ok(())
    }

    /// Clear the canvas
    pub fn clear(&self) {
        self.context.clear_rect(
            0.0,
            0.0,
            self.canvas.width() as f64,
            self.canvas.height() as f64,
        );
    }
}

/// Helper function to create a signed URL (demonstrating Wasm-JS bridge)
#[wasm_bindgen]
pub fn get_wasm_status() -> String {
    "StreetView Wasm Engine Active".to_string()
}
