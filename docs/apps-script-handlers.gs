/**
 * B.fter Ops — Apps Script handlers (defensive)
 *
 * Paste into your Apps Script project (overwrite Code.gs) and re-deploy.
 * Works with the app's exact wire format:
 *
 *   GET  ?action=ping
 *   GET  ?action=getSheet&sheetName=<tab>
 *   POST ?action=findRow      body: { sheetName, columnName, value }
 *   POST ?action=appendRow    body: { sheetName, values: { col: val, ... } }
 *   POST ?action=updateRow    body: { sheetName, rowNumber, values: { col: val, ... } }
 *   POST ?action=batchAppendRows  body: { sheetName, rows: [ { col: val, ... }, ... ] }
 *   POST ?action=batchUpdateRows  body: { sheetName, updates: [ { rowNumber, values: { col: val, ... } }, ... ] }
 *   POST ?action=strictAppendRow  body: { sheetName, expectedHeaders, values: { col: val, ... } }
 *   POST ?action=strictUpdateRow  body: { sheetName, expectedHeaders, rowNumber, values: { col: val, ... } }
 *   POST ?action=strictBatchAppendRows  body: { sheetName, expectedHeaders: [string,...], rows: [...] }
 *        Strict variant of batchAppendRows: requires the sheet to already
 *        contain ALL of expectedHeaders by name. Never auto-creates columns,
 *        never reorders. Returns { ok:false, error:"Schema mismatch ..." }
 *        when any expected header is missing. If the sheet is completely
 *        empty (no header row at all), seeds the headers in canonical order
 *        on first call only.
 *
 * Defensive features:
 *   - If a sheet is missing, returns a clear error (does NOT auto-create).
 *   - If a sheet has NO header row, appendRow auto-writes the keys of `values`
 *     as the header row before appending the data. (So a brand-new empty tab
 *     gets initialized on first append.)
 *   - If `values` contains a key not yet present as a column header, the
 *     column is auto-added at the end (header expansion).
 *   - updateRow with an empty sheet returns a precise error rather than the
 *     opaque "number of columns must be at least 1".
 *   - Every action returns { ok, ... } with HTTP 200 even on logical errors,
 *     so the app sees `ok: false` + `error`.
 *
 * Tabs the app may write to (extend in 시트 초기화 only if you want a header row
 * preset; the auto-expand path also works for any tab on first append):
 *   원료재고, 품목마스터, 품목BOM, 품목생산LOT, 세트옵션, 세트구성품목,
 *   세트조립LOT, 완제품세트재고, 출고이력, 작업이력, 원가설정,
 *   원가계산        ← 1개당 원가 계산 스냅샷
 *   BOM템플릿       ← 품목BOM에 일괄 적용 가능한 공통 베이스 자재 묶음
 *
 * NOTE: this file never resets or deletes data. The only mutating actions are
 * appendRow / updateRow (per-row) and initializeSheets (per-sheet, never
 * touches existing data).
 */

function doGet(e)  { return _dispatch(e); }
function doPost(e) { return _dispatch(e); }

function _dispatch(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "";
    var body = {};
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); }
      catch (err) { return _json({ ok: false, error: "Invalid JSON body: " + err.message }); }
    }
    if (!action && body.action) action = body.action;

    switch (action) {
      case "ping":             return _json({ ok: true, message: "Apps Script API connected" });
      case "getSheet":         return _json(_getSheet(body.sheetName || (e.parameter && e.parameter.sheetName)));
      case "findRow":          return _json(_findRow(body.sheetName, body.columnName, body.value));
      case "appendRow":        return _json(_appendRow(body.sheetName, body.values));
      case "updateRow":        return _json(_updateRow(body.sheetName, body.rowNumber, body.values));
      case "batchAppendRows":  return _json(_batchAppendRows(body.sheetName, body.rows));
      case "batchUpdateRows":  return _json(_batchUpdateRows(body.sheetName, body.updates));
      case "strictAppendRow":  return _json(_strictAppendRow(body.sheetName, body.expectedHeaders, body.values));
      case "strictUpdateRow":  return _json(_strictUpdateRow(body.sheetName, body.expectedHeaders, body.rowNumber, body.values));
      case "strictBatchAppendRows": return _json(_strictBatchAppendRows(body.sheetName, body.expectedHeaders, body.rows));
      case "initializeSheets": return _json(_initializeSheets(body.specs));
      default:                 return _json({ ok: false, error: "Unknown action: " + action });
    }
  } catch (err) {
    return _json({ ok: false, error: String(err && err.stack || err) });
  }
}

