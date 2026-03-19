const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
// Use bcryptjs for better compatibility on Windows environments without python/build tools
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { jwtSecret: SECRET_KEY, jwtExpiresIn } = require('../config/config');

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$.{53}$/;

// Rate limiter: max 10 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// API สำหรับการ Log in
router.post('/login', loginLimiter, (req: any, res: any) => {
    const { employee_code, password } = req.body;
    const normalizedEmployeeCode = typeof employee_code === 'string' ? employee_code.trim() : employee_code;
    const db = req.db;

    if (!normalizedEmployeeCode || !password) {
        return res.status(400).json({ message: 'กรุณากรอกรหัสพนักงานและรหัสผ่าน' });
    }

    // Join with roles table to get role name
    const sql = `
        SELECT u.*, r.name as role 
        FROM users u 
        LEFT JOIN roles r ON u.role_id = r.id 
        WHERE u.employee_code = ?
    `;

    db.get(sql, [normalizedEmployeeCode], async (err: any, user: any) => {
        if (err) {
            console.error("❌ DB Error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        
        if (!user) {
            return res.status(401).json({ message: 'ไม่พบรหัสพนักงานนี้ในระบบ' });
        }

        // Verify password using bcryptjs
        let passwordMatch = false;
        try {
            if (user.password_hash) {
                const isBcryptHash = BCRYPT_HASH_PATTERN.test(user.password_hash);
                if (isBcryptHash) {
                    passwordMatch = await bcrypt.compare(password, user.password_hash);

                    // Support legacy rows where plaintext password is still canonical.
                    if (!passwordMatch && user.password) {
                        passwordMatch = (user.password === password);
                    }
                } else {
                    // Legacy database may store plaintext in password_hash.
                    passwordMatch = (user.password_hash === password) || (user.password === password);

                    // Keep password column in sync for legacy rows.
                    if (passwordMatch && user.password !== password) {
                        db.run(
                            `UPDATE users SET password = ? WHERE id = ?`,
                            [password, user.id],
                            (updateErr: any) => {
                                if (updateErr) {
                                    console.error('⚠️ Legacy password sync failed:', updateErr.message);
                                }
                            }
                        );
                    }

                    // Auto-migrate legacy plaintext password to bcrypt hash.
                    if (passwordMatch) {
                        const upgradedHash = await bcrypt.hash(password, 10);
                        db.run(
                            `UPDATE users SET password_hash = ? WHERE id = ?`,
                            [upgradedHash, user.id],
                            (updateErr: any) => {
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

                if (passwordMatch) {
                    const upgradedHash = await bcrypt.hash(password, 10);
                    db.run(
                        `UPDATE users SET password_hash = ? WHERE id = ?`,
                        [upgradedHash, user.id],
                        (updateErr: any) => {
                            if (updateErr) {
                                console.error('⚠️ Password hash backfill failed:', updateErr.message);
                            }
                        }
                    );
                }
            }
        } catch (bcryptErr) {
            console.error("❌ Bcrypt Error:", bcryptErr);
            return res.status(500).json({ message: 'Authentication error processing password.' });
        }

        if (!passwordMatch) {
             return res.status(401).json({ message: 'รหัสผ่านไม่ถูกต้อง' });
        }

        // Generate JWT Token
        const token = jwt.sign(
            { id: user.id, role: user.role, employee_code: user.employee_code, name: user.name },
            SECRET_KEY,
            { expiresIn: jwtExpiresIn }
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

export = router;
