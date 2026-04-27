#![cfg(feature = "ai")]
use design_core::ai_engine::AIManager;
use std::path::PathBuf;
use std::time::Instant;

fn main() {
    println!("🚀 Starting AI Performance Benchmark...");

    let resource_dir = PathBuf::from("resources");
    let data_dir = PathBuf::from("local_data/models");

    let manager = AIManager::new();
    println!("📦 Initializing AI Engine (Target: 2GB RAM Optimization)...");
    manager.init(resource_dir, data_dir);

    let mut phi3 = match manager.get_phi3_engine() {
        Ok(e) => e,
        Err(e) => {
            eprintln!("❌ Error initializing AI: {}", e);
            return;
        }
    };

    let test_prompt = "CÔNG TY ABC\nHỢP ĐỒNG KINH TẾ\nĐiều 1: Thanh toán 50% sau khi ký. Điều 2: Hoàn thành vào 30/12/2026.";
    println!("📝 Test Prompt: {}", test_prompt);

    println!("🧠 Running Inference (KV Caching active)...");
    let start = Instant::now();
    let result = phi3.analyze_contract(test_prompt);
    let duration = start.elapsed();

    match result {
        Ok(text) => {
            println!("✅ Analysis Success!");
            println!("📄 Result:\n{}", text);
            println!("⏱️ Total Time: {:?}", duration);

            let tokens_count = text.len() / 4;
            let tps = tokens_count as f64 / duration.as_secs_f64();
            println!("📊 Performance: ~{:.2} tokens/s", tps);
        }
        Err(e) => eprintln!("❌ Inference Error: {}", e),
    }

    println!("🧹 Releasing RAM...");
    manager.shutdown();
    println!("🏁 Benchmark Finished.");
}
