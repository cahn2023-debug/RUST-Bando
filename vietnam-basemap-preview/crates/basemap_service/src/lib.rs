use axum::{
    extract::{Path, State},
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use basemap_contract::BasemapManifest;
use serde::Serialize;
use std::fmt;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Debug, Clone)]
pub struct ServiceConfig {
    pub package_root: PathBuf,
    pub active_version: String,
}

#[derive(Debug)]
pub enum ServiceError {
    InvalidConfig(String),
    Io(std::io::Error),
    Json(serde_json::Error),
    Contract(String),
}

impl fmt::Display for ServiceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidConfig(message) => write!(f, "invalid service config: {message}"),
            Self::Io(error) => error.fmt(f),
            Self::Json(error) => error.fmt(f),
            Self::Contract(message) => write!(f, "invalid basemap contract: {message}"),
        }
    }
}

impl std::error::Error for ServiceError {}

impl From<std::io::Error> for ServiceError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for ServiceError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

#[derive(Clone)]
struct ServiceState {
    release_dir: PathBuf,
    manifest: BasemapManifest,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
    version: String,
    #[serde(rename = "contractVersion")]
    contract_version: String,
    #[serde(rename = "schemaVersion")]
    schema_version: String,
}

pub fn router(config: ServiceConfig) -> Result<Router, ServiceError> {
    if config.active_version.trim().is_empty() {
        return Err(ServiceError::InvalidConfig(
            "active_version must not be empty".into(),
        ));
    }
    let release_dir = fs::canonicalize(config.package_root.join(&config.active_version))?;
    if !release_dir.is_dir() {
        return Err(ServiceError::InvalidConfig(format!(
            "active release is not a directory: {}",
            release_dir.display()
        )));
    }

    let manifest_path = release_dir.join("manifest.json");
    let manifest: BasemapManifest = serde_json::from_str(&fs::read_to_string(manifest_path)?)?;
    manifest
        .validate()
        .map_err(|error| ServiceError::Contract(error.to_string()))?;

    let state = Arc::new(ServiceState {
        release_dir,
        manifest,
    });
    Ok(Router::new()
        .route("/api/v1/basemap", get(get_manifest))
        .route("/api/v1/basemap/manifest", get(get_manifest))
        .route("/api/v1/basemap/styles", get(get_styles))
        .route("/api/v1/basemap/styles/{style}", get(get_style))
        .route("/api/v1/basemap/health", get(get_health))
        .route("/api/v1/basemap/version", get(get_version))
        .route("/tiles/{*path}", get(get_tile))
        .route("/fonts/{*path}", get(get_font))
        .route("/sprites/{*path}", get(get_sprite))
        .route("/assets/{*path}", get(get_asset))
        .with_state(state))
}

async fn get_manifest(State(state): State<Arc<ServiceState>>) -> Json<BasemapManifest> {
    Json(state.manifest.clone())
}

async fn get_styles(
    State(state): State<Arc<ServiceState>>,
) -> Json<Vec<basemap_contract::StyleReference>> {
    Json(state.manifest.styles.clone())
}

async fn get_style(
    State(state): State<Arc<ServiceState>>,
    Path(style): Path<String>,
) -> Result<Response, StatusCode> {
    let style_ref = state
        .manifest
        .styles
        .iter()
        .find(|candidate| candidate.id == style)
        .ok_or(StatusCode::NOT_FOUND)?;
    serve_file(&state, &style_ref.path, "application/json").await
}

async fn get_health(State(state): State<Arc<ServiceState>>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: state.manifest.version.clone(),
        contract_version: state.manifest.contract_version.clone(),
        schema_version: state.manifest.schema_version.clone(),
    })
}

async fn get_version(State(state): State<Arc<ServiceState>>) -> Json<HealthResponse> {
    get_health(State(state)).await
}

async fn get_tile(
    State(state): State<Arc<ServiceState>>,
    Path(path): Path<String>,
) -> Result<Response, StatusCode> {
    serve_file(&state, &format!("tiles/{path}"), "application/octet-stream").await
}

async fn get_font(
    State(state): State<Arc<ServiceState>>,
    Path(path): Path<String>,
) -> Result<Response, StatusCode> {
    serve_file(&state, &format!("fonts/{path}"), "application/octet-stream").await
}

async fn get_sprite(
    State(state): State<Arc<ServiceState>>,
    Path(path): Path<String>,
) -> Result<Response, StatusCode> {
    let content_type = if path.ends_with(".json") {
        "application/json"
    } else {
        "image/png"
    };
    serve_file(&state, &format!("sprites/{path}"), content_type).await
}

