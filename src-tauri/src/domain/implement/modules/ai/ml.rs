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


