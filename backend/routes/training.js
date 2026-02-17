// routes/training.js

const express = require("express");
const router = express.Router();

const { authRequired } = require("../middleware/auth");
const { requireRole } = require("../middleware/permissions");

// Assign training → เฉพาะ TRAINING_COORDINATOR และ ADMIN
router.post(
  "/assign",
  authRequired,
  requireRole(["TRAINING_COORDINATOR", "ADMIN"]),
  (req, res) => {
    res.json({ message: "Training assigned successfully" });
  }
);

// View training → USER, TRAINING_COORDINATOR, ADMIN
router.get(
  "/",
  authRequired,
  requireRole(["USER", "TRAINING_COORDINATOR", "ADMIN"]),
  (req, res) => {
    res.json({ message: "Training list" });
  }
);

module.exports = router;