// ─── Helpers ───────────────────────────────────────────────

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _openSheet(sheetName) {
  if (!sheetName) throw new Error("sheetName is required");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found: " + sheetName);
  return sheet;
}

function _headerMap(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return { headers: [], indexByName: {} };
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var indexByName = {};
  for (var i = 0; i < headers.length; i++) {
    var key = String(headers[i] || "");
    if (key !== "") indexByName[key] = i;
  }
  return { headers: headers, indexByName: indexByName };
}

function _writeHeaders(sheet, headers) {
  if (!headers || headers.length === 0) {
    throw new Error("Cannot initialize empty sheet — no column names provided in 'values'.");
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

// ─── getSheet ──────────────────────────────────────────────

function _getSheet(sheetName) {
  var sheet = _openSheet(sheetName);
  var range = sheet.getDataRange();
  var values = range.getValues();
  if (values.length <= 1) return { ok: true, data: [] };
  var headers = values[0];
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = {};
    for (var c = 0; c < headers.length; c++) row[String(headers[c])] = values[r][c];
    rows.push(row);
  }
  return { ok: true, data: rows };
}

// ─── findRow ───────────────────────────────────────────────
// String-compares so itemNo stored as a number still matches "101".

function _findRow(sheetName, columnName, value) {
  var sheet = _openSheet(sheetName);
  var map = _headerMap(sheet);
  if (map.headers.length === 0) return { ok: true, rowNumber: null };
  var col = map.indexByName[String(columnName)];
  if (col === undefined) return { ok: false, error: "Unknown column: " + columnName };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, rowNumber: null };
  var colValues = sheet.getRange(2, col + 1, lastRow - 1, 1).getValues();
  var needle = String(value);
  for (var i = 0; i < colValues.length; i++) {
    if (String(colValues[i][0]) === needle) return { ok: true, rowNumber: i + 2 };
  }
  return { ok: true, rowNumber: null };
}

// ─── Header reconciliation (used by append + update) ───────

function _ensureHeaders(sheet, valueKeys) {
  // Returns the (possibly-expanded) header array and indexByName.
  var map = _headerMap(sheet);
  var needsWrite = false;
  // If sheet is empty, seed with the value keys verbatim.
  if (map.headers.length === 0) {
    map.headers = valueKeys.slice();
    for (var i = 0; i < map.headers.length; i++) map.indexByName[String(map.headers[i])] = i;
    needsWrite = true;
  } else {
    // Append any new columns at the end.
    for (var j = 0; j < valueKeys.length; j++) {
      var k = String(valueKeys[j]);
      if (k === "" || map.indexByName[k] !== undefined) continue;
      map.headers.push(k);
      map.indexByName[k] = map.headers.length - 1;
      needsWrite = true;
    }
  }
  if (needsWrite) _writeHeaders(sheet, map.headers);
  return map;
}

function _writeRowFromObject(sheet, rowNumber, values, isAppend) {
  var valueKeys = Object.keys(values || {});
  var map = _ensureHeaders(sheet, valueKeys);

  var row;
  if (isAppend) {
    row = new Array(map.headers.length);
    for (var i = 0; i < row.length; i++) row[i] = "";
  } else {
    if (map.headers.length === 0) {
      throw new Error("Cannot update row in a sheet with no headers");
    }
    row = sheet.getRange(rowNumber, 1, 1, map.headers.length).getValues()[0];
  }

  for (var key in values) {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      var col = map.indexByName[String(key)];
      if (col !== undefined) row[col] = values[key];
    }
  }

  if (isAppend) {
    sheet.appendRow(row);
    return sheet.getLastRow();
  } else {
    sheet.getRange(rowNumber, 1, 1, map.headers.length).setValues([row]);
    return rowNumber;
  }
}

function _appendRow(sheetName, values) {
  if (!values || typeof values !== "object") return { ok: false, error: "values must be an object" };
  var sheet = _openSheet(sheetName);
  var rowNumber = _writeRowFromObject(sheet, 0, values, true);
  return { ok: true, rowNumber: rowNumber };
}

