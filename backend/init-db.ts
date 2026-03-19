// backend/init-db.ts
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcryptjs = require('bcryptjs');

const DB_PATH = path.resolve(__dirname, './db/nskiatf_doccontrol.db');
const db = new sqlite3.Database(DB_PATH, (err: any) => {
  if (err) {
    console.error('❌ Cannot open database:', err);
    process.exit(1);
  }
  console.log('✅ Connected to SQLite database');
});

// Helper functions
function run(sql: string, params: any[] = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err: any) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql: string, params: any[] = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err: any, row: any) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql: string, params: any[] = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err: any, rows: any) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initializeDatabase() {
  try {
    console.log('🔧 Initializing database schema...');

    // Enable foreign keys
    await run('PRAGMA foreign_keys = ON');

    // Create roles table
    await run(`
      CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      )
    `);
    console.log('✅ Roles table created');

    // Create users table with all required columns
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password TEXT,
        password_hash TEXT,
        role_id INTEGER NOT NULL,
        department TEXT,
        email TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (role_id) REFERENCES roles(id)
      )
    `);
    console.log('✅ Users table created');

    // Create documents table
    await run(`
      CREATE TABLE IF NOT EXISTS Document (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        document_type TEXT,
        current_revision_id INTEGER,
        department TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Document table created');

    // Create DocumentRevision table
    await run(`
      CREATE TABLE IF NOT EXISTS DocumentRevision (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        revision_number INTEGER,
        file_path_original TEXT,
        file_path_pdf TEXT,
        status TEXT DEFAULT 'Draft',
        hash_original TEXT,
        hash_pdf TEXT,
        released_by_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES Document(id),
        FOREIGN KEY (released_by_id) REFERENCES users(id)
      )
    `);
    console.log('✅ DocumentRevision table created');

    // Create ChangeRequest table
    await run(`
      CREATE TABLE IF NOT EXISTS ChangeRequest (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        requester_id INTEGER NOT NULL,
        reason TEXT,
        status TEXT DEFAULT 'Draft',
        assigned_manager_id INTEGER,
        submitted_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES Document(id),
        FOREIGN KEY (requester_id) REFERENCES users(id),
        FOREIGN KEY (assigned_manager_id) REFERENCES users(id)
      )
    `);
    console.log('✅ ChangeRequest table created');

    // Create ApprovalRecord table
    await run(`
      CREATE TABLE IF NOT EXISTS ApprovalRecord (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        change_request_id INTEGER NOT NULL,
        approver_id INTEGER NOT NULL,
        gate TEXT,
        decision TEXT,
        comments TEXT,
        approved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (change_request_id) REFERENCES ChangeRequest(id),
        FOREIGN KEY (approver_id) REFERENCES users(id)
      )
    `);
    console.log('✅ ApprovalRecord table created');

    // Create AuditEvent table
    await run(`
      CREATE TABLE IF NOT EXISTS AuditEvent (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT,
        entity_id INTEGER,
        event_type TEXT,
        user_id INTEGER,
        old_value TEXT,
        new_value TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    console.log('✅ AuditEvent table created');

    // Create Notification table
    await run(`
      CREATE TABLE IF NOT EXISTS Notification (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT,
        related_cr_id INTEGER,
        message TEXT,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (related_cr_id) REFERENCES ChangeRequest(id)
      )
    `);
    console.log('✅ Notification table created');

    // Create SignedUrlToken table
    await run(`
      CREATE TABLE IF NOT EXISTS SignedUrlToken (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        cr_id INTEGER,
        file_type TEXT,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cr_id) REFERENCES ChangeRequest(id)
      )
    `);
    console.log('✅ SignedUrlToken table created');

    // Create Positions table
    await run(`
      CREATE TABLE IF NOT EXISTS Positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        position_name TEXT,
        department TEXT,
        assigned_user_id INTEGER,
        FOREIGN KEY (assigned_user_id) REFERENCES users(id)
      )
    `);
    console.log('✅ Positions table created');

    console.log('\n📦 Seeding test data...');

    // Insert roles
    const roles = ['ADMIN', 'MANAGER', 'QMR', 'CHANGE_REQUESTER', 'DOCUMENT_CONTROL'];
    for (const role of roles) {
      await run(`INSERT OR IGNORE INTO roles (name) VALUES (?)`, [role]);
    }
    console.log('✅ Roles seeded');

    // Get role IDs
    const roleMap: Record<string, number> = {};
    const rolesData: any[] = (await all(`SELECT id, name FROM roles`)) as any[];
    rolesData.forEach((r: any) => (roleMap[r.name] = r.id));

    // Test users data
    const testUsers = [
      { code: 'ADMIN001', name: 'System Admin', password: 'Admin@123', role: 'ADMIN', dept: 'Management' },
      { code: 'MGR001', name: 'John Manager', password: 'Manager@123', role: 'MANAGER', dept: 'Production' },
      { code: 'QMR001', name: 'Sarah QMR', password: 'QMR@123', role: 'QMR', dept: 'Quality' },
      { code: 'CHG001', name: 'Mike Requester', password: 'Requester@123', role: 'CHANGE_REQUESTER', dept: 'Engineering' },
      { code: 'DOC001', name: 'Lisa DocControl', password: 'DocCtrl@123', role: 'DOCUMENT_CONTROL', dept: 'Administration' }
    ];

    for (const user of testUsers) {
      const roleId = roleMap[user.role];
      const passwordHash = await bcryptjs.hash(user.password, 10);
      await run(
        `INSERT OR REPLACE INTO users (employee_code, name, password, password_hash, role_id, department, is_active) 
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [user.code, user.name, user.password, passwordHash, roleId, user.dept]
      );
    }
    console.log('✅ Test users seeded');

    // Insert sample documents
    const sampleDocs = [
      { title: 'Assembly Process Documentation', type: 'Procedure', dept: 'Production' },
      { title: 'Quality Control Procedures', type: 'Manual', dept: 'Quality' },
      { title: 'Safety Standard Operating Procedure', type: 'Work Instruction', dept: 'Safety' }
    ];

    const userId = 1; // Admin user
    for (const doc of sampleDocs) {
      await run(`INSERT INTO Document (title, document_type, department, is_active) VALUES (?, ?, ?, 1)`, [
        doc.title,
        doc.type,
        doc.dept
      ]);
      console.log(`✅ Document created: "${doc.title}"`);
    }

    console.log('\n✨ Database initialization complete!');
    console.log('\n📝 Test Credentials:');
    testUsers.forEach((u) => {
      console.log(`   ${u.code} / ${u.password} (${u.role})`);
    });

    db.close();
  } catch (err: any) {
    console.error('❌ Error initializing database:', err.message);
    process.exit(1);
  }
}

initializeDatabase();

export {};
