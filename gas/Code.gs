/**
 * PROJECT SIXTH Prediction Ops - Fixed Target Overwriter v2.0.3
 * Contract: PROJECT_SIXTH_PREDICTION_OPS / schema 2.0.0
 *
 * HOTFIX v2.0.2:
 * - STAGE_COPYをsheet単位6回再試行＋指数バックオフへ変更。
 * - 一時的なGoogle Sheets service failureで即全体失敗しない。
 * - エラーphaseへ失敗したsource tab名を含める。
 * - copyToがサーバ側だけ成功したケースもsheetId差分で回収。
 *
 * Safety inherited from v2.0.1:
 * - コピー先の既存タブを最初に改名しない。
 * - source全15タブを __NEW_* として完全にstageして検証してからcommitする。
 * - commit失敗時は staged tabs を退避 → old tabsを元名へ復旧 → staged削除。
 * - 現在のtargetが途中失敗で汚れていても、source contractさえ正しければ修復可能。
 * - source SpreadsheetはREAD ONLY。削除・改名・timezone変更をしない。
 */

var CONFIG = {
  IMPLEMENTATION_VERSION: '2.0.3',
  CONTRACT_ID: 'PROJECT_SIXTH_PREDICTION_OPS',
  SCHEMA_VERSION: '2.0.0',
  TARGET_SPREADSHEET_ID: '1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y',
  TARGET_BASE_URL: 'https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit',
  TARGET_TIME_ZONE: 'Asia/Tokyo',
  SOURCE_LIST_LIMIT: 500,
  LOCK_WAIT_MS: 30000,
  COPY_RETRY_MAX: 6,
  COPY_RETRY_BASE_MS: 1200,
  COPY_SUCCESS_PAUSE_MS: 800,
  BACKUP_NAME_PREFIX: 'BACKUP_PROJECT_SIXTH_PREDICTION_OPS'
};

var REQUIRED_TABS = [
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
];


function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('PROJECT SIXTH - Prediction Ops 上書き')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}


function listSourceSpreadsheets() {
  var files = DriveApp.getFilesByType(MimeType.GOOGLE_SHEETS);
  var items = [];

  while (files.hasNext() && items.length < CONFIG.SOURCE_LIST_LIMIT) {
    var file = files.next();

    if (file.getId() === CONFIG.TARGET_SPREADSHEET_ID) {
      continue;
    }

    items.push({
      id: file.getId(),
      name: file.getName(),
      updatedMs: file.getLastUpdated().getTime(),
      updated: Utilities.formatDate(
        file.getLastUpdated(),
        CONFIG.TARGET_TIME_ZONE,
        'yyyy-MM-dd HH:mm'
      )
    });
  }

  items.sort(function(a, b) {
    return b.updatedMs - a.updatedMs;
  });

  return items.map(function(item) {
    return {
      id: item.id,
      name: item.name,
      updated: item.updated
    };
  });
}


function previewSource(sourceInput) {
  var sourceId = extractSpreadsheetId_(sourceInput);

  if (sourceId === CONFIG.TARGET_SPREADSHEET_ID) {
    throw new Error('コピー元と固定コピー先が同一です。');
  }

  var source = SpreadsheetApp.openById(sourceId);
  var target = SpreadsheetApp.openById(CONFIG.TARGET_SPREADSHEET_ID);
  var configMap = validateSourceContract_(source);

  return {
    implementationVersion: CONFIG.IMPLEMENTATION_VERSION,
    sourceId: sourceId,
    sourceName: source.getName(),
    sourceUrl: source.getUrl(),
    sourceTimeZone: source.getSpreadsheetTimeZone() || '不明',
    sourceSheets: source.getSheets().map(function(sheet) {
      return sheet.getName();
    }),
    sheetCount: source.getSheets().length,
    contractId: configMap.contract_id,
    schemaVersion: configMap.schema_version,
    targetId: target.getId(),
    targetName: target.getName(),
    targetUrl: CONFIG.TARGET_BASE_URL,
    targetCurrentTimeZone: target.getSpreadsheetTimeZone() || '不明',
    targetCurrentSheets: target.getSheets().map(function(sheet) {
      return sheet.getName();
    }),
    targetFinalTimeZone: CONFIG.TARGET_TIME_ZONE
  };
}


