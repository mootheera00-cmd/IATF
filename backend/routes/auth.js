const express = require('express');
const router = express.Router();

// API สำหรับการ Log in
router.post('/login', (req, res) => {
    const { employee_code, password } = req.body;
    const db = req.db;

    if (!employee_code || !password) {
        return res.status(400).json({ message: 'กรุณากรอกรหัสพนักงานและรหัสผ่าน' });
    }

    // ดึงข้อมูลจาก users พร้อม role name
    const sql = `
        SELECT u.id, u.employee_code, u.name, u.password_hash, r.name as role 
        FROM users u 
        JOIN roles r ON u.role_id = r.id 
        WHERE u.employee_code = ? AND u.is_active = 1
    `;

    db.get(sql, [employee_code], (err, user) => {
        if (err) {
            console.error("❌ DB Error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        
        if (!user) {
            return res.status(401).json({ message: 'ไม่พบรหัสพนักงานนี้ในระบบ' });
        }

        // เช็ครหัสผ่าน - support both plain text and hash for migration
        const bcrypt = require('bcrypt');
        let passwordMatch = false;
        
        if (user.password_hash.startsWith('$2')) {
            // It's a bcrypt hash
            passwordMatch = bcrypt.compareSync(password, user.password_hash);
        } else {
            // Plain text password (for backward compatibility during migration)
            passwordMatch = (user.password_hash === password);
        }
        
        if (!passwordMatch) {
            return res.status(401).json({ message: 'รหัสผ่านไม่ถูกต้อง' });
        }

        // ส่งข้อมูลผู้ใช้ออกไป
        res.json({
            message: 'Login สำเร็จ',
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