async fn get_asset(
    State(state): State<Arc<ServiceState>>,
    Path(path): Path<String>,
) -> Result<Response, StatusCode> {
    serve_file(
        &state,
        &format!("assets/{path}"),
        "application/octet-stream",
    )
    .await
}

async fn serve_file(
    state: &ServiceState,
    relative_path: &str,
    content_type: &'static str,
) -> Result<Response, StatusCode> {
    let relative = safe_relative_path(relative_path)?;
    let candidate = state.release_dir.join(relative);
    let canonical = tokio::fs::canonicalize(candidate)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    if !canonical.starts_with(&state.release_dir) || !canonical.is_file() {
        return Err(StatusCode::NOT_FOUND);
    }
    let bytes = tokio::fs::read(canonical)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut response = bytes.into_response();
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    Ok(response)
}

fn safe_relative_path(path: &str) -> Result<&str, StatusCode> {
    if path.is_empty()
        || path.starts_with('/')
        || path.starts_with('\\')
        || path.contains('\\')
        || path.contains(':')
        || path
            .split('/')
            .any(|segment| segment == ".." || segment.is_empty())
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok(path)
}

pub async fn serve(config: ServiceConfig, bind: std::net::SocketAddr) -> Result<(), ServiceError> {
    let app = router(config).map_err(|error| ServiceError::InvalidConfig(error.to_string()))?;
    let listener = tokio::net::TcpListener::bind(bind).await?;
    axum::serve(listener, app).await.map_err(ServiceError::Io)
}

#[cfg(test)]
mod tests {
    use super::*;
    use http_body_util::BodyExt;
    use serde_json::Value;
    use std::fs;
    use tempfile::tempdir;
    use tower::ServiceExt;

    fn fixture() -> tempfile::TempDir {
        let temp = tempdir().unwrap();
        let release = temp.path().join("1.0.0");
        fs::create_dir_all(release.join("styles")).unwrap();
        fs::create_dir_all(release.join("tiles")).unwrap();
        fs::create_dir_all(release.join("fonts")).unwrap();
        fs::create_dir_all(release.join("sprites")).unwrap();
        fs::write(
            release.join("manifest.json"),
            include_str!("../../../contracts/manifest.example.json"),
        )
        .unwrap();
        for style in ["light", "dark", "engineering"] {
            fs::write(release.join(format!("styles/{style}.json")), "{}\n").unwrap();
        }
        fs::write(release.join("tiles/source.pmtiles"), b"tile fixture").unwrap();
        fs::write(release.join("fonts/0-255.pbf"), b"font fixture").unwrap();
        fs::write(release.join("sprites/basemap.json"), b"{}\n").unwrap();
        fs::write(release.join("sprites/basemap.png"), b"png fixture").unwrap();
        temp
    }

    async fn body(response: Response) -> (StatusCode, Vec<u8>) {
        let status = response.status();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        (status, bytes.to_vec())
    }

    #[tokio::test]
    async fn serves_manifest_styles_assets_and_health() {
        let temp = fixture();
        let app = router(ServiceConfig {
            package_root: temp.path().to_path_buf(),
            active_version: "1.0.0".into(),
        })
        .unwrap();

        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri("/api/v1/basemap/health")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let (status, bytes) = body(response).await;
        assert_eq!(status, StatusCode::OK);
        let health: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(health["status"], "ok");
        assert_eq!(health["version"], "1.0.0");

        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri("/api/v1/basemap/styles/engineering")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(body(response).await.0, StatusCode::OK);

        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri("/tiles/source.pmtiles")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let (status, bytes) = body(response).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(bytes, b"tile fixture");

        let response = app
            .oneshot(
                axum::http::Request::builder()
                    .uri("/fonts/0-255.pbf")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(body(response).await.0, StatusCode::OK);
    }

    #[tokio::test]
    async fn rejects_missing_version_and_unsafe_paths() {
        let temp = fixture();
        let missing = router(ServiceConfig {
            package_root: temp.path().to_path_buf(),
            active_version: "9.0.0".into(),
        });
        assert!(missing.is_err());

        let app = router(ServiceConfig {
            package_root: temp.path().to_path_buf(),
            active_version: "1.0.0".into(),
        })
        .unwrap();
        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri("/api/v1/basemap/styles/missing")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let response = app
            .oneshot(
                axum::http::Request::builder()
                    .uri("/fonts/%2E%2E/manifest.json")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }
}
