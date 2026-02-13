require('dotenv').config();

const path = require('path');
const express = require('express');
const ExcelJS = require('exceljs');
const { getCache, refreshData, startAutoRefresh } = require('./services/sheetsService');
const { computeSummary, groupByGranularity, filterRecords } = require('./utils/calculations');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function optionalBasicAuth(req, res, next) {
  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPass = process.env.BASIC_AUTH_PASS;

  if (!expectedUser || !expectedPass) return next();

  const authHeader = req.headers.authorization || '';
  const [type, token] = authHeader.split(' ');
  if (type !== 'Basic' || !token) {
    res.set('WWW-Authenticate', 'Basic realm="Dashboard"');
    return res.status(401).send('Autenticação necessária.');
  }

  const decoded = Buffer.from(token, 'base64').toString('utf-8');
  const [username, password] = decoded.split(':');

  if (username !== expectedUser || password !== expectedPass) {
    return res.status(403).send('Credenciais inválidas.');
  }

  return next();
}

app.use('/api', optionalBasicAuth);

app.get('/api/health', async (_req, res) => {
  const data = getCache();
  if (!data.updatedAt) await refreshData();
  res.json({ ok: true, updatedAt: getCache().updatedAt, error: getCache().error });
});

app.get('/api/dashboard', async (req, res) => {
  const { granularity = 'month', period, courier } = req.query;

  let data = getCache();
  if (!data.updatedAt) data = await refreshData();

  if (data.error) {
    return res.status(500).json({ error: data.error });
  }

  const filteredRecords = filterRecords(data.records, { granularity, period, courier });
  const summary = computeSummary(filteredRecords);
  const byDay = groupByGranularity(filteredRecords, 'day');
  const byFortnight = groupByGranularity(filteredRecords, 'fortnight');
  const byMonth = groupByGranularity(filteredRecords, 'month');

  const couriers = [...new Set(data.deliveries.map((item) => item.courier))].sort();

  return res.json({
    metadata: {
      updatedAt: data.updatedAt,
      filters: { granularity, period: period || null, courier: courier || null }
    },
    summary,
    records: filteredRecords,
    grouped: {
      day: byDay,
      fortnight: byFortnight,
      month: byMonth
    },
    available: {
      couriers,
      periods: {
        day: [...new Set(groupByGranularity(data.records, 'day').map((p) => p.period))],
        fortnight: [...new Set(groupByGranularity(data.records, 'fortnight').map((p) => p.period))],
        month: [...new Set(groupByGranularity(data.records, 'month').map((p) => p.period))]
      }
    }
  });
});

app.get('/api/export/excel', async (req, res) => {
  const { granularity = 'month', period, courier } = req.query;
  const data = getCache().updatedAt ? getCache() : await refreshData();

  if (data.error) return res.status(500).json({ error: data.error });

  const records = filterRecords(data.records, { granularity, period, courier });
  const summary = computeSummary(records);

  const workbook = new ExcelJS.Workbook();
  const summarySheet = workbook.addWorksheet('Resumo');
  const detailsSheet = workbook.addWorksheet('Detalhes');

  summarySheet.columns = [
    { header: 'Métrica', key: 'metric', width: 30 },
    { header: 'Valor', key: 'value', width: 20 }
  ];

  summarySheet.addRows([
    { metric: 'Total recebido', value: summary.totalRevenue },
    { metric: 'Total pago entregadores', value: summary.totalCourierPayments },
    { metric: 'Custos operacionais', value: summary.totalOperationalCost },
    { metric: 'Custo total', value: summary.totalCost },
    { metric: 'Lucro/Prejuízo', value: summary.profit }
  ]);

  detailsSheet.columns = [
    { header: 'Tipo', key: 'type', width: 12 },
    { header: 'Data', key: 'date', width: 14 },
    { header: 'Entregador', key: 'courier', width: 22 },
    { header: 'Tipo Coleta', key: 'pickupType', width: 18 },
    { header: 'Qtd Entregas', key: 'deliveriesCount', width: 14 },
    { header: 'Receita', key: 'revenue', width: 14 },
    { header: 'Pagamento Entregador', key: 'courierPayment', width: 20 },
    { header: 'Custo Operacional', key: 'operationalCost', width: 18 },
    { header: 'Custo Total', key: 'totalCost', width: 14 }
  ];

  for (const item of records) {
    detailsSheet.addRow({
      type: item.type,
      date: item.dateKey,
      courier: item.courier || '-',
      pickupType: item.pickupType || '-',
      deliveriesCount: item.deliveriesCount,
      revenue: item.revenue,
      courierPayment: item.courierPayment,
      operationalCost: item.operationalCost,
      totalCost: item.totalCost
    });
  }

  const fileName = `relatorio_${granularity}_${period || 'geral'}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  await workbook.xlsx.write(res);
  return res.end();
});

app.post('/api/refresh', async (_req, res) => {
  const data = await refreshData();
  if (data.error) return res.status(500).json({ error: data.error });
  return res.json({ ok: true, updatedAt: data.updatedAt });
});

app.listen(PORT, () => {
  startAutoRefresh();
  console.log(`Servidor em http://localhost:${PORT}`);
});
