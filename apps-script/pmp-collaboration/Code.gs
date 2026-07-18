const APP = {
  rootFolderProp: 'PMP_ROOT_FOLDER_ID',
  sharedSecretProp: 'PMP_SHARED_SECRET',
  highSeqKey: 'project:%s:highSeq',
  hashKey: 'project:%s:ledgerHash',
  folderKey: 'project:%s:folderId',
  controlKey: 'project:%s:controlSpreadsheetId',
  ledgerKey: 'project:%s:ledger:%s',
  entityVersionKey: 'project:%s:entity:%s:version',
  leaseKey: 'project:%s:entity:%s:lease',
  snapshotLeaseKey: 'project:%s:snapshotLease',
  rootFolderName: 'PMP-Collaboration',
  leaseTtlMs: 90000,
  snapshotLeaseTtlMs: 300000,
};

const EVENT_INDEX_HEADERS = [
  'server_seq',
  'event_id',
  'batch_id',
  'project_id',
  'entity_id',
  'entity_type',
  'event_type',
  'response_event_json',
  'request_event_json',
  'hash',
  'ledger_hash',
  'entity_version',
  'author',
  'device_id',
  'server_time',
];

const LEDGER_HEADERS = [
  'frame_type',
  'project_id',
  'batch_id',
  'server_seq',
  'event_id',
  'entity_id',
  'entity_type',
  'event_type',
  'response_event_json',
  'request_event_json',
  'base_entity_version',
  'entity_version',
  'hash',
  'prev_hash',
  'ledger_hash',
  'author',
  'device_id',
  'created_at',
  'committed_at',
];

const CONFLICT_HEADERS = [
  'conflict_id',
  'project_id',
  'entity_id',
  'batch_id',
  'event_id',
  'base_entity_version',
  'current_entity_version',
  'local_event_json',
  'status',
  'resolution_json',
  'created_at',
  'resolved_at',
  'resolved_by',
];

const LEASE_HEADERS = [
  'project_id',
  'entity_id',
  'holder',
  'lease_token',
  'entity_version',
  'expires_at_ms',
  'updated_at',
  'status',
];

const SNAPSHOT_HEADERS = [
  'snapshot_id',
  'project_id',
  'high_water_seq',
  'hash',
  'manifest_json',
  'published_at',
  'published_by',
];

const AUDIT_HEADERS = [
  'time',
  'action',
  'project_id',
  'actor',
  'details_json',
];

function doGet(e) {
  return handleHttp_({ action: (e && e.parameter && e.parameter.action) || 'health', request: e ? e.parameter : {} });
}

function doPost(e) {
  var body = parseBody_(e);
  return handleHttp_(body);
}

function handleHttp_(body) {
  try {
    requireSecret_(body);
    var action = body.action || 'health';
    var request = body.request || body;
    var result = route_(action, request);
    return json_(result);
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return json_({
      success: false,
      error: String(error && error.message ? error.message : error),
      serverTime: nowIso_(),
    });
  }
}

function route_(action, request) {
  switch (action) {
    case 'commitBatch':
      return commitBatch(request);
    case 'pullEvents':
      return pullEvents(request);
    case 'acquireLease':
      return acquireLease(request);
    case 'renewLease':
      return renewLease(request);
    case 'releaseLease':
      return releaseLease(request);
    case 'resolveConflict':
      return resolveConflict(request);
    case 'claimSnapshot':
      return claimSnapshot(request);
    case 'publishSnapshot':
      return publishSnapshot(request);
    case 'health':
      return health(request);
    default:
      throw new Error('Unsupported action: ' + action);
  }
}

