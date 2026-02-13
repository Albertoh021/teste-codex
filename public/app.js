const state = {
  granularity: 'month',
  period: '',
  courier: '',
  source: 'api',
  localRecords: []
};

let chart;

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function parseFlexibleDate(value) {
  if (!value && value !== 0) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === 'number') return new Date(Math.round((value - 25569) * 86400 * 1000));

  const text = String(value).trim();
  if (!text) return null;

  const local = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (local) {
    const [, d, m, y] = local;
    const year = y.length === 2 ? `20${y}` : y;
    const date = new Date(Number(year), Number(m) - 1, Number(d));
    return isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(text);
  return isNaN(date.getTime()) ? null : date;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  const normalized = String(value).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPeriodKey(date, granularity) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  if (granularity === 'day') return `${year}-${month}-${day}`;
  if (granularity === 'month') return `${year}-${month}`;
  const fortnight = date.getDate() <= 15 ? 'Q1' : 'Q2';
  return `${year}-${month}-${fortnight}`;
}

function computeSummary(records) {
  const totalRevenue = records.reduce((acc, item) => acc + item.revenue, 0);
  const totalCourierPayments = records.reduce((acc, item) => acc + item.courierPayment, 0);
  const totalOperationalCost = records.reduce((acc, item) => acc + item.operationalCost, 0);
  const totalCost = totalCourierPayments + totalOperationalCost;
  return { totalRevenue, totalCourierPayments, totalOperationalCost, totalCost, profit: totalRevenue - totalCost };
}

