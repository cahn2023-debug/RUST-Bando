pub fn predict_task_duration(task_name: &str) -> i32 {
    let words = task_name.split_whitespace().count();
    // A synthetic heuristic: base is 1 day. complex tasks take longer based on name length
    let mut duration = (words as i32) / 2 + 1;
    if task_name.to_lowercase().contains("khẩn") || task_name.to_lowercase().contains("urgent") || task_name.to_lowercase().contains("fix") {
        duration = 1; // Urgent tasks
    } else if task_name.to_lowercase().contains("thiết kế") || task_name.to_lowercase().contains("design") {
        duration += 3;
    }
    
    if duration < 1 {
        1
    } else {
        duration
    }
}

pub fn categorize_file(file_name: &str) -> String {
    let lower = file_name.to_lowercase();
    if lower.ends_with(".rs") || lower.ends_with(".ts") || lower.ends_with(".tsx") {
        return "Source Code".to_string();
    }
    if lower.contains("hđ") || lower.contains("hop dong") || lower.contains("contract") {
        return "Contract".to_string();
    }
    if lower.contains("bản vẽ") || lower.contains("ban ve") || lower.contains("drawing") || lower.contains("tk") {
        return "Design Drawing".to_string();
    }
    if lower.contains("báo cáo") || lower.contains("bao cao") || lower.contains("report") {
        return "Report".to_string();
    }
    "General Document".to_string()
}
