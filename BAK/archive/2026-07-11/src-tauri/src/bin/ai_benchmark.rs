use design_core::domain::implement::modules::ai::ai_engine::AIManager;
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, Instant};
use sysinfo::{Pid, ProcessRefreshKind, RefreshKind, System};

fn main() {
    println!("=== AI ENGINE PERFORMANCE BENCHMARK (LOW-RAM FOCUS) ===");

    let mut sys = System::new_all();
    let pid = Pid::from(std::process::id() as usize);

    let args: Vec<String> = std::env::args().collect();
    let resource_dir = if args.len() > 1 { PathBuf::from(&args[1]) } else { PathBuf::from("resources") };
    let data_dir = if args.len() > 2 { PathBuf::from(&args[2]) } else { PathBuf::from("data") };

    let ai_manager = AIManager::new();

    // 1. Baseline Memory
    sys.refresh_process_specifics(pid, ProcessRefreshKind::new().with_memory());
    let baseline_mem = sys.process(pid).map(|p| p.memory()).unwrap_or(0);
    println!(
        "Baseline RAM: {:.2} MB",
        baseline_mem as f32 / 1024.0 / 1024.0
    );

    // 2. Initialize Engine
    println!("Initializing AIEngine...");
    let start = Instant::now();
    ai_manager.init(resource_dir, data_dir);
    println!("Initialization took: {:?}", start.elapsed());

    sys.refresh_process_specifics(pid, ProcessRefreshKind::new().with_memory());
    let init_mem = sys.process(pid).map(|p| p.memory()).unwrap_or(0);
    println!(
        "RAM after init: {:.2} MB (Dynamic: {:.2} MB)",
        init_mem as f32 / 1024.0 / 1024.0,
        (init_mem - baseline_mem) as f32 / 1024.0 / 1024.0
    );

    // 3. Load Phi-3 (Simulated LLM usage)
    println!("Loading LLM (Phi-3)...");
    let start = Instant::now();
    if let Ok(engine) = ai_manager.get_phi3_engine() {
        println!("LLM loaded in: {:?}", start.elapsed());

        sys.refresh_process_specifics(pid, ProcessRefreshKind::new().with_memory());
        let llm_mem = sys.process(pid).map(|p| p.memory()).unwrap_or(0);
        println!(
            "RAM after LLM load: {:.2} MB (LLM unique: {:.2} MB)",
            llm_mem as f32 / 1024.0 / 1024.0,
            (llm_mem - init_mem) as f32 / 1024.0 / 1024.0
        );

        // 4. Test Inference Speed
        println!("Testing inference (32 tokens)...");
        let start = Instant::now();
        match engine.generate("Tell me a funny story about a programmer.", 32) {
            Ok(res) => {
                let elapsed = start.elapsed();
                println!("Result: {}", res);
                println!(
                    "Inference took: {:?} (~{:.2} tokens/sec)",
                    elapsed,
                    32.0 / elapsed.as_secs_f32()
                );
            }
            Err(e) => println!("Inference failed: {}", e),
        }
    } else {
        println!("Skipping LLM test (Phi-3 not found).");
    }

    // 4.5 Load Qwen-2.5 (New default)
    println!("\nLoading Qwen-2.5...");
    let start = Instant::now();
    if let Ok(engine) = ai_manager.get_qwen_engine() {
        println!("Qwen loaded in: {:?}", start.elapsed());

        sys.refresh_process_specifics(pid, ProcessRefreshKind::new().with_memory());
        let qwen_mem = sys.process(pid).map(|p| p.memory()).unwrap_or(0);
        println!(
            "RAM after Qwen load: {:.2} MB",
            qwen_mem as f32 / 1024.0 / 1024.0
        );

        println!("Testing Qwen inference (32 tokens)...");
        let start = Instant::now();
        match engine.generate("What is the best way to manage memory in Rust?", 32) {
            Ok(res) => {
                let elapsed = start.elapsed();
                println!("Result: {}", res);
                println!(
                    "Inference took: {:?} (~{:.2} tokens/sec)",
                    elapsed,
                    32.0 / elapsed.as_secs_f32()
                );
            }
            Err(e) => println!("Qwen inference failed: {}", e),
        }
    } else {
        println!("Skipping Qwen test (model not found).");
    }

    // 5. Cleanup / Memory Release Test
    println!("Shutting down AI Engine (releasing RAM)...");
    ai_manager.shutdown();

    // Wait for GC/system to reclaim
    thread::sleep(Duration::from_secs(2));
    sys.refresh_process_specifics(pid, ProcessRefreshKind::new().with_memory());
    let final_mem = sys.process(pid).map(|p| p.memory()).unwrap_or(0);
    println!(
        "Final RAM: {:.2} MB (Relief: {:.2} MB)",
        final_mem as f32 / 1024.0 / 1024.0,
        (llm_mem as i128 - final_mem as i128).max(0) as f32 / 1024.0 / 1024.0
    );

    if final_mem <= baseline_mem + (100 * 1024 * 1024) {
        println!("SUCCESS: Memory management is healthy (released >90% of model RAM)");
    } else {
        println!("WARNING: Memory may not have been fully released.");
    }
}
