/**
 * 주간 작업보고 — Google Sheets 백엔드 (Apps Script 웹앱)
 *
 * ▶ 설치
 *   1) 보고를 저장할 Google 스프레드시트를 하나 만든다.
 *   2) 그 시트에서 [확장 프로그램] → [Apps Script] 열기.
 *   3) Code.gs 에 이 파일 전체를 붙여넣고 저장.
 *   4) [배포] → [새 배포] → 유형 '웹 앱'
 *        - 실행: 나(본인)
 *        - 액세스: 모든 사용자  (앱 서버가 호출할 수 있어야 함)
 *   5) 배포 URL(.../exec)을 복사해 Vercel 환경변수 WR_APPS_SCRIPT_URL 에 넣는다.
 *
 * 탭(없으면 첫 저장 때 자동 생성):
 *   주간보고  — id, weekStart, weekEnd, team, author, thisWeek, nextWeek,
 *               issues, status, managerNote, createdAt, updatedAt
 *   팀원      — id, team, name           (미제출자 집계/이름선택용, 선택)
 *
 * 와이어 포맷:
 *   POST ?action=getSheet     { sheetName }                  → { ok, data:[{col:val}] }
 *   POST ?action=appendRow    { sheetName, values:{col:val} }→ { ok }
 *   POST ?action=updateRow    { sheetName, rowNumber, values }→ { ok }
 *   POST ?action=findRow      { sheetName, columnName, value}→ { ok, rowNumber }
 */

function doGet(e)  { return _dispatch(e); }
function doPost(e) { return _dispatch(e); }

function _dispatch(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "";
    var body = {};
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch (err) {
        return _json({ ok: false, error: "Invalid JSON: " + err.message });
      }
    }
    if (!action && body.action) action = body.action;

    switch (action) {
      case "ping":      return _json({ ok: true, message: "connected" });
      case "getSheet":  return _json(_getSheet(body.sheetName));
      case "appendRow": return _json(_appendRow(body.sheetName, body.values));
      case "updateRow": return _json(_updateRow(body.sheetName, body.rowNumber, body.values));
      case "findRow":   return _json(_findRow(body.sheetName, body.columnName, body.value));
      default:          return _json({ ok: false, error: "Unknown action: " + action });
    }
  } catch (err) {
    return _json({ ok: false, error: String(err && err.stack || err) });
  }
}

function _json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function _sheet(name, createIfMissing) {
  if (!name) throw new Error("sheetName required");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh && createIfMissing) sh = ss.insertSheet(name);
  return sh;
}

function _headerMap(sh) {
  var lastCol = sh.getLastColumn();
  if (lastCol === 0) return { headers: [], idx: {} };
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = {};
  for (var i = 0; i < headers.length; i++) {
    var k = String(headers[i] || "");
    if (k) idx[k] = i;
  }
  return { headers: headers, idx: idx };
}

function _getSheet(name) {
  var sh = _sheet(name, false);
  if (!sh) return { ok: true, data: [] };   // 없으면 빈 목록
  var values = sh.getDataRange().getValues();
  if (values.length <= 1) return { ok: true, data: [] };
  var headers = values[0], rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = {};
    for (var c = 0; c < headers.length; c++) row[String(headers[c])] = values[r][c];
    rows.push(row);
  }
  return { ok: true, data: rows };
}

function _ensureHeaders(sh, keys) {
  var map = _headerMap(sh);
  if (map.headers.length === 0) {
    sh.getRange(1, 1, 1, keys.length).setValues([keys]);
    try { sh.getRange(1, 1, 1, keys.length).setFontWeight("bold"); sh.setFrozenRows(1); } catch (e) {}
    map = _headerMap(sh);
    return map;
  }
  var added = false;
  for (var i = 0; i < keys.length; i++) {
    if (map.idx[keys[i]] === undefined) { map.headers.push(keys[i]); map.idx[keys[i]] = map.headers.length - 1; added = true; }
  }
  if (added) sh.getRange(1, 1, 1, map.headers.length).setValues([map.headers]);
  return map;
}

function _appendRow(name, values) {
  values = values || {};
  var sh = _sheet(name, true);
  var keys = Object.keys(values);
  var map = _ensureHeaders(sh, keys);
  var row = [];
  for (var c = 0; c < map.headers.length; c++) {
    var h = String(map.headers[c]);
    row.push(values[h] !== undefined ? values[h] : "");
  }
  sh.appendRow(row);
  return { ok: true };
}

function _updateRow(name, rowNumber, values) {
  values = values || {};
  var sh = _sheet(name, true);
  if (!rowNumber || rowNumber < 2) return { ok: false, error: "invalid rowNumber" };
  var map = _ensureHeaders(sh, Object.keys(values));
  for (var h in values) {
    var c = map.idx[h];
    if (c !== undefined) sh.getRange(rowNumber, c + 1).setValue(values[h]);
  }
  return { ok: true };
}

function _findRow(name, column, value) {
  var sh = _sheet(name, false);
  if (!sh) return { ok: true, rowNumber: null };
  var map = _headerMap(sh);
  var c = map.idx[String(column)];
  if (c === undefined) return { ok: true, rowNumber: null };
  var last = sh.getLastRow();
  if (last < 2) return { ok: true, rowNumber: null };
  var col = sh.getRange(2, c + 1, last - 1, 1).getValues();
  var needle = String(value);
  for (var i = 0; i < col.length; i++) if (String(col[i][0]) === needle) return { ok: true, rowNumber: i + 2 };
  return { ok: true, rowNumber: null };
}
