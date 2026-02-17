// routes/audit.js

const express = require("express");
const router = express.Router();

const { authRequired } = require("../middleware/auth");
const { requireRole } = require("../middleware/permissions");

// Create audit record → INTERNAL_AUDITOR หรือ ADMIN เท่านั้น
router.post(
  "/",
  authRequired,
  requireRole(["INTERNAL_AUDITOR", "ADMIN"]),
  (req, res) => {
    res.json({ message: "Audit record created" });
  }
);

// View audits → USER, INTERNAL_AUDITOR, ADMIN
router.get(
  "/",
  authRequired,
  requireRole(["USER", "INTERNAL_AUDITOR", "ADMIN"]),
  (req, res) => {
    res.json({ message: "Audit list" });
  }
);

module.exports = router;