function groupBy(records, granularity) {
  const map = new Map();
  for (const item of records) {
    if (!item.date) continue;
    const key = getPeriodKey(item.date, granularity);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return [...map.entries()].map(([period, items]) => ({ period, ...computeSummary(items) })).sort((a, b) => a.period.localeCompare(b.period));
}

function filterLocalRecords(records) {
  return records.filter((item) => {
    if (state.period && getPeriodKey(item.date, state.granularity) !== state.period) return false;
    if (state.courier && item.type === 'entrega' && item.courier !== state.courier) return false;
    if (state.courier && item.type === 'coleta') return false;
    return true;
  });
}

function localDashboardPayload() {
  const filtered = filterLocalRecords(state.localRecords);
  const all = state.localRecords;
  return {
    metadata: { updatedAt: new Date().toISOString(), filters: { granularity: state.granularity, period: state.period || null, courier: state.courier || null }, source: 'upload' },
    summary: computeSummary(filtered),
    records: filtered,
    grouped: { day: groupBy(filtered, 'day'), fortnight: groupBy(filtered, 'fortnight'), month: groupBy(filtered, 'month') },
    available: {
      couriers: [...new Set(all.filter((r) => r.type === 'entrega').map((r) => r.courier))].sort(),
      periods: {
        day: [...new Set(groupBy(all, 'day').map((p) => p.period))],
        fortnight: [...new Set(groupBy(all, 'fortnight').map((p) => p.period))],
        month: [...new Set(groupBy(all, 'month').map((p) => p.period))]
      }
    }
  };
}

async function fetchDashboard() {
  if (state.source === 'upload' && state.localRecords.length) return localDashboardPayload();

  const params = new URLSearchParams({ granularity: state.granularity, period: state.period, courier: state.courier });

  try {
    const response = await fetch(`/api/dashboard?${params.toString()}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Falha ao carregar dados.' }));
      throw new Error(error.error || 'Falha ao carregar dados.');
    }
    return response.json();
  } catch (_error) {
    const fallback = await fetch('/demo-data.json');
    if (!fallback.ok) throw new Error('Falha ao carregar dados.');
    return fallback.json();
  }
}

function updateSummary(summary) {
  const container = document.getElementById('summary-grid');
  const cards = [
    ['Total recebido', formatCurrency(summary.totalRevenue)],
    ['Total pago entregadores', formatCurrency(summary.totalCourierPayments)],
    ['Custos operacionais', formatCurrency(summary.totalOperationalCost)],
    ['Custo total', formatCurrency(summary.totalCost)],
    ['Lucro/Prejuízo', formatCurrency(summary.profit), summary.profit >= 0 ? 'profit-positive' : 'profit-negative']
  ];

  container.innerHTML = cards.map(([title, value, className = '']) => `<article class="summary-card"><h3>${title}</h3><p class="${className}">${value}</p></article>`).join('');
}

function updateTable(records) {
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = records
    .map((item) => {
      const person = item.type === 'entrega' ? item.courier : item.pickupType;
      return `<tr>
        <td>${escapeHtml(item.type)}</td>
        <td>${escapeHtml(item.dateKey || '-')}</td>
        <td>${escapeHtml(person || '-')}</td>
        <td>${item.deliveriesCount || 0}</td>
        <td>${formatCurrency(item.revenue)}</td>
        <td>${formatCurrency(item.courierPayment)}</td>
        <td>${formatCurrency(item.operationalCost)}</td>
        <td>${formatCurrency(item.totalCost)}</td>
      </tr>`;
    })
    .join('');
}

function updateChart(grouped, granularity) {
  const data = grouped[granularity] || [];
  if (chart) chart.destroy();
  chart = new Chart(document.getElementById('finance-chart'), {
    type: 'bar',
    data: {
      labels: data.map((entry) => entry.period),
      datasets: [
        { label: 'Receita', data: data.map((entry) => entry.totalRevenue), backgroundColor: '#2563eb' },
        { label: 'Custo', data: data.map((entry) => entry.totalCost), backgroundColor: '#f59e0b' },
        { label: 'Lucro', data: data.map((entry) => entry.profit), backgroundColor: '#16a34a' }
      ]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
}

function fillFilterOptions(available) {
  const periodSelect = document.getElementById('period');
  const courierSelect = document.getElementById('courier');

  const periods = available.periods[state.granularity] || [];
  periodSelect.innerHTML = '<option value="">Todos</option>' + periods.map((p) => `<option value="${p}">${p}</option>`).join('');
  periodSelect.value = state.period;

  courierSelect.innerHTML = '<option value="">Todos</option>' + available.couriers.map((c) => `<option value="${c}">${c}</option>`).join('');
  courierSelect.value = state.courier;
}

function normalizeDeliveryRow(row) {
  const date = parseFlexibleDate(row[0]);
  if (!date) return null;
  return {
    type: 'entrega',
    date,
    dateKey: date.toISOString().slice(0, 10),
    courier: (row[1] || 'Não informado').toString().trim(),
    deliveriesCount: toNumber(row[2]),
    revenue: toNumber(row[3]),
    courierPayment: toNumber(row[4]),
    operationalCost: 0,
    totalCost: toNumber(row[4])
  };
}

function normalizePickupRow(row) {
  const date = parseFlexibleDate(row[0]);
  if (!date) return null;
  return {
    type: 'coleta',
    date,
    dateKey: date.toISOString().slice(0, 10),
    pickupType: (row[1] || 'Não informado').toString().trim(),
    deliveriesCount: 0,
    revenue: toNumber(row[2]),
    courierPayment: 0,
    operationalCost: toNumber(row[3]),
    totalCost: toNumber(row[3])
  };
}

function sheetToRows(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }).slice(1);
}

async function onUploadFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const deliveryRows = sheetToRows(workbook, 'ENTREGAS');
  const pickupRows = sheetToRows(workbook, 'COLETAS');

  if (!deliveryRows.length && !pickupRows.length) {
    alert('Não encontrei abas ENTREGAS/COLETAS com dados.');
    return;
  }

  const deliveries = deliveryRows.map(normalizeDeliveryRow).filter(Boolean);
  const pickups = pickupRows.map(normalizePickupRow).filter(Boolean);
  state.localRecords = [...deliveries, ...pickups].sort((a, b) => a.date - b.date);
  state.source = 'upload';
  state.period = '';
  state.courier = '';

  await loadDashboard();
}

async function loadDashboard() {
  try {
    const payload = await fetchDashboard();
    updateSummary(payload.summary);
    updateTable(payload.records);
    updateChart(payload.grouped, state.granularity);
    fillFilterOptions(payload.available);
    const mode = state.source === 'upload' ? ' (arquivo local)' : '';
    document.getElementById('last-update').textContent = `Atualização: ${new Date(payload.metadata.updatedAt).toLocaleString('pt-BR')}${mode}`;
  } catch (error) {
    alert(error.message);
  }
}

async function triggerRefresh() {
  if (state.source === 'upload') return loadDashboard();

  const response = await fetch('/api/refresh', { method: 'POST' });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Falha na atualização.' }));
    alert(error.error);
    return;
  }
  await loadDashboard();
}

function initEvents() {
  document.getElementById('apply-filter').addEventListener('click', async () => {
    state.granularity = document.getElementById('granularity').value;
    state.period = document.getElementById('period').value;
    state.courier = document.getElementById('courier').value;
    await loadDashboard();
  });

  document.getElementById('granularity').addEventListener('change', async (event) => {
    state.granularity = event.target.value;
    state.period = '';
    await loadDashboard();
  });

  document.getElementById('sheet-upload').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (file) await onUploadFile(file);
  });

  document.getElementById('clear-upload').addEventListener('click', async () => {
    state.source = 'api';
    state.localRecords = [];
    document.getElementById('sheet-upload').value = '';
    await loadDashboard();
  });

  document.getElementById('refresh-btn').addEventListener('click', triggerRefresh);
  document.getElementById('theme-btn').addEventListener('click', () => document.body.classList.toggle('dark'));

  document.getElementById('excel-btn').addEventListener('click', () => {
    if (state.source === 'upload') {
      alert('No modo arquivo local, use Exportar PDF (impressão) ou rode backend completo para Excel servidor.');
      return;
    }
    const params = new URLSearchParams(state);
    window.open(`/api/export/excel?${params.toString()}`, '_blank');
  });

  document.getElementById('pdf-btn').addEventListener('click', () => window.print());
}

initEvents();
loadDashboard();
setInterval(() => {
  if (state.source !== 'upload') loadDashboard();
}, 60000);
