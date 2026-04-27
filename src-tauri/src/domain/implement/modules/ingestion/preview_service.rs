use log::debug;
use mime_guess::from_path;
use moka::sync::Cache;
use std::time::Duration;
use tauri::http::{Request, Response, StatusCode};
use tauri::{AppHandle, Manager};

#[derive(Clone)]
pub struct PreviewCache {
    pub cache: Cache<String, Result<Vec<u8>, String>>,
}

impl Default for PreviewCache {
    fn default() -> Self {
        Self {
            cache: Cache::builder()
                .max_capacity(500) // Keep up to 500 previews in memory
                .time_to_idle(Duration::from_secs(10 * 60))
                .build(),
        }
    }
}

pub fn init(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(PreviewCache::default());
    Ok(())
}

fn escape_html(input: &str) -> String {
    input
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#39;")
}

fn generate_preview(file_path: &str) -> Result<Vec<u8>, String> {
    let mime = from_path(file_path).first_or_octet_stream();

    let ext = std::path::Path::new(file_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if mime.type_().as_str() == "image" {
        return generate_image_preview(file_path);
    }

    if ext == "xlsx" || ext == "xls" {
        return generate_excel_preview(file_path);
    }

    if ext == "docx" {
        return generate_docx_preview(file_path);
    }

    if mime == "application/pdf" {
        return generate_pdf_preview(file_path);
    }

    Err(format!("Unsupported format: {}", ext))
}

fn generate_image_preview(path: &str) -> Result<Vec<u8>, String> {
    let mut reader = image::io::Reader::open(path).map_err(|e| e.to_string())?;
    reader.no_limits(); // Disable conservative memory limits since Tauri app runs natively

    let img = reader.decode().map_err(|e| e.to_string())?;
    let thumb = img.thumbnail(500, 500);

    let mut buf = Vec::new();
    thumb
        .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    Ok(buf)
}

fn generate_excel_preview(path: &str) -> Result<Vec<u8>, String> {
    use calamine::{open_workbook_auto, Reader};

    let mut workbook = open_workbook_auto(path).map_err(|e| e.to_string())?;

    let sheet_names = workbook.sheet_names().to_owned();
    if sheet_names.is_empty() {
        return Err("No sheets found".into());
    }

    let range = workbook
        .worksheet_range(&sheet_names[0])
        .map_err(|e| e.to_string())?;

    let mut html = String::from(
        "<html><head><style>
        body { margin: 0; padding: 0; background: #fff;}
        table { width: 100%; border-collapse: collapse; font-family: sans-serif; font-size: 13px; }
        td, th { border: 1px solid #ddd; padding: 6px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        tr:nth-child(even){background-color: #f9f9f9;}
        </style></head><body><table>"
    );

    for row in range.rows().take(50) {
        html.push_str("<tr>");
        for cell in row {
            let cell_content = format!("{}", cell);
            html.push_str(&format!("<td>{}</td>", escape_html(&cell_content)));
        }
        html.push_str("</tr>");
    }

    html.push_str("</table></body></html>");

    Ok(html.into_bytes())
}

fn generate_docx_preview(path: &str) -> Result<Vec<u8>, String> {
    use std::fs::File;
    use std::io::Read;
    use zip::ZipArchive;

    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    let doc = archive
        .by_name("word/document.xml")
        .map_err(|e| e.to_string())?;

    let mut xml = String::new();
    // Read up to 100KB to avoid memory bloat
    doc.take(100_000)
        .read_to_string(&mut xml)
        .map_err(|e| e.to_string())?;

    let text = xml
        .replace("<w:t>", "")
        .replace("</w:t>", " ")
        .replace("<w:p>", "\n")
        .replace("<w:br/>", "\n")
        .replace("<[^>]+>", "");

    let cleaned = regex::Regex::new(r"<[^>]+>")
        .unwrap()
        .replace_all(&text, "");

    let html = format!(
        "<html><body style='font-family: sans-serif; font-size: 14px; padding: 12px; line-height: 1.6; white-space: pre-wrap; margin:0;'>{}...</body></html>",
        escape_html(&cleaned)
    );
    Ok(html.into_bytes())
}

fn generate_pdf_preview(path: &str) -> Result<Vec<u8>, String> {
    use pdf_extract::extract_text;

    // Extract text from the first ~1000 characters for a quick preview
    let text = extract_text(path).map_err(|e| format!("PDF extract failed: {}", e))?;
    let preview_text = text.chars().take(1500).collect::<String>();

    let html = format!(
        "<html><body style='font-family: sans-serif; font-size: 13px; padding: 20px; line-height: 1.5; color: #333; background: #fdfdfd; border: 1px solid #eee;'>
        <div style='font-size: 10px; color: #999; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;'>PDF PREVIEW (TEXT MODE)</div>
        <div style='white-space: pre-wrap;'>{}...</div>
        </body></html>",
        escape_html(&preview_text)
    );

    Ok(html.into_bytes())
}

// Custom Protocol Handler `preview://`
pub fn handle_preview_request(
    app: &AppHandle,
    request: Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    debug!("Preview request received for URI: {}", request.uri());
    let uri = request.uri().path();
    let decoded_path = urlencoding::decode(uri)
        .unwrap_or_else(|_| uri.into())
        .to_string();
    let file_path = decoded_path.trim_start_matches('/');

    // v72: Security - Path Traversal Protection
    let path_obj = std::path::Path::new(file_path);

    // 1. Block any path containing ".." components to prevent directory traversal
    if path_obj
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        debug!("[Security] Blocked path traversal attempt: {}", file_path);
        return Response::builder()
            .status(StatusCode::FORBIDDEN)
            .body(b"Access Denied: Path traversal detected".to_vec())
            .unwrap();
    }

    if !path_obj.exists() {
        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(b"File not found".to_vec())
            .unwrap();
    }

    let metadata = std::fs::metadata(file_path);
    let modified = metadata
        .and_then(|m| m.modified())
        .map(|m| m.duration_since(std::time::UNIX_EPOCH).unwrap().as_secs())
        .unwrap_or(0);

    let cache_key = format!("{}?m={}", file_path, modified);

    let preview_cache = app.state::<PreviewCache>();

    // Synchronous execution using moka::sync::Cache
    let result = preview_cache
        .cache
        .get_with(cache_key, || generate_preview(file_path));

    let ext = path_obj
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mime_type = mime_guess::from_path(file_path).first_or_octet_stream();
    let content_type = match ext.as_str() {
        "xls" | "xlsx" | "doc" | "docx" => "text/html",
        "pdf" => "application/pdf",
        _ if mime_type.type_().as_str() == "image" => "image/png",
        _ => "application/octet-stream",
    };

    match result {
        Ok(data) => Response::builder()
            .header("Content-Type", content_type)
            .header("Access-Control-Allow-Origin", "*")
            .status(StatusCode::OK)
            .body(data)
            .unwrap(),
        Err(e) => Response::builder()
            .header("Content-Type", "text/plain")
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(format!("Error generating preview: {}", e).into_bytes())
            .unwrap(),
    }
}