function overwriteTargetFromSource(sourceInput) {
  var lock = LockService.getScriptLock();

  if (!lock.tryLock(CONFIG.LOCK_WAIT_MS)) {
    throw new Error('別の上書き処理が実行中です。時間を置いて再実行してください。');
  }

  var phase = 'INIT';
  var source = null;
  var target = null;
  var sourceConfig = null;
  var originalTargetSheets = [];
  var stagedSheets = [];
  var oldNamedRanges = [];
  var sourceNamedRanges = [];
  var backupUrl = '';
  var auditWarning = '';
  var formulaWarnings = [];

  var runId =
    'GAS-' +
    Utilities.formatDate(
      new Date(),
      CONFIG.TARGET_TIME_ZONE,
      'yyyyMMdd-HHmmss'
    ) +
    '-' +
    Utilities.getUuid().slice(0, 8);

  var token =
    Utilities.formatDate(
      new Date(),
      CONFIG.TARGET_TIME_ZONE,
      'yyyyMMdd_HHmmss'
    ) +
    '_' +
    Utilities.getUuid().slice(0, 8);

  try {
    var sourceId = extractSpreadsheetId_(sourceInput);

    if (sourceId === CONFIG.TARGET_SPREADSHEET_ID) {
      throw new Error('コピー元と固定コピー先が同一です。');
    }

    phase = 'OPEN';
    source = SpreadsheetApp.openById(sourceId);
    target = SpreadsheetApp.openById(CONFIG.TARGET_SPREADSHEET_ID);

    // SOURCEのみ厳格検査。targetが過去の失敗で汚れていても修復可能。
    phase = 'PREFLIGHT_SOURCE';
    sourceConfig = validateSourceContract_(source);

    // 破壊的操作前のtarget全体バックアップは必須。
    phase = 'BACKUP';
    backupUrl = createTargetBackup_(target);

    oldNamedRanges = snapshotNamedRanges_(target);
    sourceNamedRanges = snapshotNamedRanges_(source);

    // 既存target tabsはこの時点では一切触らない。
    originalTargetSheets = target.getSheets().map(function(sheet) {
      return {
        sheet: sheet,
        originalName: sheet.getName(),
        tempName: ''
      };
    });

    // ------------------------------------------------------------------
    // STAGE: sourceを __NEW_* として全部コピー。
    // targetの既存タブ名を変更する前に15タブすべてを作り切る。
    // ------------------------------------------------------------------
    phase = 'STAGE_COPY';
    source.getSheets().forEach(function(sourceSheet, index) {
      phase = 'STAGE_COPY:' + sourceSheet.getName();

      var copied = copySheetWithRetry_(
        sourceSheet,
        target,
        stagedSheets
      );

      var stageName = makeUniqueTempName_(
        target,
        '__NEW_' + token + '_' + pad2_(index + 1) + '__'
      );

      safeRename_(copied, stageName);

      stagedSheets.push({
        sheet: copied,
        sourceName: sourceSheet.getName(),
        stageName: stageName
      });

      SpreadsheetApp.flush();
      Utilities.sleep(CONFIG.COPY_SUCCESS_PAUSE_MS);
    });

    phase = 'STAGE_COPY_COMPLETE';
    SpreadsheetApp.flush();

    phase = 'VERIFY_STAGE';
    verifyStagedNativeCopies_(source, stagedSheets);

    // ------------------------------------------------------------------
    // COMMIT PREP:
    // stageが全部揃った後で初めて既存target tabsを退避。
    // ------------------------------------------------------------------
    phase = 'RENAME_OLD';
    originalTargetSheets.forEach(function(item, index) {
      var oldTempName = makeUniqueTempName_(
        target,
        '__OLD_' + token + '_' + pad2_(index + 1) + '__'
      );

      safeRename_(item.sheet, oldTempName);
      item.tempName = oldTempName;
    });

    SpreadsheetApp.flush();

    // staged tabsをcanonical nameへ。
    phase = 'PROMOTE_STAGE';
    stagedSheets.forEach(function(item) {
      safeRename_(item.sheet, item.sourceName);
    });

    SpreadsheetApp.flush();

    // ここからsource contractをtarget上に再構築。
    phase = 'SET_TARGET_TIMEZONE';
    target.setSpreadsheetTimeZone(CONFIG.TARGET_TIME_ZONE);
    SpreadsheetApp.flush();

    if (target.getSpreadsheetTimeZone() !== CONFIG.TARGET_TIME_ZONE) {
      throw new Error('固定コピー先をAsia/Tokyoへ設定できませんでした。');
    }

    phase = 'RESTORE_NAMED_RANGES';
    removeAllNamedRanges_(target);
    restoreNamedRanges_(target, sourceNamedRanges);

    // Cross-sheet formulaは全canonical tabが存在してからsource式を再投入。
    phase = 'RESTORE_FORMULAS';
    source.getSheets().forEach(function(sourceSheet) {
      var targetSheet = target.getSheetByName(sourceSheet.getName());

      if (!targetSheet) {
        throw new Error(
          '数式復元先tabがありません: ' + sourceSheet.getName()
        );
      }

      restoreFormulasOnly_(sourceSheet, targetSheet);
    });

    phase = 'NORMALIZE_CAPACITY';
    normalizeOperationalCapacity_(target, sourceConfig);

    SpreadsheetApp.flush();

    // 旧タブをまだ残した状態で最終検証。
    phase = 'VERIFY_FINAL';
    verifyFinalCanonical_(
      source,
      target,
      sourceConfig,
      originalTargetSheets,
      formulaWarnings
    );

    // 検証成功後だけ旧タブ群を削除。
    phase = 'DELETE_OLD';
    originalTargetSheets.forEach(function(item) {
      target.deleteSheet(item.sheet);
    });

    phase = 'FINALIZE';
    reorderCanonicalTabs_(target);
    target.setSpreadsheetTimeZone(CONFIG.TARGET_TIME_ZONE);
    target.setActiveSheet(target.getSheetByName('00_DASHBOARD'));
    SpreadsheetApp.flush();

    // old tabs削除後に、参照切れ・temp参照が発生していないことを再確認。
    phase = 'POST_COMMIT_VERIFY';
    verifyPostCommitIntegrity_(
      source,
      target,
      sourceConfig,
      formulaWarnings
    );

    // Audit書込失敗で「置換自体」を失敗扱いにしない。
    phase = 'AUDIT';
    try {
      appendGasAudit_(target, runId, source, backupUrl);
      SpreadsheetApp.flush();
    } catch (auditError) {
      auditWarning =
        '置換は成功しましたがAUDIT_LOG書込に失敗: ' +
        (auditError && auditError.message
          ? auditError.message
          : String(auditError));
      console.error(auditWarning);
    }

    phase = 'DONE';

    return {
      ok: true,
      implementationVersion: CONFIG.IMPLEMENTATION_VERSION,
      runId: runId,
      sourceId: source.getId(),
      sourceName: source.getName(),
      sourceTimeZone: source.getSpreadsheetTimeZone() || '不明',
      targetId: target.getId(),
      targetName: target.getName(),
      targetTimeZone: target.getSpreadsheetTimeZone(),
      contractId: sourceConfig.contract_id,
      schemaVersion: sourceConfig.schema_version,
      sheetCount: REQUIRED_TABS.length,
      sheetNames: REQUIRED_TABS.slice(),
      backupUrl: backupUrl,
      auditWarning: auditWarning,
      formulaWarnings: formulaWarnings.slice(0, 20),
      completedAtJst: Utilities.formatDate(
        new Date(),
        CONFIG.TARGET_TIME_ZONE,
        "yyyy-MM-dd'T'HH:mm:ssXXX"
      )
    };

  } catch (error) {
    var rollbackMessage = '';

    try {
      if (target) {
        rollbackTarget_(
          target,
          stagedSheets,
          originalTargetSheets,
          oldNamedRanges
        );
        rollbackMessage = 'rollback=SUCCESS';
      }
    } catch (rollbackError) {
      rollbackMessage =
        'rollback=FAILED: ' +
        (rollbackError && rollbackError.message
          ? rollbackError.message
          : String(rollbackError));
      console.error(rollbackMessage);
    }

    var message =
      '上書き処理に失敗しました。\n' +
      'implementation=' + CONFIG.IMPLEMENTATION_VERSION + '\n' +
      'phase=' + phase + '\n' +
      'error=' +
      (error && error.message ? error.message : String(error)) +
      '\n' +
      'backup=' + (backupUrl || '作成前') +
      '\n' +
      rollbackMessage;

    console.error(message);
    throw new Error(message);

  } finally {
    lock.releaseLock();
  }
}