function _updateRow(sheetName, rowNumber, values) {
  if (!rowNumber || rowNumber < 2) return { ok: false, error: "rowNumber must be >= 2 (1 is header row)" };
  if (!values || typeof values !== "object") return { ok: false, error: "values must be an object" };
  var sheet = _openSheet(sheetName);
  var lastRow = sheet.getLastRow();
  if (rowNumber > lastRow) return { ok: false, error: "rowNumber " + rowNumber + " is past the last data row " + lastRow };
  _writeRowFromObject(sheet, rowNumber, values, false);
  return { ok: true };
}

// ─── batchAppendRows ───────────────────────────────────────
// One header reconciliation pass + a single setValues for the appended block.
// `rows` is an array of objects keyed by column name. Returns the row number
// of each appended row.
function _batchAppendRows(sheetName, rows) {
  if (!Array.isArray(rows)) return { ok: false, error: "rows must be an array" };
  if (rows.length === 0) return { ok: true, rowNumbers: [] };
  var sheet = _openSheet(sheetName);

  // Union of every key across the batch — single header expansion.
  var keysSeen = {};
  var keyList = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r || typeof r !== "object") return { ok: false, error: "rows[" + i + "] must be an object" };
    for (var k in r) {
      if (Object.prototype.hasOwnProperty.call(r, k) && !keysSeen[k]) {
        keysSeen[k] = true;
        keyList.push(k);
      }
    }
  }
  var map = _ensureHeaders(sheet, keyList);

  // Build a values matrix the size of (rows.length × headers.length).
  var matrix = new Array(rows.length);
  for (var ri = 0; ri < rows.length; ri++) {
    var row = new Array(map.headers.length);
    for (var ci = 0; ci < row.length; ci++) row[ci] = "";
    var src = rows[ri];
    for (var key in src) {
      if (Object.prototype.hasOwnProperty.call(src, key)) {
        var col = map.indexByName[String(key)];
        if (col !== undefined) row[col] = src[key];
      }
    }
    matrix[ri] = row;
  }

  var startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, matrix.length, map.headers.length).setValues(matrix);
  var rowNumbers = new Array(matrix.length);
  for (var i2 = 0; i2 < matrix.length; i2++) rowNumbers[i2] = startRow + i2;
  return { ok: true, rowNumbers: rowNumbers };
}

// ─── Strict write helpers (no auto-create, no reorder) ────
// Returns either { ok:false, error:string } or { ok:true, map }.
function _validateStrictHeaders(sheet, expectedHeaders) {
  if (!Array.isArray(expectedHeaders) || expectedHeaders.length === 0) {
    return { ok: false, error: "expectedHeaders[] is required" };
  }
  var map = _headerMap(sheet);
  if (map.headers.length === 0) {
    // Seed canonical headers exactly once for a brand-new empty tab.
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    try { sheet.getRange(1, 1, 1, expectedHeaders.length).setFontWeight("bold"); } catch (e) {}
    try { sheet.setFrozenRows(1); } catch (e) {}
    map = _headerMap(sheet);
  }
  var missing = [];
  for (var i = 0; i < expectedHeaders.length; i++) {
    var h = String(expectedHeaders[i]);
    if (map.indexByName[h] === undefined) missing.push(h);
  }
  if (missing.length > 0) {
    return {
      ok: false,
      error: "Schema mismatch on '" + sheet.getName() + "' — missing columns: " + missing.join(", "),
    };
  }
  return { ok: true, map: map };
}

function _strictAppendRow(sheetName, expectedHeaders, values) {
  if (!values || typeof values !== "object") return { ok: false, error: "values must be an object" };
  var sheet = _openSheet(sheetName);
  var v = _validateStrictHeaders(sheet, expectedHeaders);
  if (!v.ok) return v;
  var map = v.map;
  var ncols = map.headers.length;
  var row = new Array(ncols);
  for (var i = 0; i < ncols; i++) row[i] = "";
  for (var key in values) {
    if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
    var col = map.indexByName[String(key)];
    if (col !== undefined) row[col] = values[key];
    // unknown keys silently dropped (no auto-create per spec)
  }
  var startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, 1, ncols).setValues([row]);
  return { ok: true, rowNumber: startRow };
}