function commitBatch(request) {
  var projectId = pick_(request, 'project_id', 'projectId');
  if (!projectId) throw new Error('Missing projectId');
  var events = request.events || [];
  if (!Array.isArray(events) || events.length === 0) throw new Error('No events to commit');
  if (events.length > 50) throw new Error('A commit batch can contain at most 50 events');

  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var files = ensureProjectFiles_(projectId);
    var indexSheet = files.control.getSheetByName('event_index');
    var conflictSheet = files.control.getSheetByName('conflicts');
    var auditSheet = files.control.getSheetByName('audit');
    var existing = readEventIndex_(indexSheet);
    var props = PropertiesService.getScriptProperties();
    var highSeq = numberProp_(props, format_(APP.highSeqKey, projectId), 0);
    var prevHash = props.getProperty(format_(APP.hashKey, projectId)) || '';
    var batchId = pick_(request, 'batch_id', 'batchId') || uuid_();
    var actor = request.actor || request.author || Session.getActiveUser().getEmail() || 'unknown';
    var serverTime = nowIso_();
    var acceptedRows = [];
    var indexRows = [];
    var appliedEvents = [];
    var acceptedIds = [];
    var duplicateIds = [];
    var conflictIds = [];
    var seqStart = null;
    var seqEnd = highSeq;

    for (var i = 0; i < events.length; i++) {
      var event = normalizeEvent_(projectId, events[i], batchId, i);
      if (existing[event.id]) {
        duplicateIds.push(event.id);
        appliedEvents.push(parseJson_(existing[event.id].response_event_json, event.responseEvent));
        continue;
      }

      var currentVersion = numberProp_(props, format_(APP.entityVersionKey, projectId, event.entityId), 0);
      if (currentVersion > 0 && event.baseEntityVersion < currentVersion) {
        var conflictId = uuid_();
        conflictIds.push(conflictId);
        conflictSheet.appendRow([
          conflictId,
          projectId,
          event.entityId,
          batchId,
          event.id,
          event.baseEntityVersion,
          currentVersion,
          JSON.stringify(event.raw),
          'open',
          '',
          serverTime,
          '',
          '',
        ]);
        continue;
      }

      highSeq += 1;
      if (seqStart === null) seqStart = highSeq;
      var entityVersion = Math.max(currentVersion, event.baseEntityVersion) + 1;
      var eventHash = event.hash || sha256Hex_(JSON.stringify(event.responseEvent));
      var ledgerHash = sha256Hex_([prevHash, batchId, highSeq, event.id, eventHash].join('|'));
      props.setProperty(format_(APP.entityVersionKey, projectId, event.entityId), String(entityVersion));
      props.setProperty(format_(APP.hashKey, projectId), ledgerHash);
      props.setProperty(format_(APP.highSeqKey, projectId), String(highSeq));
      seqEnd = highSeq;
      prevHash = ledgerHash;

      acceptedRows.push({
        event: event,
        serverSeq: highSeq,
        entityVersion: entityVersion,
        eventHash: eventHash,
        ledgerHash: ledgerHash,
        serverTime: serverTime,
        actor: actor,
      });
      indexRows.push([
        highSeq,
        event.id,
        batchId,
        projectId,
        event.entityId,
        event.entityType,
        event.eventType,
        JSON.stringify(event.responseEvent),
        JSON.stringify(event.raw),
        eventHash,
        ledgerHash,
        entityVersion,
        actor,
        event.deviceId,
        serverTime,
      ]);
      acceptedIds.push(event.id);
      appliedEvents.push(event.responseEvent);
    }

    if (acceptedRows.length > 0) {
      appendLedgerFrame_(files.ledger, projectId, batchId, acceptedRows);
      appendRows_(indexSheet, indexRows);
      auditSheet.appendRow([serverTime, 'commitBatch', projectId, actor, JSON.stringify({
        batchId: batchId,
        accepted: acceptedIds.length,
        duplicates: duplicateIds.length,
        conflicts: conflictIds.length,
        seqStart: seqStart,
        seqEnd: seqEnd,
      })]);
    }

    return {
      success: true,
      batchId: batchId,
      seqStart: seqStart,
      seqEnd: seqEnd,
      last_event_id: acceptedIds.length ? acceptedIds[acceptedIds.length - 1] : '',
      applied_events: appliedEvents,
      side_effects: [],
      acceptedEventIds: acceptedIds,
      duplicateEventIds: duplicateIds,
      conflictIds: conflictIds,
      ledgerHash: prevHash,
      serverTime: serverTime,
    };
  } finally {
    lock.releaseLock();
  }
}

function pullEvents(request) {
  var projectId = pick_(request, 'project_id', 'projectId');
  if (!projectId) throw new Error('Missing projectId');
  var afterSeq = Number(pick_(request, 'after_seq', 'afterSeq') || 0);
  var limit = Math.max(1, Math.min(Number(request.limit || 100), 500));
  var files = ensureProjectFiles_(projectId);
  var rows = readRows_(files.control.getSheetByName('event_index'), EVENT_INDEX_HEADERS);
  var selected = rows
    .filter(function (row) { return Number(row.server_seq) > afterSeq; })
    .sort(function (a, b) { return Number(a.server_seq) - Number(b.server_seq); })
    .slice(0, limit);
  var applied = selected.map(function (row) {
    return parseJson_(row.response_event_json, null);
  }).filter(Boolean);
  var seqEnd = selected.length ? Number(selected[selected.length - 1].server_seq) : afterSeq;

  return {
    success: true,
    projectId: projectId,
    afterSeq: afterSeq,
    seqEnd: seqEnd,
    hasMore: selected.length === limit,
    last_event_id: selected.length ? selected[selected.length - 1].event_id : '',
    applied_events: applied,
    side_effects: [],
    events: selected,
    serverTime: nowIso_(),
  };
}