// -----------------------------------------------------------------------------
// SOURCE CONTRACT
// -----------------------------------------------------------------------------

function validateSourceContract_(source) {
  var sourceNames = source.getSheets().map(function(sheet) {
    return sheet.getName();
  });

  if (JSON.stringify(sourceNames) !== JSON.stringify(REQUIRED_TABS)) {
    throw new Error(
      'sourceのタブ構成/順序がcontractと一致しません。\n' +
      'expected=' + REQUIRED_TABS.join(',') + '\n' +
      'actual=' + sourceNames.join(',')
    );
  }

  assertNoGidDependency_(source);

  var configMap = readConfigMap_(source);

  assertConfigEquals_(configMap, 'contract_id', CONFIG.CONTRACT_ID);
  assertConfigEquals_(configMap, 'schema_version', CONFIG.SCHEMA_VERSION);
  assertConfigEquals_(configMap, 'spark_sheet_id', CONFIG.TARGET_SPREADSHEET_ID);
  assertConfigEquals_(configMap, 'spark_sheet_url', CONFIG.TARGET_BASE_URL);
  assertConfigEquals_(configMap, 'gid_dependency', 'NONE');
  assertConfigEquals_(configMap, 'timezone', CONFIG.TARGET_TIME_ZONE);
  assertConfigEquals_(configMap, 'gas_contract_version', CONFIG.SCHEMA_VERSION);
  assertConfigEquals_(configMap, 'gas_backup_required', 'TRUE');

  return configMap;
}


function assertNoGidDependency_(spreadsheet) {
  var tabsToScan = [
    '00_DASHBOARD',
    '01_SPARK_SPEC',
    '02_SKILLS',
    '03_TASKS',
    '05_CONFIG',
    '14_GITHUB_IO'
  ];

  tabsToScan.forEach(function(tabName) {
    var sheet = spreadsheet.getSheetByName(tabName);

    if (!sheet) {
      return;
    }

    var match = sheet.createTextFinder('gid=').findNext();

    if (match) {
      throw new Error(
        'gid依存を検出したため拒否しました: ' +
        tabName + '!' + match.getA1Notation()
      );
    }
  });
}


function readConfigMap_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName('05_CONFIG');

  if (!sheet) {
    throw new Error('05_CONFIGがありません。');
  }

  var lastRow = sheet.getLastRow();
  var rowCount = Math.max(lastRow - 3, 1);
  var values = sheet.getRange(4, 1, rowCount, 2).getDisplayValues();
  var map = {};

  values.forEach(function(row) {
    var key = String(row[0] || '').trim();

    if (key) {
      map[key] = String(row[1] || '').trim();
    }
  });

  return map;
}


function assertConfigEquals_(configMap, key, expected) {
  var actual = String(configMap[key] || '');

  if (actual !== String(expected)) {
    throw new Error(
      '05_CONFIG不一致: ' +
      key +
      ' expected=' + expected +
      ' actual=' + actual
    );
  }
}


// -----------------------------------------------------------------------------
// STAGE / VERIFY
// -----------------------------------------------------------------------------

