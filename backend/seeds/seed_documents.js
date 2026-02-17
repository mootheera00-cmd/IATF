// backend/seeds/seed_documents.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db');
const db = new sqlite3.Database(dbPath);

const run = (sql, params) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
    });
});

async function seed() {
    try {
        await run(`INSERT INTO Document (id, doc_number, title, owning_department, created_by) VALUES (?, ?, ?, ?, ?)`, [1, 'DOC-001', 'Test Document', 'Engineering', 1]);
        await run(`INSERT INTO DocumentRevision (id, document_id, rev_code, status, original_uri, pdf_uri, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`, [1, 1, 'A', 'Released', 'uploads/doc-original/DOC-001-revA.docx', 'uploads/doc-pdf/DOC-001-revA.pdf', 1]);
        await run(`UPDATE Document SET current_revision_id = 1 WHERE id = 1`);

        console.log('Seeded 1 document and 1 revision.');
    } catch (error) {
        console.error('Error seeding documents:', error);
    } finally {
        db.close();
    }
}

seed();