function acquireLease(request) {
  return withLeaseLock_(request, function (props, key, projectId, entityId) {
    var now = Date.now();
    var current = parseJson_(props.getProperty(key), null);
    if (current && Number(current.expiresAtMs) > now && current.holder !== request.holder) {
      return { success: false, readOnly: true, lease: current, serverTime: nowIso_() };
    }
    var lease = {
      projectId: projectId,
      entityId: entityId,
      holder: request.holder || Session.getActiveUser().getEmail() || 'unknown',
      leaseToken: uuid_(),
      entityVersion: numberProp_(props, format_(APP.entityVersionKey, projectId, entityId), 0),
      expiresAtMs: now + Number(request.ttlMs || APP.leaseTtlMs),
      updatedAt: nowIso_(),
      status: 'leased',
    };
    props.setProperty(key, JSON.stringify(lease));
    upsertLeaseRow_(projectId, lease);
    return { success: true, readOnly: false, lease: lease, serverTime: nowIso_() };
  });
}

function renewLease(request) {
  return withLeaseLock_(request, function (props, key, projectId, entityId) {
    var lease = parseJson_(props.getProperty(key), null);
    if (!lease || lease.leaseToken !== request.leaseToken) throw new Error('Lease token is invalid');
    lease.expiresAtMs = Date.now() + Number(request.ttlMs || APP.leaseTtlMs);
    lease.updatedAt = nowIso_();
    props.setProperty(key, JSON.stringify(lease));
    upsertLeaseRow_(projectId, lease);
    return { success: true, lease: lease, serverTime: nowIso_() };
  });
}

function releaseLease(request) {
  return withLeaseLock_(request, function (props, key, projectId, entityId) {
    var lease = parseJson_(props.getProperty(key), null);
    if (lease && request.leaseToken && lease.leaseToken !== request.leaseToken) {
      throw new Error('Lease token is invalid');
    }
    props.deleteProperty(key);
    upsertLeaseRow_(projectId, {
      projectId: projectId,
      entityId: entityId,
      holder: lease ? lease.holder : '',
      leaseToken: lease ? lease.leaseToken : '',
      entityVersion: lease ? lease.entityVersion : 0,
      expiresAtMs: 0,
      updatedAt: nowIso_(),
      status: 'expired',
    });
    return { success: true, serverTime: nowIso_() };
  });
}

function resolveConflict(request) {
  var projectId = pick_(request, 'project_id', 'projectId');
  var conflictId = pick_(request, 'conflict_id', 'conflictId');
  if (!projectId || !conflictId) throw new Error('Missing projectId or conflictId');
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var files = ensureProjectFiles_(projectId);
    var sheet = files.control.getSheetByName('conflicts');
    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === conflictId) {
        sheet.getRange(i + 1, 9, 1, 5).setValues([[
          request.resolutionStatus || request.resolution || 'resolved',
          JSON.stringify(request.resolutionEvent || request.resolution || {}),
          values[i][10] || nowIso_(),
          nowIso_(),
          request.resolvedBy || Session.getActiveUser().getEmail() || 'unknown',
        ]]);
        return { success: true, conflictId: conflictId, serverTime: nowIso_() };
      }
    }
    throw new Error('Conflict not found: ' + conflictId);
  } finally {
    lock.releaseLock();
  }
}

function claimSnapshot(request) {
  var projectId = pick_(request, 'project_id', 'projectId');
  if (!projectId) throw new Error('Missing projectId');
  var props = PropertiesService.getScriptProperties();
  var key = format_(APP.snapshotLeaseKey, projectId);
  var current = parseJson_(props.getProperty(key), null);
  var now = Date.now();
  if (current && Number(current.expiresAtMs) > now && current.holder !== request.holder) {
    return { success: false, lease: current, serverTime: nowIso_() };
  }
  var lease = {
    projectId: projectId,
    holder: request.holder || Session.getActiveUser().getEmail() || 'unknown',
    leaseToken: uuid_(),
    expiresAtMs: now + Number(request.ttlMs || APP.snapshotLeaseTtlMs),
    highWaterSeq: numberProp_(props, format_(APP.highSeqKey, projectId), 0),
    ledgerHash: props.getProperty(format_(APP.hashKey, projectId)) || '',
    updatedAt: nowIso_(),
  };
  props.setProperty(key, JSON.stringify(lease));
  return { success: true, lease: lease, serverTime: nowIso_() };
}

