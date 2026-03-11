const CSV_SOURCES = {
  contratos:
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vQqrB9Vyai3BbY6qNgReC91xpD4ZETXN3s273e1bY_9ysp_78U4boSvLaQjBgtGgUKlqXJBB8bdRk2w/pub?gid=371113084&single=true&output=csv',
  entregas:
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vQsJ46qpuqVO3VvQLp9R3sLBJe7a5vLu02ae9nox4hyc4t9rnUAr74B3fqCA5dRmGyt6rDcuogbwvvU/pub?gid=0&single=true&output=csv',
  coletas:
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vQp8ZBJdS-SiRZQgUpUuycrORfLC1JzzkIjz2aGLqFELs9qbg1RMLPWdFtgmvaC6UuGt1SVKPv6ysC3/pub?gid=0&single=true&output=csv',
  veiculos:
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vQybI5KTowf4OiZci5-hCkN7iX4nx0ZVS1oFxOB9H2Bxm8Um4z3tiqtn9lhvl4iByxISR3Hr4qxxTx0/pub?gid=1596383573&single=true&output=csv',
};

const charts = {};
let unifiedData = [];
let contractsData = [];
let vehiclesData = [];

const fmtCurrency = (v) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const normalizeHeader = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[^\w\s]/g, '')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const parseMoney = (value) => {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const clean = String(value).replace(/R\$/g, '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : 0;
};

const parseDateFlexible = (value) => {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value)) return value;
  const asText = String(value).trim();
  const br = asText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const y = br[3].length === 2 ? `20${br[3]}` : br[3];
    return new Date(`${y}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`);
  }
  const parsed = new Date(asText);
  return isNaN(parsed) ? null : parsed;
};

const findField = (row, patterns, fallback = '') => {
  const entries = Object.entries(row);
  const found = entries.find(([k]) => patterns.some((p) => normalizeHeader(k).includes(p)));
  return found ? found[1] : fallback;
};

async function fetchCsv(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha HTTP ${response.status}`);
  const csvText = await response.text();
  return new Promise((resolve) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => resolve(data || []),
    });
  });
}

function getPeriodParts(d) {
  const date = new Date(d);
  const year = date.getFullYear();
  const month = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const week = `${year}-S${Math.ceil((date.getDate() + new Date(year, date.getMonth(), 1).getDay()) / 7)}`;
  const fortnight = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getDate() <= 15 ? 'Q1' : 'Q2'}`;
  const day = date.toISOString().slice(0, 10);
  return { day, week, fortnight, month };
}

function buildData(deliveries, pickups) {
  const operations = [...deliveries, ...pickups].map((row) => {
    const date = parseDateFlexible(findField(row, ['data', 'date'])) || new Date();
    const contract = findField(row, ['contrato', 'cliente', 'contract'], 'Sem contrato');
    const courier = findField(row, ['entregador', 'motorista', 'courier'], 'Não informado');
    const vehicle = findField(row, ['veiculo', 'placa', 'carro'], 'Não informado');
    const revenue = parseMoney(findField(row, ['receita', 'valor', 'faturamento', 'price']));
    const directCost = parseMoney(findField(row, ['custo', 'cost', 'despesa']));
    const type = findField(row, ['tipo']) || (pickups.includes(row) ? 'coleta' : 'entrega');

    return {
      date,
      day: getPeriodParts(date).day,
      week: getPeriodParts(date).week,
      fortnight: getPeriodParts(date).fortnight,
      month: getPeriodParts(date).month,
      contract,
      courier,
      vehicle,
      type: normalizeHeader(type).includes('coleta') ? 'coleta' : 'entrega',
      revenue,
      directCost,
    };
  });

  const vehicleCosts = vehiclesData.map((v) => ({
    vehicle: findField(v, ['veiculo', 'placa', 'carro'], 'Não informado'),
    fuel: parseMoney(findField(v, ['combustivel', 'fuel'])),
    rental: parseMoney(findField(v, ['aluguel', 'rental'])),
    insurance: parseMoney(findField(v, ['seguro', 'insurance'])),
    maintenance: parseMoney(findField(v, ['manutencao', 'maintenance'])),
  }));

  const costByVehicle = new Map();
  vehicleCosts.forEach((v) => {
    costByVehicle.set(v.vehicle, v.fuel + v.rental + v.insurance + v.maintenance);
  });

  const usageCount = operations.reduce((acc, op) => {
    acc[op.vehicle] = (acc[op.vehicle] || 0) + 1;
    return acc;
  }, {});

  operations.forEach((op) => {
    const allocatedVehicleCost = (costByVehicle.get(op.vehicle) || 0) / Math.max(1, usageCount[op.vehicle] || 1);
    op.totalCost = op.directCost + allocatedVehicleCost;
    op.profit = op.revenue - op.totalCost;
    op.margin = op.revenue ? (op.profit / op.revenue) * 100 : 0;
  });

  return operations;
}

