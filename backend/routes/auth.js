const express = require('express');
const router = express.Router();
// Use bcryptjs for better compatibility on Windows environments without python/build tools
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.SECRET_KEY || 'dev-secret';
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$.{53}$/;

// API สำหรับการ Log in
router.post('/login', (req, res) => {
    const { employee_code, password } = req.body;
    const db = req.db;

    console.log(`[LOGIN ATTEMPT] User: ${employee_code}`);

    if (!employee_code || !password) {
        return res.status(400).json({ message: 'กรุณากรอกรหัสพนักงานและรหัสผ่าน' });
    }

    // Join with roles table to get role name
    const sql = `
        SELECT u.*, r.name as role 
        FROM users u 
        LEFT JOIN roles r ON u.role_id = r.id 
        WHERE u.employee_code = ?
    `;

    db.get(sql, [employee_code], async (err, user) => {
        if (err) {
            console.error("❌ DB Error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        
        if (!user) {
            console.log(`[LOGIN FAILED] User not found: ${employee_code}`);
            return res.status(401).json({ message: 'ไม่พบรหัสพนักงานนี้ในระบบ' });
        }

        console.log(`[LOGIN FOUND] User: ${user.name}, Role: ${user.role}`);

        // Verify password using bcryptjs
        let passwordMatch = false;
        try {
            if (user.password_hash) {
                const isBcryptHash = BCRYPT_HASH_PATTERN.test(user.password_hash);
                if (isBcryptHash) {
                    passwordMatch = await bcrypt.compare(password, user.password_hash);
                } else {
                    // Legacy database may store plaintext in password_hash.
                    passwordMatch = (user.password_hash === password);

                    // Auto-migrate legacy plaintext password to bcrypt hash.
                    if (passwordMatch) {
                        const upgradedHash = await bcrypt.hash(password, 10);
                        db.run(
                            `UPDATE users SET password_hash = ? WHERE id = ?`,
                            [upgradedHash, user.id],
                            (updateErr) => {
                                if (updateErr) {
                                    console.error('⚠️ Password hash auto-migration failed:', updateErr.message);
                                }
                            }
                        );
                    }
                }
            } else if (user.password) {
                // Fallback for plaintext (legacy)
                passwordMatch = (user.password === password);
            }
        } catch (bcryptErr) {
            console.error("❌ Bcrypt Error:", bcryptErr);
            return res.status(500).json({ message: 'Authentication error processing password.' });
        }

        if (!passwordMatch) {
             console.log(`[LOGIN FAILED] Invalid password for ${employee_code}`);
             return res.status(401).json({ message: 'รหัสผ่านไม่ถูกต้อง' });
        }

        console.log(`[LOGIN SUCCESS] ${employee_code} authenticated as ${user.role}`);

        // Generate JWT Token
        const token = jwt.sign(
            { id: user.id, role: user.role, employee_code: user.employee_code, name: user.name },
            SECRET_KEY,
            { expiresIn: '24h' }
        );

        // Send response
        res.json({
            message: 'Login สำเร็จ',
            token,
            user: {
                id: user.id,
                name: user.name,
                role: user.role, 
                employee_code: user.employee_code
            }
        });
    });
});

module.exports = router;