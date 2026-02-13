/**
 * Converte data em diferentes formatos (dd/mm/yyyy, yyyy-mm-dd, serial do Excel) para Date.
 */
function parseFlexibleDate(value) {
  if (!value && value !== 0) return null;

  if (value instanceof Date && !isNaN(value.getTime())) return value;

  if (typeof value === 'number') {
    // Serial do Excel / Google Sheets (base 1899-12-30)
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const converted = new Date(excelEpoch.getTime() + value * 86400000);
    return isNaN(converted.getTime()) ? null : converted;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const iso = new Date(raw);
    return isNaN(iso.getTime()) ? null : iso;
  }

  // dd/mm/yyyy ou dd-mm-yyyy
  const localMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (localMatch) {
    const [, d, m, y] = localMatch;
    const year = y.length === 2 ? `20${y}` : y;
    const date = new Date(Number(year), Number(m) - 1, Number(d));
    return isNaN(date.getTime()) ? null : date;
  }

  const fallback = new Date(raw);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  const normalized = String(value).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDeliveryRow(row) {
  const date = parseFlexibleDate(row[0]);
  return {
    type: 'entrega',
    date,
    dateKey: date ? date.toISOString().slice(0, 10) : null,
    courier: (row[1] || 'Não informado').toString().trim(),
    deliveriesCount: toNumber(row[2]),
    revenue: toNumber(row[3]),
    courierPayment: toNumber(row[4]),
    operationalCost: 0,
    totalCost: toNumber(row[4]),
    sourceRow: row
  };
}

function normalizePickupRow(row) {
  const date = parseFlexibleDate(row[0]);
  return {
    type: 'coleta',
    date,
    dateKey: date ? date.toISOString().slice(0, 10) : null,
    pickupType: (row[1] || 'Não informado').toString().trim(),
    revenue: toNumber(row[2]),
    operationalCost: toNumber(row[3]),
    courierPayment: 0,
    deliveriesCount: 0,
    totalCost: toNumber(row[3]),
    sourceRow: row
  };
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
  const profit = totalRevenue - totalCost;

  return {
    totalRevenue,
    totalCourierPayments,
    totalOperationalCost,
    totalCost,
    profit
  };
}

function groupByGranularity(records, granularity) {
  const grouped = new Map();

  for (const item of records) {
    if (!item.date) continue;
    const key = getPeriodKey(item.date, granularity);
    if (!grouped.has(key)) {
      grouped.set(key, { key, records: [] });
    }
    grouped.get(key).records.push(item);
  }

  return [...grouped.values()]
    .map((entry) => ({
      period: entry.key,
      ...computeSummary(entry.records)
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

function filterRecords(records, filters = {}) {
  const { granularity = 'month', period, courier } = filters;

  return records.filter((item) => {
    if (!item.date) return false;
    if (period && getPeriodKey(item.date, granularity) !== period) return false;
    if (courier && item.type === 'entrega' && item.courier !== courier) return false;
    if (courier && item.type === 'coleta') return false;
    return true;
  });
}

module.exports = {
  parseFlexibleDate,
  normalizeDeliveryRow,
  normalizePickupRow,
  computeSummary,
  groupByGranularity,
  filterRecords,
  getPeriodKey
};
