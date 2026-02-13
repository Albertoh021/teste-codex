const { google } = require('googleapis');
const {
  normalizeDeliveryRow,
  normalizePickupRow
} = require('../utils/calculations');

const {
  GOOGLE_SHEETS_SPREADSHEET_ID,
  GOOGLE_SHEETS_DELIVERIES_RANGE = 'ENTREGAS!A:E',
  GOOGLE_SHEETS_PICKUPS_RANGE = 'COLETAS!A:D',
  REFRESH_INTERVAL_MS = '60000',
  GOOGLE_SERVICE_ACCOUNT_JSON
} = process.env;

let cache = {
  updatedAt: null,
  records: [],
  deliveries: [],
  pickups: [],
  error: null
};

function buildAuthClient() {
  if (GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
  }

  return new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
}

async function fetchSheetValues(sheets, range) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID,
    range
  });
  return response.data.values || [];
}

function stripHeader(rows) {
  if (!rows.length) return rows;
  return rows.slice(1);
}

async function refreshData() {
  if (!GOOGLE_SHEETS_SPREADSHEET_ID) {
    cache.error = 'GOOGLE_SHEETS_SPREADSHEET_ID não configurado.';
    return cache;
  }

  try {
    const auth = buildAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    const [deliveryRowsRaw, pickupRowsRaw] = await Promise.all([
      fetchSheetValues(sheets, GOOGLE_SHEETS_DELIVERIES_RANGE),
      fetchSheetValues(sheets, GOOGLE_SHEETS_PICKUPS_RANGE)
    ]);

    const deliveries = stripHeader(deliveryRowsRaw).map(normalizeDeliveryRow).filter((r) => r.date);
    const pickups = stripHeader(pickupRowsRaw).map(normalizePickupRow).filter((r) => r.date);
    const records = [...deliveries, ...pickups].sort((a, b) => a.date - b.date);

    cache = {
      updatedAt: new Date().toISOString(),
      deliveries,
      pickups,
      records,
      error: null
    };
  } catch (error) {
    cache.error = `Erro ao consultar Google Sheets: ${error.message}`;
  }

  return cache;
}

function getCache() {
  return cache;
}

function startAutoRefresh() {
  refreshData();
  setInterval(refreshData, Number(REFRESH_INTERVAL_MS));
}

module.exports = {
  refreshData,
  getCache,
  startAutoRefresh
};
