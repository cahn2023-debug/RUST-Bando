use calamine::{open_workbook_auto, Data, Reader};
use pdf_extract::extract_text as pdf_extract_text;
use quick_xml::events::Event;
use quick_xml::Reader as XmlReader;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;

pub fn extract_text(path: &Path) -> Result<String, String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "xlsx" | "xls" | "csv" => extract_excel(path),
        "docx" => extract_docx(path),
        "pdf" => extract_pdf(path),
        "txt" | "md" | "json" | "rs" | "ts" | "tsx" | "js" | "sql" => {
            std::fs::read_to_string(path).map_err(|e| e.to_string())
        }
        _ => Err("Unsupported format".to_string()),
    }
}

fn extract_excel(path: &Path) -> Result<String, String> {
    let mut workbook = open_workbook_auto(path).map_err(|e| e.to_string())?;
    let mut result = String::new();
    let sheet_names = workbook.sheet_names().to_owned();
    for name in sheet_names {
        if let Ok(range) = workbook.worksheet_range(&name) {
            for row in range.rows() {
                for cell in row {
                    match cell {
                        Data::String(s) => {
                            result.push_str(s);
                            result.push(' ');
                        }
                        Data::Float(f) => {
                            result.push_str(&f.to_string());
                            result.push(' ');
                        }
                        Data::Int(i) => {
                            result.push_str(&i.to_string());
                            result.push(' ');
                        }
                        _ => {}
                    }
                }
                result.push('\n');
            }
        }
    }
    Ok(result.trim().to_string())
}

fn extract_docx(path: &Path) -> Result<String, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    let mut xml = String::new();
    {
        let mut document_xml = archive.by_name("word/document.xml").map_err(|e| e.to_string())?;
        document_xml.read_to_string(&mut xml).map_err(|e| e.to_string())?;
    } // document_xml borrow drops here

    let mut text = String::new();
    let mut in_text = false;

    let mut reader = XmlReader::from_str(&xml);

    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                if e.name().as_ref() == b"w:t" {
                    in_text = true;
                }
            }
            Ok(Event::Text(e)) => {
                if in_text {
                    let unescaped = e.unescape().unwrap_or(std::borrow::Cow::Borrowed(""));
                    text.push_str(&unescaped);
                }
            }
            Ok(Event::End(ref e)) => {
                if e.name().as_ref() == b"w:t" {
                    in_text = false;
                }
                if e.name().as_ref() == b"w:p" {
                    text.push('\n');
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => (),
        }
        buf.clear();
    }
    Ok(text.trim().to_string())
}

fn extract_pdf(path: &Path) -> Result<String, String> {
    pdf_extract_text(path).map_err(|e| e.to_string())
}
