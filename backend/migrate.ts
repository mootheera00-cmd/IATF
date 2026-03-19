// backend/migrate.ts
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'db', 'nskiatf_doccontrol.db');
const migrationsDir = path.resolve(__dirname, 'migrations');

const db = new sqlite3.Database(dbPath, (err: any) => {
  if (err) {
    console.error('Error opening database', err.message);
    return;
  }
  console.log('Connected to the SQLite database.');
});

// Drop existing tables for a clean slate
const dropTables = [
  'ApprovalRecord',
  'AuditEvent',
  'SignedUrlToken',
  'ChangeRequest',
  'DocumentRevision',
  'Document',
  'users',
  'roles',
  'access_logs',
  'document_revisions',
  'documents'
];

db.serialize(() => {
  db.run('BEGIN TRANSACTION;');
  dropTables.forEach((table) => {
    db.run(`DROP TABLE IF EXISTS ${table};`, (err: any) => {
      if (err) {
        console.error(`Error dropping table ${table}`, err.message);
      } else {
        console.log(`Table ${table} dropped.`);
      }
    });
  });
  db.run('COMMIT;', (err: any) => {
    if (err) {
      console.error('Error committing drop tables transaction', err.message);
    } else {
      console.log('All existing tables dropped.');
      runMigrations();
    }
  });
});

function runMigrations() {
  fs.readdir(migrationsDir, (err: any, files: string[]) => {
    if (err) {
      return console.error('Unable to scan migrations directory: ' + err);
    }

    const sqlFiles = files.filter((file) => file.endsWith('.sql')).sort();

    db.serialize(() => {
      db.run('BEGIN TRANSACTION;');

      sqlFiles.forEach((file) => {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        if (sql.trim().length > 0) {
          // Split SQL commands by semicolon, and filter out empty statements
          const commands = sql.split(';').filter((cmd) => cmd.trim().length > 0);
          commands.forEach((command) => {
            db.run(command, (err2: any) => {
              if (err2) {
                console.error(`Error executing SQL from ${file}: ${command}`, err2.message);
                db.run('ROLLBACK;');
                db.close();
                throw err2;
              }
            });
          });
          console.log(`Migration ${file} executed successfully.`);
        }
      });

      db.run('COMMIT;', (err2: any) => {
        if (err2) {
          console.error('Error committing migrations', err2.message);
        } else {
          console.log('All migrations executed successfully.');
        }
        // close the database connection
        db.close((err3: any) => {
          if (err3) {
            console.error(err3.message);
          }
          console.log('Close the database connection.');
        });
      });
    });
  });
}

export {};
