/**
 * PROJECT SIXTH - owner-only Gemini Spark Sheet bridge v1.0.0
 *
 * Deploy this as a SEPARATE Apps Script Web App:
 * - Execute as: Me (the spreadsheet owner)
 * - Who has access: Anyone
 *
 * The target spreadsheet itself must stay owner-only. GitHub Actions authenticates
 * to this endpoint with a 64-hex HMAC secret stored in Script Properties and a
 * GitHub Actions secret. No Google account, service account, or OAuth token is
 * exposed to GitHub.
 */

var BRIDGE_CONFIG = Object.freeze({
  PROTOCOL_VERSION: 1,
  TARGET_SPREADSHEET_ID: '1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y',
  XLSX_MIME: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  PUBLIC_URL: 'https://yu-zora.com/project_sixth/#prediction',
  ARTICLE_SLUG: '/project_sixth/#prediction',
  MAX_CLOCK_SKEW_SECONDS: 300,
  NONCE_TTL_SECONDS: 600,
  MAX_PUBLICATIONS_PER_COMMIT: 6,
  SECRET_PROPERTY: 'GITHUB_BRIDGE_SECRET'
});

var ALLOWED_READ_RANGES = Object.freeze([
  "'05_CONFIG'!A:C",
  "'06_PREDICTIONS'!A:AR",
  "'07_SOURCE_MASTER'!A:P",
  "'11_AUDIT_LOG'!A:P"
]);

var REQUIRED_TABS = Object.freeze([
  '00_DASHBOARD',
  '01_SPARK_SPEC',
  '02_SKILLS',
  '03_TASKS',
  '04_SCHEDULES',
  '05_CONFIG',
  '06_PREDICTIONS',
  '07_SOURCE_MASTER',
  '08_SOURCE_CANDIDATES',
  '09_RESULTS',
  '10_EVENT_WATCH',
  '11_AUDIT_LOG',
  '12_RUN_LOG',
  '13_ERROR_POLICY',
  '14_GITHUB_IO'
]);

/**
 * Run this once from the Apps Script editor before deployment.
 * It is read-only and forces the owner to grant the declared scopes while also
 * confirming that the fixed spreadsheet is reachable by the deploying account.
 */
function authorizeBridge() {
  var spreadsheet = SpreadsheetApp.openById(BRIDGE_CONFIG.TARGET_SPREADSHEET_ID);
  var file = DriveApp.getFileById(BRIDGE_CONFIG.TARGET_SPREADSHEET_ID);
  if (spreadsheet.getId() !== BRIDGE_CONFIG.TARGET_SPREADSHEET_ID) {
    throw new Error('fixed spreadsheet authorization check failed');
  }
  return {
    spreadsheet_id: spreadsheet.getId(),
    spreadsheet_name: spreadsheet.getName(),
    drive_file_name: file.getName()
  };
}

function doPost(e) {
  try {
    var request = authenticateRequest_(e);
    var result = dispatchOperation_(request.operation, request.payload);
    return jsonOutput_({ok: true, result: result});
  } catch (error) {
    return jsonOutput_({
      ok: false,
      retryable: error && error.retryable === true,
      message: safeErrorMessage_(error)
    });
  }
}

