// routes/uploads.ts
const express = require('express');
const router = express.Router();

router.get('/', (req: any, res: any) => {
  res.json({ message: 'Uploads route working' });
});

export = router;
