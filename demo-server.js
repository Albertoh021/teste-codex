const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.DEMO_PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  return 'text/plain; charset=utf-8';
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

const demoPayload = {
  metadata: {
    updatedAt: new Date().toISOString(),
    filters: { granularity: 'month', period: null, courier: null },
    mode: 'demo'
  },
  summary: {
    totalRevenue: 51230,
    totalCourierPayments: 20510,
    totalOperationalCost: 8140,
    totalCost: 28650,
    profit: 22580
  },
  records: [
    {
      type: 'entrega',
      dateKey: '2026-02-03',
      courier: 'Carlos',
      deliveriesCount: 30,
      revenue: 9200,
      courierPayment: 3600,
      operationalCost: 0,
      totalCost: 3600
    },
    {
      type: 'entrega',
      dateKey: '2026-02-07',
      courier: 'Marina',
      deliveriesCount: 28,
      revenue: 8700,
      courierPayment: 3450,
      operationalCost: 0,
      totalCost: 3450
    },
    {
      type: 'coleta',
      dateKey: '2026-02-09',
      pickupType: 'Programada',
      deliveriesCount: 0,
      revenue: 3100,
      courierPayment: 0,
      operationalCost: 510,
      totalCost: 510
    }
  ],
  grouped: {
    day: [
      {
        period: '2026-02-03',
        totalRevenue: 9200,
        totalCourierPayments: 3600,
        totalOperationalCost: 0,
        totalCost: 3600,
        profit: 5600
      },
      {
        period: '2026-02-07',
        totalRevenue: 8700,
        totalCourierPayments: 3450,
        totalOperationalCost: 0,
        totalCost: 3450,
        profit: 5250
      },
      {
        period: '2026-02-09',
        totalRevenue: 3100,
        totalCourierPayments: 0,
        totalOperationalCost: 510,
        totalCost: 510,
        profit: 2590
      }
    ],
    fortnight: [
      {
        period: '2026-02-Q1',
        totalRevenue: 51230,
        totalCourierPayments: 20510,
        totalOperationalCost: 8140,
        totalCost: 28650,
        profit: 22580
      }
    ],
    month: [
      {
        period: '2026-02',
        totalRevenue: 51230,
        totalCourierPayments: 20510,
        totalOperationalCost: 8140,
        totalCost: 28650,
        profit: 22580
      }
    ]
  },
  available: {
    couriers: ['Carlos', 'Marina'],
    periods: {
      day: ['2026-02-03', '2026-02-07', '2026-02-09'],
      fortnight: ['2026-02-Q1'],
      month: ['2026-02']
    }
  }
};

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/dashboard')) return sendJson(res, 200, demoPayload);
  if (req.url.startsWith('/api/health')) return sendJson(res, 200, { ok: true, demo: true, updatedAt: demoPayload.metadata.updatedAt });
  if (req.url.startsWith('/api/refresh')) return sendJson(res, 200, { ok: true, demo: true, updatedAt: new Date().toISOString() });
  if (req.url.startsWith('/api/export/excel')) return sendJson(res, 501, { error: 'No modo demo, exportação Excel não está habilitada.' });

  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.normalize(path.join(PUBLIC_DIR, filePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Demo server rodando em http://localhost:${PORT}`);
});
