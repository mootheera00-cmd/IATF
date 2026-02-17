module.exports = function initDb(db) {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role_id INTEGER NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (role_id) REFERENCES roles(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_no TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS document_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        revision TEXT NOT NULL,
        status TEXT NOT NULL,
        file_path TEXT NOT NULL,
        change_note TEXT,
        requester_id INTEGER,
        reviewer_id INTEGER,
        approver_id INTEGER,
        effective_date DATETIME,
        approved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS access_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        detail TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const roles = ['ENGINEER', 'MANAGER', 'QMR', 'ADMIN'];
    roles.forEach(r => {
      db.run(`INSERT OR IGNORE INTO roles (name) VALUES (?)`, [r]);
    });

    console.log("Database initialized.");
  });
};
