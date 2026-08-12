use basemap_release::ReleaseManager;
use std::env;
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = env::var_os("BASEMAP_RELEASE_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| "dist".into());
    let mut args = env::args().skip(1);
    let command = args
        .next()
        .ok_or("expected validate, activate, or rollback")?;
    let version = args.next().ok_or("expected a release version")?;
    let manager = ReleaseManager::new(root)?;

    match command.as_str() {
        "validate" => println!(
            "{}",
            serde_json::to_string_pretty(&manager.validate_candidate(&version)?)?
        ),
        "activate" => println!(
            "{}",
            serde_json::to_string_pretty(&manager.activate(&version)?)?
        ),
        "rollback" => println!(
            "{}",
            serde_json::to_string_pretty(&manager.rollback(&version)?)?
        ),
        _ => return Err(format!("unknown command: {command}").into()),
    }
    Ok(())
}
