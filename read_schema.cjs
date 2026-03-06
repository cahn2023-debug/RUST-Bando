const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('d:/Code Antinigaty/Phan mem quan ly file V4_Python_co thu vien/MICROSOFT C/AppDiagnostics/app_test.pmp', (err) => {
  if (err) {
    console.error(err.message);
  }
});

db.serialize(() => {
  db.each("SELECT sql FROM sqlite_master WHERE type='table'", (err, row) => {
    if (err) {
      console.error(err.message);
    }
    console.log(row.sql);
  });
});

db.close();