function authenticateRequest_(e) {
  if (!e || !e.postData || typeof e.postData.contents !== 'string') {
    throw new Error('request body is missing');
  }
  if (e.postData.contents.length > 2 * 1024 * 1024) {
    throw new Error('request body is too large');
  }

  var envelope;
  try {
    envelope = JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error('request body is not valid JSON');
  }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new Error('request envelope is invalid');
  }
  if (envelope.version !== BRIDGE_CONFIG.PROTOCOL_VERSION) {
    throw new Error('bridge protocol version is unsupported');
  }
  if (
    typeof envelope.timestamp !== 'number' ||
    !isFinite(envelope.timestamp) ||
    Math.floor(envelope.timestamp) !== envelope.timestamp
  ) {
    throw new Error('request timestamp is invalid');
  }
  if (
    typeof envelope.nonce !== 'string' ||
    !/^[0-9a-f]{32}$/.test(envelope.nonce)
  ) {
    throw new Error('request nonce is invalid');
  }
  if (
    typeof envelope.operation !== 'string' ||
    !/^[a-z_]{3,40}$/.test(envelope.operation)
  ) {
    throw new Error('request operation is invalid');
  }
  if (typeof envelope.payload !== 'string' || envelope.payload.length > 1024 * 1024) {
    throw new Error('request payload is invalid');
  }
  if (
    typeof envelope.signature !== 'string' ||
    !/^[0-9a-f]{64}$/.test(envelope.signature)
  ) {
    throw new Error('request signature is invalid');
  }

  var nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - envelope.timestamp) > BRIDGE_CONFIG.MAX_CLOCK_SKEW_SECONDS) {
    throw new Error('request timestamp is outside the allowed window');
  }

  var secret = PropertiesService.getScriptProperties().getProperty(
    BRIDGE_CONFIG.SECRET_PROPERTY
  );
  if (!secret || !/^[0-9a-f]{64}$/.test(secret)) {
    throw new Error('bridge secret is not configured');
  }

  var message = [
    String(envelope.version),
    String(envelope.timestamp),
    envelope.nonce,
    envelope.operation,
    envelope.payload
  ].join('\n');
  var expected = hmacSha256Hex_(message, secret);
  if (!constantTimeEqual_(expected, envelope.signature)) {
    throw new Error('request authentication failed');
  }

  var cache = CacheService.getScriptCache();
  var nonceKey = 'nonce_' + envelope.nonce;
  if (cache.get(nonceKey) !== null) {
    throw new Error('request nonce was already used');
  }
  cache.put(nonceKey, '1', BRIDGE_CONFIG.NONCE_TTL_SECONDS);

  var payload;
  try {
    payload = JSON.parse(envelope.payload);
  } catch (error) {
    throw new Error('signed payload is not valid JSON');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('signed payload must be an object');
  }
  return {operation: envelope.operation, payload: payload};
}

function dispatchOperation_(operation, payload) {
  validateSpreadsheetId_(payload.spreadsheet_id);
  if (operation === 'export_xlsx') {
    assertExactKeys_(payload, ['spreadsheet_id']);
    return exportXlsx_();
  }
  if (operation === 'get_spreadsheet_metadata') {
    assertExactKeys_(payload, ['spreadsheet_id']);
    return getSpreadsheetMetadata_();
  }
  if (operation === 'batch_get_values') {
    assertExactKeys_(payload, ['ranges', 'spreadsheet_id']);
    return batchGetValues_(payload.ranges);
  }
  if (operation === 'batch_update') {
    assertExactKeys_(payload, ['requests', 'spreadsheet_id']);
    return batchUpdate_(payload.requests);
  }
  throw new Error('operation is not allowed');
}

function exportXlsx_() {
  var encodedId = encodeURIComponent(BRIDGE_CONFIG.TARGET_SPREADSHEET_ID);
  var url =
    'https://www.googleapis.com/drive/v3/files/' +
    encodedId +
    '/export?mimeType=' +
    encodeURIComponent(BRIDGE_CONFIG.XLSX_MIME);
  var response = fetchGoogle_(url, {method: 'get'}, 'Drive export');
  var bytes = response.getContent();
  return {
    content_type: normalizedContentType_(response),
    data_base64: Utilities.base64Encode(bytes),
    sha256: bytesToHex_(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    )
  };
}

function getSpreadsheetMetadata_() {
  var encodedId = encodeURIComponent(BRIDGE_CONFIG.TARGET_SPREADSHEET_ID);
  var fields = encodeURIComponent(
    'spreadsheetId,properties(timeZone),sheets(properties(sheetId,title))'
  );
  return fetchGoogleJson_(
    'https://sheets.googleapis.com/v4/spreadsheets/' +
      encodedId +
      '?includeGridData=false&fields=' +
      fields,
    {method: 'get'},
    'Sheets metadata read'
  );
}

function batchGetValues_(ranges) {
  if (!Array.isArray(ranges) || ranges.length !== ALLOWED_READ_RANGES.length) {
    throw new Error('requested ranges do not match the publication contract');
  }
  for (var i = 0; i < ALLOWED_READ_RANGES.length; i += 1) {
    if (ranges[i] !== ALLOWED_READ_RANGES[i]) {
      throw new Error('requested ranges do not match the publication contract');
    }
  }

  var encodedId = encodeURIComponent(BRIDGE_CONFIG.TARGET_SPREADSHEET_ID);
  var query = ranges
    .map(function(range) {
      return 'ranges=' + encodeURIComponent(range);
    })
    .concat([
      'majorDimension=ROWS',
      'valueRenderOption=FORMATTED_VALUE',
      'dateTimeRenderOption=FORMATTED_STRING'
    ])
    .join('&');
  var response = fetchGoogleJson_(
    'https://sheets.googleapis.com/v4/spreadsheets/' +
      encodedId +
      '/values:batchGet?' +
      query,
    {method: 'get'},
    'Sheets values read'
  );
  if (!Array.isArray(response.valueRanges) || response.valueRanges.length !== ranges.length) {
    throw new Error('Sheets values read returned an incomplete range set');
  }
  return {
    ranges: response.valueRanges.map(function(valueRange) {
      return Array.isArray(valueRange.values) ? valueRange.values : [];
    })
  };
}