function _strictUpdateRow(sheetName, expectedHeaders, rowNumber, values) {
  if (!rowNumber || rowNumber < 2) return { ok: false, error: "rowNumber must be >= 2 (1 is header row)" };
  if (!values || typeof values !== "object") return { ok: false, error: "values must be an object" };
  var sheet = _openSheet(sheetName);
  var lastRow = sheet.getLastRow();
  if (rowNumber > lastRow) return { ok: false, error: "rowNumber " + rowNumber + " is past last data row " + lastRow };
  var v = _validateStrictHeaders(sheet, expectedHeaders);
  if (!v.ok) return v;
  var map = v.map;
  var ncols = map.headers.length;
  var row = sheet.getRange(rowNumber, 1, 1, ncols).getValues()[0];
  for (var key in values) {
    if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
    var col = map.indexByName[String(key)];
    if (col !== undefined) row[col] = values[key];
  }
  sheet.getRange(rowNumber, 1, 1, ncols).setValues([row]);
  return { ok: true };
}

// ─── strictBatchAppendRows ─────────────────────────────────
// Schema-validating append.
//   - `expectedHeaders` must be a non-empty array of column names.
//   - If the sheet has no header row at all, seed `expectedHeaders` as the
//     row 1 (canonical order). This is the only path that writes headers.
//   - Otherwise, the existing header row must contain EVERY name in
//     `expectedHeaders` (extras the user already has in the sheet are
//     tolerated and untouched). Any missing → ok:false with a clear error.
//   - Writes by column-name mapping. Keys in `rows[i]` that aren't in the
//     header row are silently dropped (no auto-create).
function _strictBatchAppendRows(sheetName, expectedHeaders, rows) {
  if (!Array.isArray(expectedHeaders) || expectedHeaders.length === 0) {
    return { ok: false, error: "expectedHeaders[] is required" };
  }
  if (!Array.isArray(rows)) return { ok: false, error: "rows must be an array" };
  if (rows.length === 0) return { ok: true, rowNumbers: [] };

  var sheet = _openSheet(sheetName);
  var map = _headerMap(sheet);

  // Seed canonical headers only when the sheet is completely empty.
  if (map.headers.length === 0) {
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    try { sheet.getRange(1, 1, 1, expectedHeaders.length).setFontWeight("bold"); } catch (e) {}
    try { sheet.setFrozenRows(1); } catch (e) {}
    map = _headerMap(sheet);
  }

  // Strict validation: every expected header must already be a column name.
  var missing = [];
  for (var i = 0; i < expectedHeaders.length; i++) {
    var h = String(expectedHeaders[i]);
    if (map.indexByName[h] === undefined) missing.push(h);
  }
  if (missing.length > 0) {
    return {
      ok: false,
      error: "Schema mismatch on '" + sheetName + "' — missing columns: " + missing.join(", "),
    };
  }

  var ncols = map.headers.length;
  var matrix = new Array(rows.length);
  for (var ri = 0; ri < rows.length; ri++) {
    var row = new Array(ncols);
    for (var ci = 0; ci < ncols; ci++) row[ci] = "";
    var src = rows[ri];
    if (!src || typeof src !== "object") {
      return { ok: false, error: "rows[" + ri + "] must be an object" };
    }
    for (var key in src) {
      if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
      var col = map.indexByName[String(key)];
      if (col !== undefined) row[col] = src[key];
      // Unknown columns are dropped — never auto-create per spec.
    }
    matrix[ri] = row;
  }

  var startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, matrix.length, ncols).setValues(matrix);
  var rowNumbers = new Array(matrix.length);
  for (var rn = 0; rn < matrix.length; rn++) rowNumbers[rn] = startRow + rn;
  return { ok: true, rowNumbers: rowNumbers };
}

