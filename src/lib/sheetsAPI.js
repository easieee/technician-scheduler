/**
 * Google Sheets API v4 helpers
 * All row operations use a soft approach: deletions clear the row content
 * so the row ID lookup stays consistent. Empty rows are filtered on read.
 */

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export const SHEET_HEADERS = {
  Technicians: ['id', 'name', 'email', 'phone', 'points', 'createdAt'],
  JobOrders: [
    'id', 'title', 'description', 'client', 'location', 'device',
    'date', 'startTime', 'endTime', 'technicianIds', 'status',
    'createdBy', 'createdByEmail', 'createdAt', 'isBackJob', 'originalJobId'
  ],
  JobHistory: [
    'id', 'title', 'description', 'client', 'location', 'device',
    'date', 'startTime', 'endTime', 'technicianIds',
    'createdBy', 'createdByEmail', 'createdAt', 'completedAt',
    'isBackJob', 'originalJobId'
  ],
  AuditLogs: ['id', 'type', 'title', 'description', 'timestamp', 'user', 'userEmail']
};

async function apiFetch(url, options = {}, token) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Sheets API error (${res.status})`);
  }
  return data;
}

function parseGvizPayload(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Invalid Google Sheets public response');
  }
  return JSON.parse(text.slice(start, end + 1));
}

function gvizTableToRows(table) {
  const headers = (table.cols || []).map(col => String(col.label || col.id || '').trim());
  const rows = (table.rows || []).map(r =>
    (r.c || []).map(cell => {
      if (!cell) return '';
      if (cell.f !== undefined && cell.f !== null) return String(cell.f);
      if (cell.v !== undefined && cell.v !== null) return String(cell.v);
      return '';
    })
  );
  return [headers, ...rows];
}

async function fetchPublicSheetValues(spreadsheetId, sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&tqx=out:json`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Public sheet read failed (${res.status})`);
  }
  const payload = parseGvizPayload(text);
  if (payload.status !== 'ok' || !payload.table) {
    const detail = payload.errors?.[0]?.detailed_message || payload.errors?.[0]?.message || 'Unknown error';
    throw new Error(`Public sheet read failed: ${detail}`);
  }
  return gvizTableToRows(payload.table);
}

function getHeaderIndexMap(headerRow = [], sheetName) {
  const normalized = headerRow.map(h => String(h || '').trim());
  const expected = SHEET_HEADERS[sheetName] || [];
  const map = {};

  expected.forEach((field, idx) => {
    const found = normalized.indexOf(field);
    map[field] = found >= 0 ? found : idx;
  });

  return map;
}

function rowToObject(row, sheetName, headerIndexMap = null) {
  const headers = SHEET_HEADERS[sheetName];
  const obj = {};
  headers.forEach((h, i) => {
    const col = headerIndexMap ? headerIndexMap[h] : i;
    obj[h] = row[col] ?? '';
  });

  // Parse arrays stored as pipe-separated strings
  if (obj.technicianIds !== undefined) {
    obj.technicianIds = obj.technicianIds
      ? obj.technicianIds.split('|').filter(Boolean)
      : [];
  }
  // Parse numeric points
  if (obj.points !== undefined) {
    obj.points = parseInt(obj.points, 10) || 0;
  }
  return obj;
}

function objectToRow(obj, sheetName) {
  const headers = SHEET_HEADERS[sheetName];
  return headers.map(h => {
    const v = obj[h];
    if (h === 'technicianIds' && Array.isArray(v)) return v.join('|');
    return v !== undefined && v !== null ? String(v) : '';
  });
}

/** Read all non-empty rows from a sheet, returns array of objects */
export async function getAllRows(spreadsheetId, sheetName, token) {
  try {
    const values = token
      ? (await apiFetch(
          `${BASE}/${spreadsheetId}/values/${sheetName}`,
          {},
          token
        )).values || []
      : await fetchPublicSheetValues(spreadsheetId, sheetName);
    if (values.length === 0) return [];

    const headerIndexMap = getHeaderIndexMap(values[0], sheetName);
    const idCol = headerIndexMap.id ?? 0;

    // Skip header row (row[0]) and empty rows
    return values
      .slice(1)
      .filter(row => {
        if (!row || !row[idCol]) return false;
        return String(row[idCol]).trim().toLowerCase() !== 'id';
      })
      .map(row => rowToObject(row, sheetName, headerIndexMap));
  } catch (err) {
    console.error(`getAllRows(${sheetName}):`, err.message);
    return [];
  }
}

/** Append a new row to a sheet */
export async function appendRow(spreadsheetId, sheetName, obj, token) {
  const row = objectToRow(obj, sheetName);
  return apiFetch(
    `${BASE}/${spreadsheetId}/values/${sheetName}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: [row] }) },
    token
  );
}