function publishSnapshot(request) {
  var projectId = pick_(request, 'project_id', 'projectId');
  if (!projectId) throw new Error('Missing projectId');
  var files = ensureProjectFiles_(projectId);
  var sheet = files.control.getSheetByName('snapshots');
  var snapshotId = request.snapshotId || request.snapshot_id || uuid_();
  sheet.appendRow([
    snapshotId,
    projectId,
    request.highWaterSeq || request.high_water_seq || 0,
    request.hash || '',
    JSON.stringify(request.manifest || request),
    nowIso_(),
    request.publishedBy || Session.getActiveUser().getEmail() || 'unknown',
  ]);
  return { success: true, snapshotId: snapshotId, serverTime: nowIso_() };
}

function health(request) {
  var projectId = request && (pick_(request, 'project_id', 'projectId'));
  var response = {
    success: true,
    service: 'pmp-collaboration',
    serverTime: nowIso_(),
    rootFolderId: PropertiesService.getScriptProperties().getProperty(APP.rootFolderProp) || null,
  };
  if (projectId) {
    var props = PropertiesService.getScriptProperties();
    response.projectId = projectId;
    response.highSeq = numberProp_(props, format_(APP.highSeqKey, projectId), 0);
    response.ledgerHash = props.getProperty(format_(APP.hashKey, projectId)) || '';
  }
  return response;
}

function appendLedgerFrame_(ledger, projectId, batchId, rows) {
  var sheet = ledger.getSheetByName('ledger');
  var now = nowIso_();
  var frameRows = [[
    'HEADER',
    projectId,
    batchId,
    '',
    '',
    '',
    '',
    '',
    '',
    JSON.stringify({ count: rows.length }),
    '',
    '',
    '',
    rows[0].eventHash,
    rows[rows.length - 1].ledgerHash,
    rows[0].actor,
    '',
    now,
    '',
  ]];
  rows.forEach(function (item) {
    frameRows.push([
      'EVENT',
      projectId,
      batchId,
      item.serverSeq,
      item.event.id,
      item.event.entityId,
      item.event.entityType,
      item.event.eventType,
      JSON.stringify(item.event.responseEvent),
      JSON.stringify(item.event.raw),
      item.event.baseEntityVersion,
      item.entityVersion,
      item.eventHash,
      '',
      item.ledgerHash,
      item.actor,
      item.event.deviceId,
      item.event.createdAt,
      '',
    ]);
  });
  frameRows.push([
    'COMMIT',
    projectId,
    batchId,
    rows[rows.length - 1].serverSeq,
    '',
    '',
    '',
    '',
    '',
    JSON.stringify({ seqEnd: rows[rows.length - 1].serverSeq }),
    '',
    '',
    '',
    '',
    rows[rows.length - 1].ledgerHash,
    rows[0].actor,
    '',
    now,
    now,
  ]);
  appendRows_(sheet, frameRows);
  SpreadsheetApp.flush();
}

function normalizeEvent_(projectId, raw, batchId, index) {
  var eventId = pick_(raw, 'id', 'event_id') || uuid_();
  var payload = raw.payload || {};
  var entityId = pick_(raw, 'entity_id', 'entityId') || payload.id || payload.feature_id || payload.featureId || eventId;
  var eventType = raw.type || raw.eventType || 'unknown';
  var responseEvent = { type: eventType, payload: payload };
  return {
    id: eventId,
    projectId: projectId,
    batchId: batchId,
    entityId: entityId,
    entityType: pick_(raw, 'entity_type', 'entityType') || inferEntityType_(eventType),
    eventType: eventType,
    responseEvent: responseEvent,
    raw: raw,
    baseEntityVersion: Number(pick_(raw, 'base_entity_version', 'baseEntityVersion') || 1),
    deviceId: pick_(raw, 'device_id', 'deviceId') || 'unknown-device',
    hash: raw.hash || '',
    createdAt: raw.createdAt || raw.created_at || nowIso_(),
  };
}

function inferEntityType_(eventType) {
  if (eventType.indexOf('Region') === 0) return 'region';
  if (eventType.indexOf('Layer') === 0) return 'layer';
  if (eventType.indexOf('FeatureGroup') === 0) return 'feature_group';
  if (eventType.indexOf('Feature') === 0 || eventType === 'update_metadata') return 'feature';
  if (eventType.indexOf('Settings') === 0) return 'settings';
  return 'unknown';
}