function verifyStagedNativeCopies_(source, stagedSheets) {
  if (stagedSheets.length !== REQUIRED_TABS.length) {
    throw new Error(
      'stage tab数不一致: ' +
      stagedSheets.length +
      ' / ' +
      REQUIRED_TABS.length
    );
  }

  for (var i = 0; i < stagedSheets.length; i++) {
    var item = stagedSheets[i];
    var sourceSheet = source.getSheetByName(item.sourceName);
    var stagedSheet = item.sheet;

    if (!sourceSheet) {
      throw new Error('stage検証sourceなし: ' + item.sourceName);
    }

    if (stagedSheet.getName() !== item.stageName) {
      throw new Error(
        'stage name不一致: ' +
        item.stageName +
        ' actual=' +
        stagedSheet.getName()
      );
    }

    if (sourceSheet.getMaxRows() !== stagedSheet.getMaxRows()) {
      throw new Error('stage maxRows mismatch: ' + item.sourceName);
    }

    if (sourceSheet.getMaxColumns() !== stagedSheet.getMaxColumns()) {
      throw new Error('stage maxColumns mismatch: ' + item.sourceName);
    }

    if (sourceSheet.getLastRow() !== stagedSheet.getLastRow()) {
      throw new Error('stage lastRow mismatch: ' + item.sourceName);
    }

    if (sourceSheet.getLastColumn() !== stagedSheet.getLastColumn()) {
      throw new Error('stage lastColumn mismatch: ' + item.sourceName);
    }

    if (sourceSheet.getFrozenRows() !== stagedSheet.getFrozenRows()) {
      throw new Error('stage frozenRows mismatch: ' + item.sourceName);
    }

    if (sourceSheet.getFrozenColumns() !== stagedSheet.getFrozenColumns()) {
      throw new Error('stage frozenColumns mismatch: ' + item.sourceName);
    }

    if (sourceSheet.isSheetHidden() !== stagedSheet.isSheetHidden()) {
      throw new Error('stage hidden mismatch: ' + item.sourceName);
    }

    var lastRow = sourceSheet.getLastRow();
    var lastColumn = sourceSheet.getLastColumn();

    if (lastRow > 0 && lastColumn > 0) {
      var sourceFormats =
        sourceSheet
          .getRange(1, 1, lastRow, lastColumn)
          .getNumberFormats();

      var stageFormats =
        stagedSheet
          .getRange(1, 1, lastRow, lastColumn)
          .getNumberFormats();

      if (JSON.stringify(sourceFormats) !== JSON.stringify(stageFormats)) {
        throw new Error(
          'stage number formats mismatch: ' + item.sourceName
        );
      }
    }

    if (
      sourceSheet.getConditionalFormatRules().length !==
      stagedSheet.getConditionalFormatRules().length
    ) {
      throw new Error(
        'stage conditional formats mismatch: ' + item.sourceName
      );
    }

    if (
      sourceSheet.getCharts().length !==
      stagedSheet.getCharts().length
    ) {
      throw new Error(
        'stage chart count mismatch: ' + item.sourceName
      );
    }
  }
}


function verifyFinalCanonical_(
  source,
  target,
  configMap,
  originalTargetSheets,
  formulaWarnings
) {
  REQUIRED_TABS.forEach(function(tabName) {
    var sourceSheet = source.getSheetByName(tabName);
    var targetSheet = target.getSheetByName(tabName);

    if (!sourceSheet || !targetSheet) {
      throw new Error('FINAL VERIFY tab missing: ' + tabName);
    }

    if (sourceSheet.getMaxColumns() !== targetSheet.getMaxColumns()) {
      throw new Error('FINAL VERIFY maxColumns mismatch: ' + tabName);
    }

    var minKey = 'min_rows_' + tabName;

    if (configMap[minKey]) {
      var expectedMinRows = parseInt(configMap[minKey], 10);

      if (targetSheet.getMaxRows() < expectedMinRows) {
        throw new Error(
          'FINAL VERIFY minRows不足: ' +
          tabName +
          ' actual=' +
          targetSheet.getMaxRows() +
          ' expected>=' +
          expectedMinRows
        );
      }
    }

    var sourceLastRow = sourceSheet.getLastRow();
    var sourceLastColumn = sourceSheet.getLastColumn();

    if (sourceLastRow > 0 && sourceLastColumn > 0) {
      verifyFormulaIntegrity_(
        sourceSheet,
        targetSheet,
        formulaWarnings
      );

      var sourceFormats =
        sourceSheet
          .getRange(1, 1, sourceLastRow, sourceLastColumn)
          .getNumberFormats();

      var targetFormats =
        targetSheet
          .getRange(1, 1, sourceLastRow, sourceLastColumn)
          .getNumberFormats();

      if (JSON.stringify(sourceFormats) !== JSON.stringify(targetFormats)) {
        throw new Error('FINAL VERIFY formats mismatch: ' + tabName);
      }
    }

    if (sourceSheet.getFrozenRows() !== targetSheet.getFrozenRows()) {
      throw new Error('FINAL VERIFY frozenRows mismatch: ' + tabName);
    }

    if (sourceSheet.getFrozenColumns() !== targetSheet.getFrozenColumns()) {
      throw new Error('FINAL VERIFY frozenColumns mismatch: ' + tabName);
    }

    if (sourceSheet.isSheetHidden() !== targetSheet.isSheetHidden()) {
      throw new Error('FINAL VERIFY hidden mismatch: ' + tabName);
    }
  });

  var sourceNamed = snapshotNamedRanges_(source)
    .map(function(item) {
      return (
        item.name +
        '|' +
        item.sheetName +
        '|' +
        item.a1Notation
      );
    })
    .sort();

  var targetNamed = snapshotNamedRanges_(target)
    .map(function(item) {
      return (
        item.name +
        '|' +
        item.sheetName +
        '|' +
        item.a1Notation
      );
    })
    .sort();

  if (JSON.stringify(sourceNamed) !== JSON.stringify(targetNamed)) {
    throw new Error('FINAL VERIFY named ranges mismatch');
  }

  if (target.getSpreadsheetTimeZone() !== CONFIG.TARGET_TIME_ZONE) {
    throw new Error(
      'FINAL VERIFY timezone mismatch: ' +
      target.getSpreadsheetTimeZone()
    );
  }

  validateTargetContract_(target);

  // canonical tabsは必ずexactly 1枚ずつ存在する。
  REQUIRED_TABS.forEach(function(tabName) {
    var count = target.getSheets().filter(function(sheet) {
      return sheet.getName() === tabName;
    }).length;

    if (count !== 1) {
      throw new Error(
        'FINAL VERIFY canonical tab count不正: ' +
        tabName +
        ' count=' +
        count
      );
    }
  });

  // 旧target tabsはまだ存在することも検証。
  originalTargetSheets.forEach(function(item) {
    if (!item.tempName) {
      throw new Error('FINAL VERIFY old tab tempName未設定');
    }

    if (!target.getSheetByName(item.tempName)) {
      throw new Error(
        'FINAL VERIFY old tab missing before commit: ' +
        item.tempName
      );
    }
  });
}


