// middleware/validation.ts
function validateBody(requiredFields: string[]) {
  return (req: any, res: any, next: any) => {
    const body = req.body || {};
    const missing: string[] = [];

    requiredFields.forEach((field) => {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        missing.push(field);
      }
    });

    if (missing.length > 0) {
      return res.status(400).json({
        message: 'Validation error',
        missing_fields: missing
      });
    }

    next();
  };
}

function validateDocumentCreate(req: any, res: any, next: any) {
  const { doc_no, title, level, process_owner_id } = req.body;

  const missing: string[] = [];
  if (!doc_no) missing.push('doc_no');
  if (!title) missing.push('title');
  if (!level) missing.push('level');
  if (!process_owner_id) missing.push('process_owner_id');

  if (missing.length > 0) {
    return res.status(400).json({
      message: 'Validation error',
      missing_fields: missing
    });
  }

  if (typeof process_owner_id !== 'number') {
    return res.status(400).json({
      message: 'Validation error',
      details: 'process_owner_id must be a number'
    });
  }

  next();
}

export = {
  validateBody,
  validateDocumentCreate
};
