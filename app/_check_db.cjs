const SQL = require('sql.js');
const fs = require('fs');
const path = require('path');

(async () => {
  const SQLloaded = await SQL({
    locateFile: (f) => path.join(__dirname, 'node_modules', 'sql.js', 'dist', f)
  });
  const buf = fs.readFileSync('C:\\Users\\83871\\AppData\\Roaming\\ai-image-studio\\ai-image-studio.db');
  const db = new SQLloaded.Database(buf);

  console.log('=== tables ===');
  console.log(JSON.stringify(db.exec("SELECT name FROM sqlite_master WHERE type='table'")));

  console.log('=== images count ===');
  console.log(JSON.stringify(db.exec('SELECT COUNT(*) as cnt FROM images')));

  console.log('=== settings ===');
  console.log(JSON.stringify(db.exec('SELECT * FROM settings')));

  console.log('=== batches ===');
  console.log(JSON.stringify(db.exec('SELECT * FROM batches')));

  console.log('=== sessions ===');
  console.log(JSON.stringify(db.exec('SELECT * FROM sessions')));

  db.close();
})();