function batchUpdate_(requests) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('another publication commit is already running');
  }
  try {
    var metadata = getSpreadsheetMetadata_();
    validatePublicationRequests_(requests, metadata);
    var encodedId = encodeURIComponent(BRIDGE_CONFIG.TARGET_SPREADSHEET_ID);
    return fetchGoogleJson_(
      'https://sheets.googleapis.com/v4/spreadsheets/' + encodedId + ':batchUpdate',
      {
        method: 'post',
        contentType: 'application/json; charset=utf-8',
        payload: JSON.stringify({requests: requests})
      },
      'Sheets atomic publication commit'
    );
  } finally {
    lock.releaseLock();
  }
}

function validatePublicationRequests_(requests, metadata) {
  if (!Array.isArray(requests) || requests.length < 5 || requests.length > 25) {
    throw new Error('publication update request count is invalid');
  }
  if ((requests.length - 1) % 4 !== 0) {
    throw new Error('publication update request grouping is invalid');
  }
  var publicationCount = (requests.length - 1) / 4;
  if (
    publicationCount < 1 ||
    publicationCount > BRIDGE_CONFIG.MAX_PUBLICATIONS_PER_COMMIT
  ) {
    throw new Error('publication update exceeds the per-run limit');
  }

  var sheetIds = sheetIdsByTitle_(metadata);
  var predictionSheetId = sheetIds['06_PREDICTIONS'];
  var auditSheetId = sheetIds['11_AUDIT_LOG'];
  if (typeof predictionSheetId !== 'number' || typeof auditSheetId !== 'number') {
    throw new Error('required publication sheets are missing');
  }

  var rowNumbers = [];
  var publicationTimestamps = [];
  for (var itemIndex = 0; itemIndex < publicationCount; itemIndex += 1) {
    var rowNumber = null;
    var itemTimestamp = null;
    var expectedColumns = [2, 28, 30, 41];
    for (var offset = 0; offset < 4; offset += 1) {
      var request = requests[itemIndex * 4 + offset];
      var update = request && request.updateCells;
      if (!update || update.fields !== 'userEnteredValue') {
        throw new Error('publication cell update shape is invalid');
      }
      var start = update.start;
      if (
        !start ||
        start.sheetId !== predictionSheetId ||
        !isInteger_(start.rowIndex) ||
        start.rowIndex < 3 ||
        start.columnIndex !== expectedColumns[offset]
      ) {
        throw new Error('publication cell target is invalid');
      }
      if (
        !Array.isArray(update.rows) ||
        update.rows.length !== 1 ||
        !update.rows[0] ||
        !Array.isArray(update.rows[0].values) ||
        update.rows[0].values.length !== 1
      ) {
        throw new Error('publication cell update cardinality is invalid');
      }
      var value = cellValue_(update.rows[0].values[0]);
      if (offset === 0 && value !== 'PUBLISHED') {
        throw new Error('publication status update is invalid');
      }
      if (offset === 2 && value !== BRIDGE_CONFIG.ARTICLE_SLUG) {
        throw new Error('publication article slug update is invalid');
      }
      if ((offset === 1 || offset === 3) && !isSheetTimestamp_(value)) {
        throw new Error('publication timestamp update is invalid');
      }
      if (offset === 1) {
        itemTimestamp = value;
      }
      if (offset === 3 && value !== itemTimestamp) {
        throw new Error('publication timestamps do not match');
      }
      if (rowNumber === null) {
        rowNumber = start.rowIndex + 1;
      } else if (rowNumber !== start.rowIndex + 1) {
        throw new Error('publication update group spans multiple rows');
      }
    }
    rowNumbers.push(rowNumber);
    publicationTimestamps.push(itemTimestamp);
  }

  if (new Set(rowNumbers).size !== rowNumbers.length) {
    throw new Error('publication update repeats a prediction row');
  }

  var appendRequest = requests[requests.length - 1];
  var append = appendRequest && appendRequest.appendCells;
  if (
    !append ||
    append.sheetId !== auditSheetId ||
    append.fields !== 'userEnteredValue' ||
    !Array.isArray(append.rows) ||
    append.rows.length !== publicationCount
  ) {
    throw new Error('publication audit append shape is invalid');
  }

  var liveRows = readPredictionRows_(rowNumbers);
  for (var auditIndex = 0; auditIndex < publicationCount; auditIndex += 1) {
    var auditValues = auditRowValues_(append.rows[auditIndex]);
    validateAuditRow_(auditValues, publicationTimestamps[auditIndex]);
    validateLivePredictionRow_(
      liveRows[auditIndex],
      rowNumbers[auditIndex],
      auditValues
    );
  }
}