function validateTargetContract_(spreadsheet) {
  assertNoGidDependency_(spreadsheet);

  var map = readConfigMap_(spreadsheet);

  assertConfigEquals_(map, 'contract_id', CONFIG.CONTRACT_ID);
  assertConfigEquals_(map, 'schema_version', CONFIG.SCHEMA_VERSION);
  assertConfigEquals_(map, 'spark_sheet_id', CONFIG.TARGET_SPREADSHEET_ID);
  assertConfigEquals_(map, 'spark_sheet_url', CONFIG.TARGET_BASE_URL);
  assertConfigEquals_(map, 'gid_dependency', 'NONE');
}


// -----------------------------------------------------------------------------
// FORMULA INTEGRITY VERIFICATION
// -----------------------------------------------------------------------------

/**
 * Google SheetsはsetFormulas()/sheet renameの過程で、
 * 数式文字列の表記を正規化する場合がある。
 *
 * そのため「source文字列 === target文字列」を成功条件にしない。
 * 代わりに以下を必須とする:
 * - sourceの数式セルにはtargetにも数式がある
 * - 数式セル数が一致
 * - target数式に #REF! / temporary tab参照がない
 * - sourceとtargetの参照先sheet集合が一致
 *
 * 文字列だけが異なり依存先も健全な場合はwarningとして記録する。
 */
function verifyFormulaIntegrity_(
  sourceSheet,
  targetSheet,
  warnings
) {
  var lastRow = sourceSheet.getLastRow();
  var lastColumn = sourceSheet.getLastColumn();

  if (lastRow === 0 || lastColumn === 0) {
    return;
  }

  var sourceFormulas =
    sourceSheet
      .getRange(1, 1, lastRow, lastColumn)
      .getFormulas();

  var targetFormulas =
    targetSheet
      .getRange(1, 1, lastRow, lastColumn)
      .getFormulas();

  var sourceCount = 0;
  var targetCount = 0;

  for (var r = 0; r < sourceFormulas.length; r++) {
    for (var c = 0; c < sourceFormulas[r].length; c++) {
      var sourceFormula = sourceFormulas[r][c] || '';
      var targetFormula = targetFormulas[r][c] || '';

      if (sourceFormula) sourceCount++;
      if (targetFormula) targetCount++;

      if (!sourceFormula) {
        continue;
      }

      var a1 =
        targetSheet
          .getRange(r + 1, c + 1)
          .getA1Notation();

      if (!targetFormula) {
        throw new Error(
          'FORMULA MISSING: ' +
          targetSheet.getName() +
          '!' +
          a1
        );
      }

      assertFormulaHasNoBrokenOrTempRef_(
        targetFormula,
        targetSheet.getName() + '!' + a1
      );

      var sourceRefs = extractSheetRefs_(sourceFormula);
      var targetRefs = extractSheetRefs_(targetFormula);

      if (
        JSON.stringify(sourceRefs) !==
        JSON.stringify(targetRefs)
      ) {
        throw new Error(
          'FORMULA DEPENDENCY mismatch: ' +
          targetSheet.getName() +
          '!' +
          a1 +
          ' sourceRefs=' +
          sourceRefs.join(',') +
          ' targetRefs=' +
          targetRefs.join(',')
        );
      }

      if (
        normalizeFormulaText_(sourceFormula) !==
        normalizeFormulaText_(targetFormula)
      ) {
        warnings.push(
          'formula normalized by Sheets: ' +
          targetSheet.getName() +
          '!' +
          a1 +
          ' | source=' +
          sourceFormula +
          ' | target=' +
          targetFormula
        );
      }
    }
  }

  if (sourceCount !== targetCount) {
    throw new Error(
      'FORMULA COUNT mismatch: ' +
      targetSheet.getName() +
      ' source=' +
      sourceCount +
      ' target=' +
      targetCount
    );
  }
}


function assertFormulaHasNoBrokenOrTempRef_(formula, location) {
  var text = String(formula || '');

  if (
    text.indexOf('#REF!') !== -1 ||
    text.indexOf('__OLD_') !== -1 ||
    text.indexOf('__NEW_') !== -1 ||
    text.indexOf('__ROLLBACK_') !== -1
  ) {
    throw new Error(
      'BROKEN/TEMP FORMULA REF: ' +
      location +
      ' formula=' +
      text
    );
  }
}


/**
 * 数式中の明示sheet参照だけを抽出する。
 * 例:
 *   '07_SOURCE_MASTER'!G4:G500
 *   07_SOURCE_MASTER!G4:G500
 */
function extractSheetRefs_(formula) {
  var text = String(formula || '');
  var refs = [];
  var regex =
    /(?:'((?:[^']|'')+)'|([A-Za-z0-9_]+))!/g;
  var match;

  while ((match = regex.exec(text)) !== null) {
    var ref = match[1] || match[2] || '';
    ref = ref.replace(/''/g, "'");

    if (refs.indexOf(ref) === -1) {
      refs.push(ref);
    }
  }

  refs.sort();
  return refs;
}


/**
 * 表記上の差だけをwarning判定するための軽い正規化。
 * 文字列リテラル内部は壊さないよう、空白削除だけに限定する。
 */
