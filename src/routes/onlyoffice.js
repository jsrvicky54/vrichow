const express = require('express');
const ebooks = require('../services/ebooks');
const { getSettings, verifyToken } = require('../lib/onlyoffice');

const router = express.Router();
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 && id < 2147483647 ? id : null;
}

router.get('/file/:id', async (req, res, next) => {
  try {
    const settings = getSettings();
    const id = parseId(req.params.id);
    const claims = verifyToken(req.query.token, settings && settings.secret);
    if (!settings || !id || !claims || claims.scope !== 'file' || claims.id !== id) {
      return res.sendStatus(401);
    }
    const document = await ebooks.findById(id);
    if (!document) return res.sendStatus(404);
    const isSpreadsheet = document.filename.toLowerCase().endsWith('.xlsx');
    const isWordDocument = document.filename.toLowerCase().endsWith('.docx');
    if (!isSpreadsheet && !isWordDocument) return res.sendStatus(404);
    res.set({
      'Content-Type': isSpreadsheet ? XLSX_TYPE : DOCX_TYPE,
      'Content-Disposition': `inline; filename="${document.filename.replace(/["\\\r\n]/g, '_')}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    res.send(document.file_data);
  } catch (err) {
    next(err);
  }
});

router.post('/callback/:id', express.json({ limit: '64kb' }), async (req, res) => {
  try {
    const settings = getSettings();
    const id = parseId(req.params.id);
    const claims = verifyToken(req.query.token, settings && settings.secret);
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 1 });
    }
    const authorization = String(req.get('authorization') || '');
    const serverToken = authorization.replace(/^Bearer\s+/i, '') || body.token;
    const serverClaims = verifyToken(serverToken, settings && settings.secret);
    if (
      !settings || !id || !claims || claims.scope !== 'callback' || claims.id !== id ||
      !serverClaims || serverClaims.key !== claims.key || body.key !== claims.key
    ) return res.status(403).json({ error: 1 });

    if ([1, 4].includes(body.status)) return res.json({ error: 0 });
    if ([3, 7].includes(body.status)) return res.json({ error: 1 });
    if (![2, 6].includes(body.status) || typeof body.url !== 'string') {
      return res.status(400).json({ error: 1 });
    }

    const downloadUrl = new URL(body.url);
    if (downloadUrl.origin !== settings.docsOrigin) return res.status(400).json({ error: 1 });
    const response = await fetch(downloadUrl, { redirect: 'error' });
    if (!response.ok) throw new Error(`ONLYOFFICE document fetch failed with HTTP ${response.status}`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_FILE_BYTES) return res.status(413).json({ error: 1 });
    const content = Buffer.from(await response.arrayBuffer());
    if (
      content.length > MAX_FILE_BYTES ||
      !content.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    ) return res.status(400).json({ error: 1 });

    await ebooks.updateFile(id, content);
    return res.json({ error: 0 });
  } catch (err) {
    console.error('ONLYOFFICE save callback failed:', err);
    return res.status(500).json({ error: 1 });
  }
});

module.exports = router;
