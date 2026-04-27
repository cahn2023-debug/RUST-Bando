#[cfg(feature = "ai")]
pub mod ai_engine;
pub mod ml;
// pub mod trainer;

#[cfg(feature = "ai")]
pub use ai_engine::embedding::EmbeddingEngine;
#[cfg(feature = "ai")]
pub use ai_engine::ocr::{OcrEngine, OcrResult};
#[cfg(feature = "ai")]
pub use ai_engine::phi3::Phi3Engine;
#[cfg(feature = "ai")]
pub use ai_engine::yolo::YoloEngine;
#[cfg(feature = "ai")]
pub use ai_engine::AIManager;