function normalizeFormulaText_(formula) {
  return String(formula || '')
    .replace(/\s+/g, '')
    .toUpperCase();
}


/**
 * commit後の最終監査。
 * 旧tab削除後に #REF! が出た場合はここで必ず失敗させる。
 */
function verifyPostCommitIntegrity_(
  source,
  target,
  configMap,
  warnings
) {
  var actualNames =
    target.getSheets().map(function(sheet) {
      return sheet.getName();
    });

  if (
    JSON.stringify(actualNames) !==
    JSON.stringify(REQUIRED_TABS)
  ) {
    throw new Error(
      'POST COMMIT tabs mismatch: ' +
      actualNames.join(',')
    );
  }

  if (
    target.getSpreadsheetTimeZone() !==
    CONFIG.TARGET_TIME_ZONE
  ) {
    throw new Error(
      'POST COMMIT timezone mismatch: ' +
      target.getSpreadsheetTimeZone()
    );
  }

  validateTargetContract_(target);

  source.getSheets().forEach(function(sourceSheet) {
    var targetSheet =
      target.getSheetByName(sourceSheet.getName());

    if (!targetSheet) {
      throw new Error(
        'POST COMMIT target tab missing: ' +
        sourceSheet.getName()
      );
    }

    verifyFormulaIntegrity_(
      sourceSheet,
      targetSheet,
      warnings
    );

    var lastRow = targetSheet.getLastRow();
    var lastColumn = targetSheet.getLastColumn();

    if (lastRow > 0 && lastColumn > 0) {
      var formulas =
        targetSheet
          .getRange(1, 1, lastRow, lastColumn)
          .getFormulas();

      for (var r = 0; r < formulas.length; r++) {
        for (var c = 0; c < formulas[r].length; c++) {
          if (formulas[r][c]) {
            assertFormulaHasNoBrokenOrTempRef_(
              formulas[r][c],
              targetSheet.getName() +
              '!' +
              targetSheet
                .getRange(r + 1, c + 1)
                .getA1Notation()
            );
          }
        }
      }
    }
  });
}


// -----------------------------------------------------------------------------
// NORMALIZATION
// -----------------------------------------------------------------------------

function normalizeOperationalCapacity_(target, configMap) {
  REQUIRED_TABS.forEach(function(tabName) {
    var key = 'min_rows_' + tabName;

    if (!configMap[key]) {
      return;
    }

    var minRows = parseInt(configMap[key], 10);

    if (!minRows || minRows < 4) {
      throw new Error(
        '不正なmin_rows設定: ' + key + '=' + configMap[key]
      );
    }

    var sheet = target.getSheetByName(tabName);

    if (!sheet) {
      throw new Error('capacity対象tabがありません: ' + tabName);
    }

    var oldMaxRows = sheet.getMaxRows();
    var lastColumn = Math.max(sheet.getLastColumn(), 1);
    var templateRow = parseInt(
      configMap.data_template_row || '4',
      10
    );

    if (oldMaxRows < minRows) {
      sheet.insertRowsAfter(
        oldMaxRows,
        minRows - oldMaxRows
      );

      var templateFormat =
        sheet.getRange(templateRow, 1, 1, lastColumn);

      var newRows =
        sheet.getRange(
          oldMaxRows + 1,
          1,
          minRows - oldMaxRows,
          lastColumn
        );

      templateFormat.copyTo(
        newRows,
        SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
        false
      );
    }

    extendValidationFromTemplateRow_(
      sheet,
      templateRow,
      minRows,
      lastColumn
    );

    extendFormulaFromTemplateRow_(
      sheet,
      templateRow,
      minRows,
      lastColumn
    );
  });
}


function extendValidationFromTemplateRow_(
  sheet,
  templateRow,
  minRows,
  lastColumn
) {
  var rules =
    sheet
      .getRange(templateRow, 1, 1, lastColumn)
      .getDataValidations()[0];

  for (var col = 0; col < rules.length; col++) {
    if (rules[col]) {
      sheet
        .getRange(
          templateRow,
          col + 1,
          minRows - templateRow + 1,
          1
        )
        .setDataValidation(rules[col]);
    }
  }
}


function extendFormulaFromTemplateRow_(
  sheet,
  templateRow,
  minRows,
  lastColumn
) {
  var formulas =
    sheet
      .getRange(templateRow, 1, 1, lastColumn)
      .getFormulas()[0];

  for (var col = 0; col < formulas.length; col++) {
    if (formulas[col]) {
      var sourceCell =
        sheet.getRange(templateRow, col + 1, 1, 1);

      var destination =
        sheet.getRange(
          templateRow,
          col + 1,
          minRows - templateRow + 1,
          1
        );

      sourceCell.copyTo(
        destination,
        SpreadsheetApp.CopyPasteType.PASTE_FORMULA,
        false
      );
    }
  }
}


// -----------------------------------------------------------------------------
// FORMULAS / NAMED RANGES
// -----------------------------------------------------------------------------

function restoreFormulasOnly_(sourceSheet, targetSheet) {
  if (!targetSheet) {
    throw new Error(
      'コピー先tabがありません: ' + sourceSheet.getName()
    );
  }

  var lastRow = sourceSheet.getLastRow();
  var lastColumn = sourceSheet.getLastColumn();

  if (lastRow === 0 || lastColumn === 0) {
    return;
  }

  var formulas =
    sourceSheet
      .getRange(1, 1, lastRow, lastColumn)
      .getFormulas();

  for (var r = 0; r < formulas.length; r++) {
    var start = -1;
    var run = [];

    for (var c = 0; c <= formulas[r].length; c++) {
      var formula =
        c < formulas[r].length
          ? formulas[r][c]
          : '';

      if (formula) {
        if (start === -1) {
          start = c;
          run = [];
        }

        run.push(formula);

      } else if (start !== -1) {
        targetSheet
          .getRange(
            r + 1,
            start + 1,
            1,
            run.length
          )
          .setFormulas([run]);

        start = -1;
        run = [];
      }
    }
  }
}


