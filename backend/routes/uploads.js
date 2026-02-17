// routes/uploads.js

const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.json({ message: "Uploads route working" });
});

module.exports = router;