function filterData(data) {
  const periodType = document.getElementById('periodType').value;
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  const courier = document.getElementById('courierFilter').value;
  const vehicle = document.getElementById('vehicleFilter').value;
  const contract = document.getElementById('contractFilter').value;

  return data.filter((row) => {
    const periodPass = (() => {
      if (periodType === 'all') return true;
      if (periodType === 'custom') {
        const d = row.day;
        return (!startDate || d >= startDate) && (!endDate || d <= endDate);
      }
      const key = periodType;
      const value = row[key];
      const start = startDate ? getPeriodParts(new Date(startDate))[key] : null;
      const end = endDate ? getPeriodParts(new Date(endDate))[key] : null;
      return (!start || value >= start) && (!end || value <= end);
    })();

    return (
      periodPass &&
      (courier === 'all' || row.courier === courier) &&
      (vehicle === 'all' || row.vehicle === vehicle) &&
      (contract === 'all' || row.contract === contract)
    );
  });
}

function renderKPIs(data) {
  const totalEntregas = data.filter((d) => d.type === 'entrega').length;
  const totalColetas = data.filter((d) => d.type === 'coleta').length;
  const receitaTotal = data.reduce((a, d) => a + d.revenue, 0);
  const custoTotal = data.reduce((a, d) => a + d.totalCost, 0);
  const lucro = receitaTotal - custoTotal;
  const custoMedio = totalEntregas ? custoTotal / totalEntregas : 0;

  const cards = [
    ['Total de Entregas', totalEntregas],
    ['Total de Coletas', totalColetas],
    ['Receita Total', fmtCurrency(receitaTotal)],
    ['Custo Total', fmtCurrency(custoTotal)],
    ['Lucro Líquido', fmtCurrency(lucro)],
    ['Custo Médio por Entrega', fmtCurrency(custoMedio)],
    ['Margem de Lucro', `${receitaTotal ? ((lucro / receitaTotal) * 100).toFixed(2) : '0.00'}%`],
    ['Custo por Entrega', fmtCurrency(custoMedio)],
  ];

  document.getElementById('kpis').innerHTML = cards
    .map(
      ([label, value]) => `<div class="bg-white rounded-xl shadow-sm p-4"><p class="text-xs text-slate-500">${label}</p><p class="text-2xl font-bold mt-2">${value}</p></div>`,
    )
    .join('');
}

function groupSum(data, groupBy, metric = 'totalCost') {
  return data.reduce((acc, row) => {
    acc[row[groupBy]] = (acc[row[groupBy]] || 0) + (row[metric] || 0);
    return acc;
  }, {});
}

