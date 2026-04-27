#![cfg(feature = "ai")]
use ort::session::Session;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let model_path = "local_data/models/active_models/llm.onnx";
    println!("Checking model: {}", model_path);

    let session = Session::builder()?.commit_from_file(model_path)?;

    println!("\n--- INPUTS ---");
    for input in session.inputs() {
        println!("Name: {}", input.name());
    }

    println!("\n--- OUTPUTS ---");
    for output in session.outputs() {
        println!("Name: {}", output.name());
    }

    Ok(())
}
