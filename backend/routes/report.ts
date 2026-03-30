const express = require('express');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const { reportBasePath } = require('../config/config');

const normalizeKeyword = (value: string) => String(value || '').trim().toUpperCase();

const loadLegacyConfigPath = () => {
  const candidateRoots = [
    process.cwd(),
    path.resolve(__dirname, '..', '..', '..'),
    path.resolve(__dirname, '..', '..', '..', '..'),
    path.resolve(__dirname, '..', '..', '..', '..', '..')
  ];

  const legacyConfigPath = candidateRoots
    .map((root) => path.join(root, 'Program Report Check  V1', 'config.json'))
    .find((candidate) => fs.existsSync(candidate));

  if (!legacyConfigPath) return '';

  try {
    const raw = fs.readFileSync(legacyConfigPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return String(parsed?.base_report_path || '').trim();
  } catch (error) {
    console.warn('Unable to read legacy report config:', error);
    return '';
  }
};

const normalizeBasePath = (value: string) => {
  if (!value) return '';
  const normalized = value.replace(/\\/g, path.sep).replace(/\//g, path.sep);
  return path.resolve(normalized);
};

const getBasePath = () => {
  const fromEnv = String(process.env.REPORT_BASE_PATH || '').trim();
  const fromLegacy = loadLegacyConfigPath();
  const selected = fromEnv || fromLegacy || reportBasePath || '';
  return normalizeBasePath(selected);
};

const ensureWithinBase = (base: string, target: string) => {
  const normalizedTarget = target.replace(/\//g, path.sep).replace(/\\/g, path.sep);
  const resolved = path.resolve(base, normalizedTarget);
  const normalizedBase = path.resolve(base) + path.sep;
  if (!resolved.startsWith(normalizedBase) && resolved !== path.resolve(base)) {
    throw new Error('Invalid path');
  }
  return resolved;
};

const normalizeFilename = (value: string) => String(value || '').trim().toUpperCase();

const findLatestPdf = (files: string[], prefix: string, folder: string, allowContains = false) => {
  let latestPath = '';
  let latestTime = 0;
  const upperPrefix = prefix.toUpperCase();

  files.forEach((file) => {
    const normalizedName = normalizeFilename(file);
    if (!normalizedName.toLowerCase().endsWith('.pdf')) return;
    const matchesPrefix = normalizedName.startsWith(upperPrefix);
    const matchesContains = allowContains && normalizedName.includes(upperPrefix);
    if (!matchesPrefix && !matchesContains) return;
    const fullPath = path.join(folder, file);
    const stats = fs.statSync(fullPath);
    if (stats.mtimeMs > latestTime) {
      latestTime = stats.mtimeMs;
      latestPath = fullPath;
    }
  });

  return latestPath;
};

router.get('/search', authRequired, (req: any, res: any) => {
  try {
    const keyword = normalizeKeyword(req.query.keyword as string);
    if (!keyword || !keyword.startsWith('APTX') || keyword.length < 6) {
      return res.status(400).json({ message: 'Invalid format. Use APTXxxxxx.' });
    }

    const basePath = getBasePath();
    if (!basePath || !fs.existsSync(basePath)) {
      return res.status(500).json({ message: 'Report base path not configured.' });
    }

    const yearShort = keyword.substring(4, 6);
    const yearFull = `20${yearShort}`;
    const yearFolder = path.join(basePath, `APTX Report ${yearFull}`);

    if (!fs.existsSync(yearFolder)) {
      return res.status(404).json({ message: `Year folder not found: ${yearFull}` });
    }

    const subfolders = fs.readdirSync(yearFolder, { withFileTypes: true });
    const targetDir = subfolders.find((entry: any) =>
      entry.isDirectory() && entry.name.toUpperCase().startsWith(keyword)
    );

    if (!targetDir) {
      return res.status(404).json({ message: `Folder not found for ${keyword}` });
    }

    const targetPath = path.join(yearFolder, targetDir.name);
    const files = fs.readdirSync(targetPath);

    const zeroPath = findLatestPdf(files, `0${keyword}`, targetPath, true);
    const standardPath = findLatestPdf(
      files.filter((file) => !normalizeFilename(file).startsWith(`0${keyword}`)),
      keyword,
      targetPath,
      true
    );

    if (!standardPath && !zeroPath) {
      return res.status(404).json({ message: `Found ${targetDir.name} but no PDF files.` });
    }

    const toResponse = (filePath: string) => {
      if (!filePath) return null;
      const relativePath = path.relative(basePath, filePath).replace(/\\/g, '/');
      return {
        fileName: path.basename(filePath),
        path: relativePath
      };
    };

    return res.json({
      keyword,
      standard: toResponse(standardPath),
      zero: toResponse(zeroPath)
    });
  } catch (error: any) {
    console.error('Report search error:', error);
    return res.status(500).json({ message: 'Report search failed.' });
  }
});

router.get('/file', authRequired, (req: any, res: any) => {
  try {
    const basePath = getBasePath();
    if (!basePath || !fs.existsSync(basePath)) {
      return res.status(500).json({ message: 'Report base path not configured.' });
    }

    const relativePath = String(req.query.path || '').replace(/\\/g, path.sep);
    if (!relativePath) {
      return res.status(400).json({ message: 'path query param is required.' });
    }

    const filePath = ensureWithinBase(basePath, relativePath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found.' });
    }

    const disposition = req.query.disposition === 'attachment' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${path.basename(filePath)}"`);
    return res.sendFile(filePath, (err: any) => {
      if (err && !res.headersSent) {
        console.error('sendFile error:', err);
        res.status(500).json({ message: 'Unable to send file.' });
      }
    });
  } catch (error: any) {
    console.error('Report file error:', error);
    return res.status(500).json({ message: 'Unable to load report file.' });
  }
});

const openFolder = (folderPath: string) => {
  if (process.platform === 'win32') {
    // explorer.exe needs spawn + detached; execFile often silently fails
    const child = spawn('explorer.exe', [folderPath], { detached: true, stdio: 'ignore' });
    child.unref();
    return;
  }
  if (process.platform === 'darwin') {
    execFile('open', [folderPath]);
    return;
  }
  execFile('xdg-open', [folderPath]);
};

router.post('/open-folder', authRequired, (req: any, res: any) => {
  try {
    const basePath = getBasePath();
    if (!basePath || !fs.existsSync(basePath)) {
      return res.status(500).json({ message: 'Report base path not configured.' });
    }

    const relativePath = String(req.body?.path || '').replace(/\\/g, path.sep);
    if (!relativePath) {
      return res.status(400).json({ message: 'path is required.' });
    }

    const filePath = ensureWithinBase(basePath, relativePath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found.' });
    }

    const folderPath = path.dirname(filePath);
    openFolder(folderPath);

    return res.json({ message: 'Opening folder.' });
  } catch (error: any) {
    console.error('Open folder error:', error);
    return res.status(500).json({ message: 'Unable to open folder.' });
  }
});

export = router;
