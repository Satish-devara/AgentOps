// Production-Ready Zero-Dependency HTTP & REST Server
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const config = require('./src/config');
const conversationEngine = require('./src/agent/conversationEngine');
const crmStore = require('./src/crm/crmStore');
const calendarService = require('./src/crm/calendarService');
const ragEngine = require('./src/rag/ragEngine');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ics': 'text/calendar; charset=utf-8'
};

function sendJSON(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-cache'
  });
  res.end(payload);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 2e6) { // 2MB limit
        req.connection.destroy();
        reject(new Error('Body payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  try {
    // API ROUTES
    if (pathname === '/api/health' && method === 'GET') {
      return sendJSON(res, 200, { status: 'healthy', uptime: process.uptime(), agent: config.AGENT.name });
    }

    if (pathname === '/api/chat' && method === 'POST') {
      const body = await parseBody(req);
      const sessionId = body.sessionId || `SESSION-${Date.now()}`;
      const text = body.text || '';
      const clientMetadata = {
        lead: body.lead || {},
        language: body.language
      };

      const result = await conversationEngine.processTurn(sessionId, text, clientMetadata);
      return sendJSON(res, 200, { sessionId, ...result });
    }

    if (pathname === '/api/summarize' && method === 'POST') {
      const body = await parseBody(req);
      const sessionId = body.sessionId;
      if (!sessionId) {
        return sendJSON(res, 400, { error: 'sessionId is required' });
      }

      const summary = conversationEngine.endSession(sessionId);
      if (!summary) {
        return sendJSON(res, 404, { error: 'Session not found' });
      }

      return sendJSON(res, 200, {
        sessionId,
        summary,
        metrics: crmStore.getMetrics()
      });
    }

    if (pathname === '/api/leads' && method === 'GET') {
      return sendJSON(res, 200, {
        leads: crmStore.getLeads(),
        metrics: crmStore.getMetrics(),
        activities: crmStore.getActivities().slice(0, 10)
      });
    }

    if (pathname === '/api/leads' && method === 'POST') {
      const body = await parseBody(req);
      const lead = crmStore.upsertLead(body);
      return sendJSON(res, 200, { lead, metrics: crmStore.getMetrics() });
    }

    if (pathname === '/api/calendar/slots' && method === 'GET') {
      return sendJSON(res, 200, {
        slots: calendarService.getSlots(),
        appointments: crmStore.getAppointments()
      });
    }

    if (pathname === '/api/calendar/book' && method === 'POST') {
      const body = await parseBody(req);
      const result = calendarService.bookSlot(body.slotId, body.lead || {});
      if (result.success) {
        crmStore.addAppointment({
          leadId: body.lead?.id,
          leadName: body.lead?.name || 'Prospective Client',
          company: body.lead?.company || 'Company Inc',
          host: result.slot.host,
          dateTime: result.slot.isoDateTime,
          slotText: `${result.slot.date} at ${result.slot.time}`
        });
      }
      return sendJSON(res, result.success ? 200 : 400, result);
    }

    if (pathname === '/api/calendar/download-ics' && method === 'GET') {
      const slotText = parsedUrl.query.slot || 'Tomorrow 2PM EST';
      const company = parsedUrl.query.company || 'Enterprise';
      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//ApexAI Technologies//Autonomous Voice SDR//EN',
        'BEGIN:VEVENT',
        `UID:APEX-${Date.now()}@apexai.io`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
        `DTSTART:${new Date(Date.now() + 86400000).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
        `DTEND:${new Date(Date.now() + 86400000 + 1800000).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
        `SUMMARY:ApexAI Solutions Walkthrough - ${company}`,
        `DESCRIPTION:Executive demo with Sarah Chen (Principal Enterprise AE). Meeting link: https://meet.google.com/apex-ai-demo`,
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR'
      ].join('\r\n');

      res.writeHead(200, {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ApexAI-Demo-Invite.ics"'
      });
      return res.end(ics);
    }

    if (pathname === '/api/rag/search' && method === 'GET') {
      const query = parsedUrl.query.q || '';
      const matches = ragEngine.search(query, 5);
      return sendJSON(res, 200, { query, count: matches.length, matches });
    }

    if (pathname === '/api/reset' && method === 'POST') {
      crmStore.seedInitialData();
      crmStore.save();
      return sendJSON(res, 200, { message: 'Demo CRM data reset successfully' });
    }

    // STATIC FILE SERVING (public folder)
    let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '') safePath = '/index.html';

    const filePath = path.join(__dirname, 'public', safePath);

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        // Fallback to index.html for SPA
        const indexPath = path.join(__dirname, 'public', 'index.html');
        fs.readFile(indexPath, (readErr, content) => {
          if (readErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('404 Not Found');
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(content);
        });
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(filePath, (readErr, content) => {
        if (readErr) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          return res.end('Error loading file');
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      });
    });

  } catch (serverErr) {
    console.error('Server error handling request:', serverErr);
    sendJSON(res, 500, { error: 'Internal server error', details: serverErr.message });
  }
});

const PORT = config.PORT;
server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 ApexAI Sales Voice Agent Server running on http://localhost:${PORT}`);
  console.log(`🎙️  Interactive Voice Console: http://localhost:${PORT}`);
  console.log(`📊 CRM Dashboard:            http://localhost:${PORT}/#crm`);
  console.log(`🧠 RAG Semantic Search:       http://localhost:${PORT}/#rag`);
  console.log(`=======================================================`);
});