function ensureProjectFiles_(projectId) {
  var props = PropertiesService.getScriptProperties();
  var root = getRootFolder_();
  var projectFolder = getOrCreateProjectFolder_(props, root, projectId);
  var control = getOrCreateControl_(props, projectFolder, projectId);
  ensureSheet_(control, 'event_index', EVENT_INDEX_HEADERS);
  ensureSheet_(control, 'conflicts', CONFLICT_HEADERS);
  ensureSheet_(control, 'leases', LEASE_HEADERS);
  ensureSheet_(control, 'snapshots', SNAPSHOT_HEADERS);
  ensureSheet_(control, 'audit', AUDIT_HEADERS);
  var ledger = getOrCreateDailyLedger_(props, projectFolder, projectId);
  ensureSheet_(ledger, 'ledger', LEDGER_HEADERS);
  return { projectFolder: projectFolder, control: control, ledger: ledger };
}

function getRootFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(APP.rootFolderProp);
  if (id) return DriveApp.getFolderById(id);
  var folder = DriveApp.createFolder(APP.rootFolderName);
  props.setProperty(APP.rootFolderProp, folder.getId());
  return folder;
}

function getOrCreateProjectFolder_(props, root, projectId) {
  var key = format_(APP.folderKey, projectId);
  var id = props.getProperty(key);
  if (id) return DriveApp.getFolderById(id);
  var folder = root.createFolder(projectId);
  props.setProperty(key, folder.getId());
  return folder;
}

function getOrCreateControl_(props, folder, projectId) {
  var key = format_(APP.controlKey, projectId);
  var id = props.getProperty(key);
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.create('control-' + projectId);
  DriveApp.getFileById(ss.getId()).moveTo(folder);
  props.setProperty(key, ss.getId());
  return ss;
}

function getOrCreateDailyLedger_(props, folder, projectId) {
  var day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var key = format_(APP.ledgerKey, projectId, day);
  var id = props.getProperty(key);
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.create('ledger-' + projectId + '-' + day);
  DriveApp.getFileById(ss.getId()).moveTo(folder);
  props.setProperty(key, ss.getId());
  return ss;
}

function ensureSheet_(spreadsheet, name, headers) {
  var sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readEventIndex_(sheet) {
  var rows = readRows_(sheet, EVENT_INDEX_HEADERS);
  var out = {};
  rows.forEach(function (row) {
    out[row.event_id] = row;
  });
  return out;
}

function readRows_(sheet, headers) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function (row) {
    var obj = {};
    headers.forEach(function (name, index) { obj[name] = row[index]; });
    return obj;
  });
}

function appendRows_(sheet, rows) {
  if (!rows || rows.length === 0) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function withLeaseLock_(request, fn) {
  var projectId = pick_(request, 'project_id', 'projectId');
  var entityId = pick_(request, 'entity_id', 'entityId');
  if (!projectId || !entityId) throw new Error('Missing projectId or entityId');
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var props = PropertiesService.getScriptProperties();
    return fn(props, format_(APP.leaseKey, projectId, entityId), projectId, entityId);
  } finally {
    lock.releaseLock();
  }
}

function upsertLeaseRow_(projectId, lease) {
  var files = ensureProjectFiles_(projectId);
  var sheet = files.control.getSheetByName('leases');
  sheet.appendRow([
    projectId,
    lease.entityId,
    lease.holder,
    lease.leaseToken,
    lease.entityVersion,
    lease.expiresAtMs,
    lease.updatedAt,
    lease.status,
  ]);
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  return JSON.parse(e.postData.contents);
}

function requireSecret_(body) {
  var expected = PropertiesService.getScriptProperties().getProperty(APP.sharedSecretProp);
  if (expected && body.secret !== expected) throw new Error('Invalid collaboration secret');
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function pick_(obj, snake, camel) {
  if (!obj) return null;
  return obj[snake] !== undefined && obj[snake] !== null ? obj[snake] : obj[camel];
}

function parseJson_(raw, fallback) {
  if (!raw) return fallback;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (error) {
    return fallback;
  }
}

function numberProp_(props, key, fallback) {
  var raw = props.getProperty(key);
  var parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sha256Hex_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (value) {
    var byte = value < 0 ? value + 256 : value;
    return ('0' + byte.toString(16)).slice(-2);
  }).join('');
}

function uuid_() {
  return Utilities.getUuid();
}

function nowIso_() {
  return new Date().toISOString();
}

function format_(template) {
  var args = Array.prototype.slice.call(arguments, 1);
  var index = 0;
  return template.replace(/%s/g, function () {
    return String(args[index++]);
  });
}
