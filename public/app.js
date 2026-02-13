const state = {
  granularity: 'month',
  period: '',
  courier: ''
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

async function fetchDashboard() {
  const params = new URLSearchParams({
    granularity: state.granularity,
    period: state.period,
    courier: state.courier
  });

  try {
    const response = await fetch(`/api/dashboard?${params.toString()}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Falha ao carregar dados.' }));
      throw new Error(error.error || 'Falha ao carregar dados.');
    }
    return response.json();
  } catch (_error) {
    // Fallback para demonstração local sem backend completo
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

  container.innerHTML = cards
    .map(
      ([title, value, className = '']) =>
        `<article class="summary-card"><h3>${title}</h3><p class="${className}">${value}</p></article>`
    )
    .join('');
}

function updateTable(records) {
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = records
    .map((item) => {
      const person = item.type === 'entrega' ? item.courier : item.pickupType;
      return `
      <tr>
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
  const labels = data.map((entry) => entry.period);
  const revenue = data.map((entry) => entry.totalRevenue);
  const costs = data.map((entry) => entry.totalCost);
  const profit = data.map((entry) => entry.profit);

  if (chart) chart.destroy();

  chart = new Chart(document.getElementById('finance-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Receita', data: revenue, backgroundColor: '#2563eb' },
        { label: 'Custo', data: costs, backgroundColor: '#f59e0b' },
        { label: 'Lucro', data: profit, backgroundColor: '#16a34a' }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } }
    }
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

async function loadDashboard() {
  try {
    const payload = await fetchDashboard();
    updateSummary(payload.summary);
    updateTable(payload.records);
    updateChart(payload.grouped, state.granularity);
    fillFilterOptions(payload.available);
    document.getElementById('last-update').textContent = `Atualização: ${new Date(payload.metadata.updatedAt).toLocaleString('pt-BR')}`;
  } catch (error) {
    alert(error.message);
  }
}

async function triggerRefresh() {
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

  document.getElementById('refresh-btn').addEventListener('click', triggerRefresh);

  document.getElementById('theme-btn').addEventListener('click', () => {
    document.body.classList.toggle('dark');
  });

  document.getElementById('excel-btn').addEventListener('click', () => {
    const params = new URLSearchParams(state);
    window.open(`/api/export/excel?${params.toString()}`, '_blank');
  });

  document.getElementById('pdf-btn').addEventListener('click', () => window.print());
}

initEvents();
loadDashboard();
setInterval(loadDashboard, 60000);
