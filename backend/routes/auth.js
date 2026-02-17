const express = require('express');
const router = express.Router();

// API สำหรับการ Log in
router.post('/login', (req, res) => {
    const { employee_code, password } = req.body;
    const db = req.db;

    if (!employee_code || !password) {
        return res.status(400).json({ message: 'กรุณากรอกรหัสพนักงานและรหัสผ่าน' });
    }

    // ดึงข้อมูลจาก users ตรงๆ (อ้างอิงตามโครงสร้างที่มีจริง)
    const sql = `SELECT * FROM users WHERE employee_code = ?`;

    db.get(sql, [employee_code], (err, user) => {
        if (err) {
            console.error("❌ DB Error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        
        if (!user) {
            return res.status(401).json({ message: 'ไม่พบรหัสพนักงานนี้ในระบบ' });
        }

        // เช็ครหัสผ่านแบบ Plain Text ตามที่บันทึกไว้
        if (user.password !== password) {
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