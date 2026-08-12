use basemap_service::{serve, ServiceConfig};
use std::env;
use std::path::PathBuf;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let package_root = env::var_os("BASEMAP_PACKAGE_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| "dist".into());
    let active_version = env::var("BASEMAP_ACTIVE_VERSION").unwrap_or_else(|_| "1.0.0".into());
    let bind = env::var("BASEMAP_BIND").unwrap_or_else(|_| "127.0.0.1:8787".into());
    let bind = bind.parse()?;
    serve(
        ServiceConfig {
            package_root,
            active_version,
        },
        bind,
    )
    .await?;
    Ok(())
}