function snapshotNamedRanges_(spreadsheet) {
  return spreadsheet.getNamedRanges().map(function(namedRange) {
    var range = namedRange.getRange();

    return {
      name: namedRange.getName(),
      sheetName: range.getSheet().getName(),
      a1Notation: range.getA1Notation()
    };
  });
}


function removeAllNamedRanges_(spreadsheet) {
  spreadsheet.getNamedRanges().forEach(function(namedRange) {
    namedRange.remove();
  });
}


function restoreNamedRanges_(spreadsheet, snapshot) {
  snapshot.forEach(function(item) {
    var sheet = spreadsheet.getSheetByName(item.sheetName);

    if (!sheet) {
      throw new Error(
        'Named Range対象tabなし: ' +
        item.name +
        ' -> ' +
        item.sheetName
      );
    }

    spreadsheet.setNamedRange(
      item.name,
      sheet.getRange(item.a1Notation)
    );
  });
}


// -----------------------------------------------------------------------------
// ROLLBACK
// -----------------------------------------------------------------------------

function rollbackTarget_(
  target,
  stagedSheets,
  originalTargetSheets,
  oldNamedRanges
) {
  // 1) staged/new sheetsがcanonical名を持っている場合は先に退避。
  stagedSheets.forEach(function(item, index) {
    try {
      var sheet = item.sheet;

      if (!sheet) {
        return;
      }

      // sheet objectがまだtarget内に存在するか確認。
      var currentName = sheet.getName();
      var found = target.getSheetByName(currentName);

      if (found && found.getSheetId() === sheet.getSheetId()) {
        var rollbackName = makeUniqueTempName_(
          target,
          '__ROLLBACK_NEW_' +
          Utilities.getUuid().slice(0, 8) +
          '_' +
          pad2_(index + 1) +
          '__'
        );

        safeRename_(sheet, rollbackName);
        item.stageName = rollbackName;
      }
    } catch (e) {
      console.error('staged退避失敗: ' + e);
    }
  });

  SpreadsheetApp.flush();

  // 2) old tabsを元の名前へ戻す。
  originalTargetSheets.forEach(function(item) {
    try {
      if (!item.tempName) {
        return;
      }

      var oldSheet = target.getSheetByName(item.tempName);

      if (oldSheet) {
        safeRename_(oldSheet, item.originalName);
      }
    } catch (e) {
      console.error(
        'old tab復旧失敗: ' +
        item.tempName +
        ' -> ' +
        item.originalName +
        ' / ' +
        e
      );
    }
  });

  SpreadsheetApp.flush();

  // 3) staged/new sheetsを削除。
  stagedSheets.forEach(function(item) {
    try {
      var sheet = item.sheet;

      if (!sheet) {
        return;
      }

      var currentName = sheet.getName();
      var found = target.getSheetByName(currentName);

      if (found && found.getSheetId() === sheet.getSheetId()) {
        target.deleteSheet(found);
      }
    } catch (e) {
      console.error('staged削除失敗: ' + e);
    }
  });

  SpreadsheetApp.flush();

  // 4) old Named Rangesを復旧。
  removeAllNamedRanges_(target);
  restoreNamedRanges_(target, oldNamedRanges);

  // Target policyとしてJSTは維持。
  target.setSpreadsheetTimeZone(CONFIG.TARGET_TIME_ZONE);
  SpreadsheetApp.flush();
}


// -----------------------------------------------------------------------------
// FINALIZE / AUDIT
// -----------------------------------------------------------------------------

function reorderCanonicalTabs_(spreadsheet) {
  for (var i = 0; i < REQUIRED_TABS.length; i++) {
    var sheet = spreadsheet.getSheetByName(REQUIRED_TABS[i]);

    if (!sheet) {
      throw new Error(
        'reorder対象tabがありません: ' + REQUIRED_TABS[i]
      );
    }

    spreadsheet.setActiveSheet(sheet);
    spreadsheet.moveActiveSheet(i + 1);
  }
}


function appendGasAudit_(target, runId, source, backupUrl) {
  var sheet = target.getSheetByName('11_AUDIT_LOG');

  if (!sheet) {
    throw new Error('11_AUDIT_LOGがありません。');
  }

  var row = Math.max(sheet.getLastRow() + 1, 4);
  var now = new Date();

  sheet.getRange(row, 1, 1, 16).setValues([[
    'AUD-' + runId,
    now,
    'GAS_OVERWRITER',
    'WORKBOOK_REPLACED',
    'WORKBOOK',
    runId,
    CONFIG.TARGET_SPREADSHEET_ID,
    CONFIG.SCHEMA_VERSION,
    'PREVIOUS_WORKBOOK',
    'CONTRACT_' + CONFIG.SCHEMA_VERSION,
    'SUCCESS',
    'GAS implementation ' +
      CONFIG.IMPLEMENTATION_VERSION +
      ' copied strict source: ' +
      source.getName(),
    source.getUrl(),
    backupUrl,
    runId,
    'TRUE'
  ]]);

  sheet
    .getRange(row, 2)
    .setNumberFormat('yyyy-mm-dd hh:mm:ss');
}


// -----------------------------------------------------------------------------
// ROBUST CROSS-SPREADSHEET COPY
// -----------------------------------------------------------------------------

