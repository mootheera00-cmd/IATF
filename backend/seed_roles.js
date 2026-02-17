const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/nskiatf_doccontrol.db');

db.serialize(() => {
    const roles = [
        { id: 1, name: 'ADMIN' },
        { id: 2, name: 'USER' },
        { id: 3, name: 'DOCUMENT_OWNER' },
        { id: 4, name: 'REVIEWER' },
        { id: 5, name: 'APPROVER' },
        { id: 6, name: 'DOCUMENT_CONTROL' },
        { id: 7, name: 'PROCESS_OWNER' },
        { id: 8, name: 'INTERNAL_AUDITOR' },
        { id: 9, name: 'MANAGEMENT_REP' },
        { id: 10, name: 'TOP_MANAGEMENT' },
        { id: 11, name: 'CHANGE_REQUESTER' },
        { id: 12, name: 'TRAINING_COORDINATOR' }
    ];

    roles.forEach(role => {
        db.run(
            "INSERT INTO roles (id, name) VALUES (?, ?)",
            [role.id, role.name],
            (err) => {
                if (err) {
                    console.error(`Skip ${role.name}:`, err.message);
                } else {
                    console.log(`Role ${role.name} inserted`);
                }
            }
        );
    });
});

db.close();