/** Update an existing row identified by its id */
export async function updateRowById(spreadsheetId, sheetName, id, updates, token) {
  const data = await apiFetch(
    `${BASE}/${spreadsheetId}/values/${sheetName}`,
    {},
    token
  );
  const values = data.values || [];
  const headerIndexMap = getHeaderIndexMap(values[0], sheetName);
  const idCol = headerIndexMap.id ?? 0;

  // rowIndex in the values array (0 = header, 1+ = data)
  const rowIndex = values.findIndex((row, i) => i > 0 && row[idCol] === id);
  if (rowIndex === -1) throw new Error(`Row id=${id} not found in ${sheetName}`);

  // Build the current object, then merge updates
  const current = rowToObject(values[rowIndex], sheetName, headerIndexMap);
  const merged = { ...current, ...updates };
  const newRow = objectToRow(merged, sheetName);

  const sheetRowNum = rowIndex + 1; // 1-based sheet row
  return apiFetch(
    `${BASE}/${spreadsheetId}/values/${sheetName}!A${sheetRowNum}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: [newRow] }) },
    token
  );
}

/** Clear a row's cells (soft delete) — row is then filtered out on read */
export async function deleteRowById(spreadsheetId, sheetName, id, token) {
  const data = await apiFetch(
    `${BASE}/${spreadsheetId}/values/${sheetName}`,
    {},
    token
  );
  const values = data.values || [];
  const headerIndexMap = getHeaderIndexMap(values[0], sheetName);
  const idCol = headerIndexMap.id ?? 0;
  const rowIndex = values.findIndex((row, i) => i > 0 && row[idCol] === id);
  if (rowIndex === -1) throw new Error(`Row id=${id} not found in ${sheetName}`);

  const sheetRowNum = rowIndex + 1;
  const emptyRow = new Array(SHEET_HEADERS[sheetName].length).fill('');
  return apiFetch(
    `${BASE}/${spreadsheetId}/values/${sheetName}!A${sheetRowNum}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: [emptyRow] }) },
    token
  );
}

/**
 * Ensure all required sheet tabs exist and have their header row.
 * Creates missing tabs automatically — safe to call on every load.
 */
export async function initializeSheets(spreadsheetId, token) {
  if (!token) return;

  // 1. Fetch spreadsheet metadata to see which tabs already exist
  const meta = await apiFetch(
    `${BASE}/${spreadsheetId}?fields=sheets(properties(title))`,
    {},
    token
  );
  const existing = new Set((meta.sheets || []).map(s => s.properties.title));

  // 2. Create any missing tabs in one batch request
  const missing = Object.keys(SHEET_HEADERS).filter(name => !existing.has(name));
  if (missing.length > 0) {
    await apiFetch(
      `${BASE}/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: missing.map(title => ({ addSheet: { properties: { title } } }))
        })
      },
      token
    );
  }

  // 3. Ensure every tab has its header row
  for (const [sheetName, headers] of Object.entries(SHEET_HEADERS)) {
    try {
      const data = await apiFetch(
        `${BASE}/${spreadsheetId}/values/${sheetName}!A1:Z1`,
        {},
        token
      );
      if (!data.values || data.values.length === 0 || data.values[0][0] !== headers[0]) {
        await apiFetch(
          `${BASE}/${spreadsheetId}/values/${sheetName}!A1?valueInputOption=RAW`,
          { method: 'PUT', body: JSON.stringify({ values: [headers] }) },
          token
        );
      }
    } catch (err) {
      console.warn(`Could not init headers for ${sheetName}:`, err.message);
    }
  }
}