function readPredictionRows_(rowNumbers) {
  var encodedId = encodeURIComponent(BRIDGE_CONFIG.TARGET_SPREADSHEET_ID);
  var query = rowNumbers
    .map(function(rowNumber) {
      return (
        'ranges=' +
        encodeURIComponent("'06_PREDICTIONS'!A" + rowNumber + ':AR' + rowNumber)
      );
    })
    .concat([
      'majorDimension=ROWS',
      'valueRenderOption=FORMATTED_VALUE',
      'dateTimeRenderOption=FORMATTED_STRING'
    ])
    .join('&');
  var response = fetchGoogleJson_(
    'https://sheets.googleapis.com/v4/spreadsheets/' +
      encodedId +
      '/values:batchGet?' +
      query,
    {method: 'get'},
    'Sheets publication row precondition read'
  );
  if (!Array.isArray(response.valueRanges) || response.valueRanges.length !== rowNumbers.length) {
    throw new Error('publication precondition read is incomplete');
  }
  return response.valueRanges.map(function(valueRange) {
    if (!Array.isArray(valueRange.values) || valueRange.values.length !== 1) {
      throw new Error('publication precondition row is missing');
    }
    return valueRange.values[0];
  });
}

function validateLivePredictionRow_(row, rowNumber, auditValues) {
  var predictionId = String(row[0] || '').trim();
  var version = String(row[1] || '').trim();
  var status = String(row[2] || '').trim();
  var publishedAt = String(row[28] || '').trim();
  var publishKey = String(row[29] || '').trim();
  var articleSlug = String(row[30] || '').trim();
  var publishGate = String(row[42] || '').trim();

  if (!/^PRED-\d{8}-\d{3}$/.test(predictionId) || !/^[1-9]\d*$/.test(version)) {
    throw new Error('publication precondition key is invalid at row ' + rowNumber);
  }
  var expectedKey = predictionId + '|' + version;
  if (
    status !== 'APPROVED_FOR_PUBLISH' ||
    publishGate !== 'READY' ||
    publishKey !== expectedKey ||
    publishedAt !== '' ||
    articleSlug !== ''
  ) {
    throw new Error('publication precondition changed at row ' + rowNumber);
  }
  if (
    auditValues[5] !== expectedKey ||
    auditValues[6] !== predictionId ||
    String(auditValues[7]) !== version
  ) {
    throw new Error('publication audit does not match row ' + rowNumber);
  }
}

function auditRowValues_(row) {
  if (!row || !Array.isArray(row.values) || row.values.length !== 16) {
    throw new Error('publication audit row is invalid');
  }
  return row.values.map(cellValue_);
}

function validateAuditRow_(values, publicationTimestamp) {
  if (!/^AUD-ACTION1-\d{8}-\d{6}-[0-9a-f]{8}$/.test(String(values[0]))) {
    throw new Error('publication audit id is invalid');
  }
  if (values[1] !== publicationTimestamp || !isSheetTimestamp_(String(values[1]))) {
    throw new Error('publication audit timestamp is invalid');
  }
  if (
    values[2] !== 'GITHUB_ACTION1' ||
    values[3] !== 'PREDICTION_PUBLISHED' ||
    values[4] !== 'PREDICTION' ||
    values[8] !== 'APPROVED_FOR_PUBLISH' ||
    values[9] !== 'PUBLISHED' ||
    values[10] !== 'SUCCESS' ||
    values[11] !== 'GitHub Action 1で公開カタログを検証し、本番公開を確認した。' ||
    values[12] !== BRIDGE_CONFIG.PUBLIC_URL ||
    values[15] !== true
  ) {
    throw new Error('publication audit constants are invalid');
  }
  if (!/^PRED-\d{8}-\d{3}\|[1-9]\d*$/.test(String(values[5]))) {
    throw new Error('publication audit key is invalid');
  }
  if (!/^PRED-\d{8}-\d{3}$/.test(String(values[6]))) {
    throw new Error('publication audit entity id is invalid');
  }
  if (!isInteger_(values[7]) || values[7] < 1) {
    throw new Error('publication audit version is invalid');
  }
  if (
    !/^https:\/\/github\.com\/Yuzora-Yu\/PROJECT_SIXTH\/commit\/[0-9a-f]{7,64}$/.test(
      String(values[13])
    )
  ) {
    throw new Error('publication audit commit URL is invalid');
  }
  if (!/^[A-Za-z0-9._-]{8,120}$/.test(String(values[14]))) {
    throw new Error('publication audit run id is invalid');
  }
}

