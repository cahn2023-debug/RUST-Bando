import sqlite3

def run_test():
    conn = sqlite3.connect(':memory:')
    cursor = conn.cursor()

    cursor.execute('''
        CREATE VIRTUAL TABLE IF NOT EXISTS file_search USING fts5(
            file_path UNINDEXED,
            title,
            content,
            tokenize='unicode61 remove_diacritics 2'
        )
    ''')

    cursor.execute('''
        INSERT INTO file_search (file_path, title, content)
        VALUES (?, ?, ?)
    ''', ('C:\\122\\08. hop dong da_xanh.docx', '08. hop dong da_xanh.docx', 'Content goes here.'))

    conn.commit()

    query = "da xanh"
    words = query.strip().split()
    fts_query = ' AND '.join([f'"{w}"*' for w in words])
    
    print(f"Executing query: MATCH '{fts_query}'")

    try:
        cursor.execute('''
            SELECT file_path, title, snippet(file_search, 2, '<b>', '</b>', '...', 32)
            FROM file_search 
            WHERE file_search MATCH ?
            ORDER BY rank
            LIMIT 20
        ''', (fts_query,))
        
        results = cursor.fetchall()
        print(f"Results found: {len(results)}")
        for r in results:
            print(r)
    except Exception as e:
        print(f"Error executing query: {e}")

if __name__ == "__main__":
    run_test()
