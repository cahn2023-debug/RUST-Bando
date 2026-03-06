use rusqlite::{Connection, Result};

fn main() -> Result<()> {
    let conn = Connection::open_in_memory()?;
    
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS file_search USING fts5(
            file_path UNINDEXED,
            title,
            content,
            tokenize='unicode61 remove_diacritics 2'
        )",
        [],
    )?;
    
    conn.execute(
        "INSERT INTO file_search (file_path, title, content) VALUES (?1, ?2, ?3)",
        rusqlite::params!["C:\\test.txt", "da xanh file", "Here is some content about da xanh and the project"],
    )?;

    let query = "da xanh";
    let sanitized_query = query.replace("\"", "").replace("'", "");
    let fts_query: String = sanitized_query.split_whitespace()
        .map(|w| format!("\"{}\"*", w))
        .collect::<Vec<_>>()
        .join(" AND ");
        
    println!("FTS Query: {}", fts_query);

    let mut stmt = conn.prepare("
        SELECT file_path, title, snippet(file_search, 2, '<b>', '</b>', '...', 32)
        FROM file_search 
        WHERE file_search MATCH ?1
        ORDER BY rank
        LIMIT 20
    ")?;
    
    let rows_iter = stmt.query_map(rusqlite::params![fts_query], |row| {
        let f: String = row.get(0)?;
        let t: String = row.get(1)?;
        Ok((f, t))
    })?;

    for r in rows_iter {
        println!("{:?}", r);
    }

    Ok(())
}