function sheetIdsByTitle_(metadata) {
  if (!metadata || !Array.isArray(metadata.sheets)) {
    throw new Error('Spreadsheet metadata is invalid');
  }
  var result = {};
  var titles = [];
  metadata.sheets.forEach(function(sheet) {
    var properties = sheet && sheet.properties;
    if (!properties || typeof properties.title !== 'string' || !isInteger_(properties.sheetId)) {
      throw new Error('Spreadsheet metadata contains an invalid sheet');
    }
    if (Object.prototype.hasOwnProperty.call(result, properties.title)) {
      throw new Error('Spreadsheet metadata contains duplicate sheet titles');
    }
    result[properties.title] = properties.sheetId;
    titles.push(properties.title);
  });
  if (JSON.stringify(titles) !== JSON.stringify(REQUIRED_TABS)) {
    throw new Error('Spreadsheet tabs or tab order do not match the fixed contract');
  }
  if (
    metadata.spreadsheetId !== BRIDGE_CONFIG.TARGET_SPREADSHEET_ID ||
    !metadata.properties ||
    metadata.properties.timeZone !== 'Asia/Tokyo'
  ) {
    throw new Error('Spreadsheet metadata does not match the fixed contract');
  }
  return result;
}

function fetchGoogleJson_(url, options, operation) {
  var response = fetchGoogle_(url, options, operation);
  var contentType = normalizedContentType_(response);
  if (contentType !== 'application/json') {
    throw new Error(operation + ' returned a non-JSON response');
  }
  try {
    return JSON.parse(response.getContentText('UTF-8'));
  } catch (error) {
    throw new Error(operation + ' returned malformed JSON');
  }
}

function fetchGoogle_(url, options, operation) {
  var requestOptions = Object.assign({}, options || {});
  requestOptions.muteHttpExceptions = true;
  requestOptions.followRedirects = true;
  requestOptions.headers = Object.assign({}, requestOptions.headers || {}, {
    Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
  });
  var response = UrlFetchApp.fetch(url, requestOptions);
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    var error = new Error(operation + ' failed with HTTP ' + status);
    error.retryable = status === 429 || (status >= 500 && status <= 599);
    throw error;
  }
  return response;
}

function normalizedContentType_(response) {
  var headers = response.getHeaders();
  var value = headers['Content-Type'] || headers['content-type'] || '';
  return String(value).split(';', 1)[0].trim().toLowerCase();
}

function validateSpreadsheetId_(spreadsheetId) {
  if (spreadsheetId !== BRIDGE_CONFIG.TARGET_SPREADSHEET_ID) {
    throw new Error('Spreadsheet ID does not match the fixed contract');
  }
}

function assertExactKeys_(object, expectedKeys) {
  var actual = Object.keys(object).sort();
  var expected = expectedKeys.slice().sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('request payload fields are invalid');
  }
}

function cellValue_(cellData) {
  if (!cellData || !cellData.userEnteredValue) {
    throw new Error('publication cell has no userEnteredValue');
  }
  var value = cellData.userEnteredValue;
  var keys = Object.keys(value);
  if (keys.length !== 1) {
    throw new Error('publication cell has an invalid value type');
  }
  if (keys[0] === 'stringValue' && typeof value.stringValue === 'string') {
    return value.stringValue;
  }
  if (keys[0] === 'numberValue' && typeof value.numberValue === 'number') {
    return value.numberValue;
  }
  if (keys[0] === 'boolValue' && typeof value.boolValue === 'boolean') {
    return value.boolValue;
  }
  throw new Error('publication cell has an unsupported value type');
}

function isSheetTimestamp_(value) {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(value));
}

function isInteger_(value) {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
}

function hmacSha256Hex_(message, secret) {
  return bytesToHex_(
    Utilities.computeHmacSha256Signature(
      message,
      secret,
      Utilities.Charset.UTF_8
    )
  );
}

function bytesToHex_(bytes) {
  return bytes
    .map(function(value) {
      var unsigned = value < 0 ? value + 256 : value;
      return ('0' + unsigned.toString(16)).slice(-2);
    })
    .join('');
}

function constantTimeEqual_(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) {
    return false;
  }
  var difference = 0;
  for (var i = 0; i < left.length; i += 1) {
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return difference === 0;
}

function safeErrorMessage_(error) {
  var message = error && error.message ? String(error.message) : 'bridge request failed';
  return message.slice(0, 240);
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON
  );
}