function renderChart(id, type, labels, values, label) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), {
    type,
    data: {
      labels,
      datasets: [{ label, data: values, borderWidth: 2, backgroundColor: 'rgba(59,130,246,0.5)', borderColor: 'rgb(59,130,246)' }],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

function renderRankings(data) {
  const byCourier = {};
  data.forEach((r) => {
    if (!byCourier[r.courier]) byCourier[r.courier] = { deliveries: 0, pickups: 0, cost: 0, profit: 0 };
    byCourier[r.courier].deliveries += r.type === 'entrega' ? 1 : 0;
    byCourier[r.courier].pickups += r.type === 'coleta' ? 1 : 0;
    byCourier[r.courier].cost += r.totalCost;
    byCourier[r.courier].profit += r.profit;
  });

  const courierRank = Object.entries(byCourier)
    .map(([name, v]) => ({ name, efficiency: v.deliveries ? v.profit / v.deliveries : 0, ...v }))
    .sort((a, b) => b.efficiency - a.efficiency)
    .slice(0, 10);

  document.getElementById('courierRanking').innerHTML = courierRank
    .map(
      (r, i) => `<div class="flex justify-between border-b py-2"><span>${i + 1}. ${r.name}</span><span>Ent: ${r.deliveries} | Col: ${r.pickups} | Eficiência: ${fmtCurrency(r.efficiency)}</span></div>`,
    )
    .join('');

  const contractRank = Object.entries(groupSum(data, 'contract', 'profit'))
    .map(([contract, profit]) => ({ contract, profit }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10);

  document.getElementById('contractRanking').innerHTML = contractRank
    .map((r, i) => `<div class="flex justify-between border-b py-2"><span>${i + 1}. ${r.contract}</span><span>${fmtCurrency(r.profit)}</span></div>`)
    .join('');
}

function renderTable(data) {
  document.getElementById('detailTableBody').innerHTML = data
    .slice(0, 200)
    .map(
      (r) => `<tr class="border-b"><td class="p-2">${r.day}</td><td class="p-2">${r.courier}</td><td class="p-2">${r.type}</td><td class="p-2">${fmtCurrency(r.totalCost)}</td><td class="p-2">${r.contract}</td><td class="p-2">${r.vehicle}</td></tr>`,
    )
    .join('');
}

function renderDashboard() {
  const data = filterData(unifiedData);
  renderKPIs(data);

  const monthCost = groupSum(data, 'month', 'totalCost');
  renderChart('costByMonthChart', 'bar', Object.keys(monthCost), Object.values(monthCost), 'Custo por Mês');

  const monthDeliveries = groupSum(data.filter((d) => d.type === 'entrega'), 'month', 'revenue');
  renderChart('deliveriesByMonthChart', 'line', Object.keys(monthDeliveries), Object.values(monthDeliveries), 'Entregas por Mês (receita)');

  const contractProfit = groupSum(data, 'contract', 'profit');
  renderChart('profitByContractChart', 'bar', Object.keys(contractProfit), Object.values(contractProfit), 'Lucro por Contrato');

  const vehicleCosts = {
    Combustível: vehiclesData.reduce((a, v) => a + parseMoney(findField(v, ['combustivel', 'fuel'])), 0),
    Aluguel: vehiclesData.reduce((a, v) => a + parseMoney(findField(v, ['aluguel', 'rental'])), 0),
    Seguro: vehiclesData.reduce((a, v) => a + parseMoney(findField(v, ['seguro', 'insurance'])), 0),
    Manutenção: vehiclesData.reduce((a, v) => a + parseMoney(findField(v, ['manutencao', 'maintenance'])), 0),
  };
  renderChart('costTypeChart', 'pie', Object.keys(vehicleCosts), Object.values(vehicleCosts), 'Custos por Tipo');

  renderRankings(data);
  renderTable(data);
}

function setupFilters() {
  ['periodType', 'startDate', 'endDate', 'courierFilter', 'vehicleFilter', 'contractFilter'].forEach((id) => {
    document.getElementById(id).addEventListener('change', renderDashboard);
  });
}

function populateSelect(id, values) {
  const el = document.getElementById(id);
  const first = el.options[0];
  el.innerHTML = '';
  el.appendChild(first);
  [...new Set(values.filter(Boolean))].sort().forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    el.appendChild(opt);
  });
}

function exportExcel() {
  const data = filterData(unifiedData).map((r) => ({
    Data: r.day,
    Entregador: r.courier,
    Tipo: r.type,
    Contrato: r.contract,
    Veículo: r.vehicle,
    Receita: r.revenue,
    Custo: r.totalCost,
    Lucro: r.profit,
    Margem: r.margin,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
  XLSX.writeFile(wb, `relatorio-logistico-${Date.now()}.xlsx`);
}

function exportPdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const rows = filterData(unifiedData)
    .slice(0, 60)
    .map((r) => [r.day, r.courier, r.type, r.contract, r.vehicle, fmtCurrency(r.totalCost), fmtCurrency(r.profit)]);

  doc.text('Relatório de Custos Logísticos', 14, 14);
  doc.autoTable({
    head: [['Data', 'Entregador', 'Tipo', 'Contrato', 'Veículo', 'Custo', 'Lucro']],
    body: rows,
    startY: 20,
  });
  doc.save(`relatorio-logistico-${Date.now()}.pdf`);
}

async function init() {
  const status = document.getElementById('status');
  try {
    status.textContent = 'Carregando CSVs em tempo real...';
    const [contracts, deliveries, pickups, vehicles] = await Promise.all([
      fetchCsv(CSV_SOURCES.contratos),
      fetchCsv(CSV_SOURCES.entregas),
      fetchCsv(CSV_SOURCES.coletas),
      fetchCsv(CSV_SOURCES.veiculos),
    ]);

    contractsData = contracts;
    vehiclesData = vehicles;
    unifiedData = buildData(deliveries, pickups);

    populateSelect('courierFilter', unifiedData.map((d) => d.courier));
    populateSelect('vehicleFilter', unifiedData.map((d) => d.vehicle));
    populateSelect('contractFilter', unifiedData.map((d) => d.contract));

    setupFilters();
    renderDashboard();
    document.getElementById('exportExcel').addEventListener('click', exportExcel);
    document.getElementById('exportPdf').addEventListener('click', exportPdf);
    status.textContent = `Dados atualizados com sucesso. Operações carregadas: ${unifiedData.length} | Contratos: ${contractsData.length} | Veículos: ${vehiclesData.length}`;
  } catch (error) {
    console.error(error);
    status.textContent = `Erro ao carregar os CSVs: ${error.message}. Verifique CORS/permite publicação das planilhas.`;
  }
}

init();
