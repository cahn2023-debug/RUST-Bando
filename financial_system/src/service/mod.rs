// src/service/mod.rs

use crate::repository::Repository;
use anyhow::Result;
use serde_json::Value;

pub struct FinancialService {
    repo: Repository,
}

impl FinancialService {
    pub fn new(repo: Repository) -> Self {
        Self { repo }
    }

    pub async fn get_dashboard_summary(&self, project_id: i32) -> Result<Value> {
        // High-level aggregation logic can be expanded here
        self.repo.get_project_summary(project_id).await
    }

    pub async fn detect_anomalies(&self, project_id: i32) -> Result<Vec<String>> {
        let mut anomalies = Vec::new();

        // Logic to detect over-allocation or budget overrun
        // Example: actual_cost > planned_value
        // This would involve fetching both input and output items and comparing

        anomalies.push("Anomaly detection engine initialized".to_string());
        Ok(anomalies)
    }
}

// src/service/file_parser.rs
use calamine::{open_workbook_auto, Reader, DataType};
use std::collections::HashMap;
use std::path::Path;

pub struct FileParser;

impl FileParser {
    /// Parse Excel (.xlsx, .xls) files and extract summary data
    pub fn parse_excel(path: &str) -> Result<Vec<HashMap<String, String>>, String> {
        let path = Path::new(path);
        
        if !path.exists() {
            return Err(format!("File not found: {}", path.display()));
        }

        let extension = path.extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();

        if !["xlsx", "xls"].contains(&extension.as_str()) {
            return Err(format!("Unsupported file format: {}", extension));
        }

        // Open workbook
        let mut workbook = open_workbook_auto(path)
            .map_err(|e| format!("Failed to open workbook: {}", e))?;

        let mut results = Vec::new();

        // Iterate over all sheets
        for sheet_name in workbook.sheet_names() {
            if let Ok(range) = workbook.worksheet_range(&sheet_name) {
                let mut headers = Vec::new();
                let mut is_header_row = true;

                // Process rows
                for row in range.rows() {
                    if is_header_row {
                        // First row is headers
                        for cell in row {
                            headers.push(cell.to_string());
                        }
                        is_header_row = false;
                        continue;
                    }

                    // Data rows
                    if row.iter().all(|cell| cell.is_empty()) {
                        continue; // Skip empty rows
                    }

                    let mut row_map = HashMap::new();
                    for (i, cell) in row.iter().enumerate() {
                        if i < headers.len() {
                            row_map.insert(
                                headers[i].clone(),
                                cell.to_string(),
                            );
                        }
                    }

                    if !row_map.is_empty() {
                        results.push(row_map);
                    }
                }
            }
        }

        Ok(results)
    }

    /// Parse Word (.docx) files and extract text content
    pub fn parse_word(path: &str) -> Result<String, String> {
        let path = Path::new(path);
        
        if !path.exists() {
            return Err(format!("File not found: {}", path.display()));
        }

        let extension = path.extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();

        if extension != "docx" {
            return Err(format!("Unsupported file format: {}", extension));
        }

        // Open DOCX file
        let file = std::fs::File::open(path)
            .map_err(|e| format!("Failed to open file: {}", e))?;

        // Parse DOCX (using quick-xml for XML parsing)
        let archive = zip::ZipArchive::new(file)
            .map_err(|e| format!("Invalid DOCX file: {}", e))?;

        // Extract text from document.xml
        let mut content = String::new();
        if let Ok(mut document_xml) = archive.by_name("word/document.xml") {
            use std::io::Read;
            let mut xml_content = String::new();
            document_xml.read_to_string(&mut xml_content)
                .map_err(|e| format!("Failed to read XML: {}", e))?;

            // Parse XML and extract text
            // This is a simplified implementation
            // In production, you'd use a proper DOCX parser
            content = Self::extract_text_from_xml(&xml_content);
        }

        Ok(content)
    }

    /// Simple XML text extraction (simplified implementation)
    fn extract_text_from_xml(xml: &str) -> String {
        // In production, use quick-xml or similar proper XML parser
        // This is a basic implementation that extracts text between tags
        let mut text_parts = Vec::new();
        let mut in_text_element = false;
        let mut current_text = String::new();

        for char in xml.chars() {
            match char {
                '<' => {
                    if in_text_element && !current_text.trim().is_empty() {
                        text_parts.push(current_text.clone());
                        current_text.clear();
                    }
                    in_text_element = false;
                }
                '>' => {
                    in_text_element = true;
                }
                _ => {
                    if in_text_element {
                        current_text.push(char);
                    }
                }
            }
        }

        text_parts.join(" ")
    }

    /// Main entry point for parsing various file types
    pub fn parse_summary(path: &str) -> Result<String, String> {
        let path_obj = Path::new(path);
        let extension = path_obj.extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();

        match extension.as_str() {
            "xlsx" | "xls" => {
                let data = Self::parse_excel(path)?;
                Ok(format!("Extracted {} rows from Excel file", data.len()))
            }
            "docx" => {
                let text = Self::parse_word(path)?;
                Ok(format!("Extracted {} characters from Word document", text.len()))
            }
            "txt" | "csv" => {
                let content = std::fs::read_to_string(path)
                    .map_err(|e| format!("Failed to read file: {}", e))?;
                Ok(format!("Read {} lines from text file", content.lines().count()))
            }
            _ => Err(format!("Unsupported file format: {}", extension)),
        }
    }
}