// ─── batchUpdateRows ───────────────────────────────────────
// `updates`: [{ rowNumber, values }, ...]. Header reconciliation once, then
// read affected rows in one getValues, mutate in memory, write back in one
// setValues *per contiguous block* — collapses N round-trips to ~1-2.
function _batchUpdateRows(sheetName, updates) {
  if (!Array.isArray(updates)) return { ok: false, error: "updates must be an array" };
  if (updates.length === 0) return { ok: true };
  var sheet = _openSheet(sheetName);
  var lastRow = sheet.getLastRow();

  // Union of keys across the batch.
  var keysSeen = {};
  var keyList = [];
  for (var i = 0; i < updates.length; i++) {
    var u = updates[i];
    if (!u || typeof u.rowNumber !== "number" || u.rowNumber < 2) {
      return { ok: false, error: "updates[" + i + "].rowNumber must be >= 2" };
    }
    if (u.rowNumber > lastRow) {
      return { ok: false, error: "updates[" + i + "].rowNumber " + u.rowNumber + " is past last data row " + lastRow };
    }
    if (!u.values || typeof u.values !== "object") {
      return { ok: false, error: "updates[" + i + "].values must be an object" };
    }
    for (var k in u.values) {
      if (Object.prototype.hasOwnProperty.call(u.values, k) && !keysSeen[k]) {
        keysSeen[k] = true;
        keyList.push(k);
      }
    }
  }
  var map = _ensureHeaders(sheet, keyList);
  if (map.headers.length === 0) {
    return { ok: false, error: "Cannot update rows in a sheet with no headers" };
  }

  // Sort updates by rowNumber so we can collapse adjacent rows into blocks.
  updates = updates.slice().sort(function (a, b) { return a.rowNumber - b.rowNumber; });

  // Group into contiguous blocks.
  var blocks = [];
  var blockStart = updates[0].rowNumber;
  var blockEnd = blockStart;
  var blockItems = [updates[0]];
  for (var j = 1; j < updates.length; j++) {
    var rn = updates[j].rowNumber;
    if (rn === blockEnd + 1) {
      blockEnd = rn;
      blockItems.push(updates[j]);
    } else if (rn === blockEnd) {
      // Two updates on the same row — merge later in the apply step.
      blockItems.push(updates[j]);
    } else {
      blocks.push({ start: blockStart, end: blockEnd, items: blockItems });
      blockStart = rn;
      blockEnd = rn;
      blockItems = [updates[j]];
    }
  }
  blocks.push({ start: blockStart, end: blockEnd, items: blockItems });

  var ncols = map.headers.length;
  for (var b = 0; b < blocks.length; b++) {
    var blk = blocks[b];
    var rowCount = blk.end - blk.start + 1;
    var range = sheet.getRange(blk.start, 1, rowCount, ncols);
    var current = range.getValues();
    for (var ii = 0; ii < blk.items.length; ii++) {
      var item = blk.items[ii];
      var localIdx = item.rowNumber - blk.start;
      var v = item.values;
      for (var key in v) {
        if (Object.prototype.hasOwnProperty.call(v, key)) {
          var col = map.indexByName[String(key)];
          if (col !== undefined) current[localIdx][col] = v[key];
        }
      }
    }
    range.setValues(current);
  }
  return { ok: true, count: updates.length };
}

// ─── initializeSheets ──────────────────────────────────────
// Body: { specs: [ { sheetName, headers: [string,...] }, ... ] }
// Per-sheet behavior:
//   - Sheet missing            → create with headers      → status "created"
//   - Sheet exists, no data    → write headers to row 1   → status "header-added"
//   - Sheet exists, has data   → skip (do not overwrite)  → status "skipped"
//   - Bad spec                 → status "error"
// Never overwrites existing data or existing headers.

function _initializeSheets(specs) {
  if (!Array.isArray(specs)) return { ok: false, error: "specs must be an array of {sheetName, headers}" };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var results = [];
  for (var i = 0; i < specs.length; i++) {
    var spec = specs[i] || {};
    var name = spec.sheetName;
    var headers = spec.headers;
    try {
      if (!name || !Array.isArray(headers) || headers.length === 0) {
        results.push({ sheetName: name || "?", status: "error", message: "잘못된 명세" });
        continue;
      }
      var sheet = ss.getSheetByName(name);
      if (!sheet) {
        sheet = ss.insertSheet(name);
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        // Bold the header row for clarity
        try { sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold"); } catch (e) {}
        sheet.setFrozenRows(1);
        results.push({ sheetName: name, status: "created", message: "시트 생성 + 헤더 작성" });
        continue;
      }
      var lastCol = sheet.getLastColumn();
      var lastRow = sheet.getLastRow();
      if (lastCol === 0 || lastRow === 0) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        try { sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold"); } catch (e) {}
        sheet.setFrozenRows(1);
        results.push({ sheetName: name, status: "header-added", message: "비어 있던 시트에 헤더 추가" });
        continue;
      }
      results.push({ sheetName: name, status: "skipped", message: "이미 존재 (데이터 보존)" });
    } catch (err) {
      results.push({ sheetName: name || "?", status: "error", message: String(err && err.message || err) });
    }
  }
  return { ok: true, results: results };
}