/**
 * Google Sheets側の一時的な "Service Spreadsheets failed..." を前提に、
 * sheet単位で指数バックオフしながら再試行する。
 *
 * 重要:
 * - target既存canonical tabsはまだ一切変更していない段階で呼ぶ。
 * - copyToが「サーバ側では成功したがクライアントに例外を返した」場合を考慮し、
 *   attempt前後のsheetId差分も検査する。
 * - 失敗時エラーには必ず source tab名 / attempt を含める。
 */
function copySheetWithRetry_(
  sourceSheet,
  targetSpreadsheet,
  alreadyStaged
) {
  var sourceName = sourceSheet.getName();
  var lastError = null;

  for (
    var attempt = 1;
    attempt <= CONFIG.COPY_RETRY_MAX;
    attempt++
  ) {
    var beforeIds = getSheetIdMap_(targetSpreadsheet);

    try {
      SpreadsheetApp.flush();

      var copied = sourceSheet.copyTo(targetSpreadsheet);

      SpreadsheetApp.flush();

      if (!copied) {
        throw new Error('copyTo returned no Sheet object');
      }

      return copied;

    } catch (error) {
      lastError = error;

      // copyToが実際には成功しているのに例外だけ返ったケースを検査。
      SpreadsheetApp.flush();
      Utilities.sleep(400);

      var recovered = findSingleNewSheetSince_(
        targetSpreadsheet,
        beforeIds,
        alreadyStaged
      );

      if (recovered) {
        console.log(
          'copyTo recovery: source=' +
          sourceName +
          ' attempt=' +
          attempt +
          ' recoveredSheet=' +
          recovered.getName()
        );
        return recovered;
      }

      if (attempt >= CONFIG.COPY_RETRY_MAX) {
        break;
      }

      var waitMs =
        CONFIG.COPY_RETRY_BASE_MS *
        Math.pow(2, attempt - 1);

      // 上限を12秒程度に抑える。
      waitMs = Math.min(waitMs, 12000);

      console.warn(
        'copyTo retry: source=' +
        sourceName +
        ' attempt=' +
        attempt +
        '/' +
        CONFIG.COPY_RETRY_MAX +
        ' waitMs=' +
        waitMs +
        ' error=' +
        (error && error.message
          ? error.message
          : String(error))
      );

      Utilities.sleep(waitMs);
    }
  }

  throw new Error(
    'sheet copy failed after retries' +
    ' | sourceTab=' +
    sourceName +
    ' | attempts=' +
    CONFIG.COPY_RETRY_MAX +
    ' | lastError=' +
    (lastError && lastError.message
      ? lastError.message
      : String(lastError))
  );
}


function getSheetIdMap_(spreadsheet) {
  var map = {};

  spreadsheet.getSheets().forEach(function(sheet) {
    map[String(sheet.getSheetId())] = true;
  });

  return map;
}


/**
 * attempt前には存在せず、かつ既にstaged登録済みでもないsheetが
 * exactly 1枚だけ増えていれば、copyTo成功済みとみなして回収する。
 */
function findSingleNewSheetSince_(
  spreadsheet,
  beforeIds,
  alreadyStaged
) {
  var stagedIds = {};

  alreadyStaged.forEach(function(item) {
    if (item && item.sheet) {
      stagedIds[String(item.sheet.getSheetId())] = true;
    }
  });

  var candidates =
    spreadsheet.getSheets().filter(function(sheet) {
      var id = String(sheet.getSheetId());

      return !beforeIds[id] && !stagedIds[id];
    });

  if (candidates.length === 1) {
    return candidates[0];
  }

  return null;
}


// -----------------------------------------------------------------------------
// UTILITIES
// -----------------------------------------------------------------------------

function createTargetBackup_(target) {
  var stamp = Utilities.formatDate(
    new Date(),
    CONFIG.TARGET_TIME_ZONE,
    'yyyyMMdd_HHmmss'
  );

  var file = DriveApp.getFileById(target.getId());

  var name =
    CONFIG.BACKUP_NAME_PREFIX +
    '_' +
    stamp +
    '_' +
    target.getName();

  var parents = file.getParents();
  var copy;

  if (parents.hasNext()) {
    copy = file.makeCopy(name, parents.next());
  } else {
    copy = file.makeCopy(name);
  }

  return copy.getUrl();
}


function safeRename_(sheet, newName) {
  sheet.setName(newName);
  SpreadsheetApp.flush();

  if (sheet.getName() !== newName) {
    throw new Error(
      'tab rename失敗: expected=' +
      newName +
      ' actual=' +
      sheet.getName()
    );
  }
}


function makeUniqueTempName_(spreadsheet, baseName) {
  var maxLength = 95;
  var name = baseName.slice(0, maxLength);
  var counter = 1;

  while (spreadsheet.getSheetByName(name)) {
    var suffix = '_' + counter;
    counter++;
    name =
      baseName.slice(
        0,
        maxLength - suffix.length
      ) +
      suffix;
  }

  return name;
}


function pad2_(number) {
  return number < 10 ? '0' + number : String(number);
}


function extractSpreadsheetId_(input) {
  var text = String(input || '').trim();

  if (!text) {
    throw new Error('コピー元Spreadsheetが指定されていません。');
  }

  var urlMatch =
    text.match(
      /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
    );

  if (urlMatch) {
    return urlMatch[1];
  }

  var idMatch =
    text.match(/^[a-zA-Z0-9-_]{20,}$/);

  if (idMatch) {
    return text;
  }

  throw new Error(
    'GoogleスプレッドシートのURLまたはSpreadsheet IDを指定してください。'
  );
}
