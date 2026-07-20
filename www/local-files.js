(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PilotLogbookLocalFiles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DB_NAME = 'pilotLogbookLocalFiles';
  const DB_VERSION = 2;
  const LEGACY_STORE_NAME = 'careerAttachments';
  const STORE_NAME = 'careerAttachmentsV2';
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_OWNER_BYTES = 50 * 1024 * 1024;
  const MAX_FILES_PER_CAREER = 3;
  const MAX_OWNER_FILES = 300;
  const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

  function cleanId(value, maxLength = 128) {
    return String(value || '').trim().slice(0, maxLength).replace(/[^A-Za-z0-9:_-]/g, '');
  }

  function cleanFileName(value) {
    return String(value || 'attachment')
      .replace(/[\\/\u0000-\u001f\u007f]/g, '_')
      .trim()
      .slice(0, 120) || 'attachment';
  }

  function normalizedType(name, type) {
    const mime = String(type || '').toLowerCase();
    if (ALLOWED_TYPES.has(mime)) return mime;
    const lower = String(name || '').toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
    return '';
  }

  function makeError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function openDb() {
    if (typeof indexedDB === 'undefined') return Promise.reject(makeError('이 기기에서는 첨부파일 저장을 지원하지 않습니다.', 'unsupported'));
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        let store;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          store = db.createObjectStore(STORE_NAME, { keyPath: 'storageKey' });
          store.createIndex('ownerId', 'ownerId', { unique: false });
          store.createIndex('careerId', 'careerId', { unique: false });
        } else {
          store = request.transaction.objectStore(STORE_NAME);
        }
        // 구형 저장소는 삭제하지 않고 계정별 키를 붙여 새 저장소로 복사한다.
        if (db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
          const legacy = request.transaction.objectStore(LEGACY_STORE_NAME);
          const cursorRequest = legacy.openCursor();
          cursorRequest.onsuccess = event => {
            const cursor = event.target.result;
            if (!cursor) return;
            const record = cursor.value;
            const ownerId = cleanId(record && record.ownerId);
            const id = cleanId(record && record.id);
            if (ownerId && id) store.put({ ...record, ownerId, id, storageKey: `${ownerId}:${id}` });
            cursor.continue();
          };
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || makeError('첨부파일 저장소를 열지 못했습니다.', 'db-open'));
    });
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || makeError('첨부파일 저장이 중단되었습니다.', 'db-abort'));
    });
  }

  async function allRecords() {
    const db = await openDb();
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      return await requestResult(transaction.objectStore(STORE_NAME).getAll());
    } finally {
      db.close();
    }
  }

  async function listForOwner(ownerId) {
    const owner = cleanId(ownerId);
    if (!owner) return [];
    return (await allRecords()).filter(record => record.ownerId === owner);
  }

  async function listForCareer(ownerId, careerId) {
    const owner = cleanId(ownerId);
    const career = cleanId(careerId);
    return (await listForOwner(owner))
      .filter(record => record.careerId === career)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  function validateNewFiles(existing, careerId, files) {
    if (!files.length) throw makeError('첨부할 파일을 선택해 주세요.', 'empty');
    const currentCareerCount = existing.filter(record => record.careerId === careerId).length;
    if (currentCareerCount + files.length > MAX_FILES_PER_CAREER) {
      throw makeError(`경력 하나에는 최대 ${MAX_FILES_PER_CAREER}개까지 첨부할 수 있습니다.`, 'career-limit');
    }
    if (existing.length + files.length > MAX_OWNER_FILES) throw makeError('저장할 수 있는 첨부파일 수를 초과했습니다.', 'owner-file-limit');

    let addedBytes = 0;
    files.forEach(file => {
      if (!file || !Number.isFinite(file.size) || file.size <= 0) throw makeError('빈 파일은 첨부할 수 없습니다.', 'empty-file');
      if (file.size > MAX_FILE_BYTES) throw makeError('파일 한 개는 10MB 이하여야 합니다.', 'file-size');
      if (!normalizedType(file.name, file.type)) throw makeError('PDF, JPG, PNG 파일만 첨부할 수 있습니다.', 'file-type');
      addedBytes += file.size;
    });
    const usedBytes = existing.reduce((sum, record) => sum + (Number(record.size) || 0), 0);
    if (usedBytes + addedBytes > MAX_OWNER_BYTES) throw makeError('이 기기의 첨부파일은 사용자당 최대 50MB까지 저장할 수 있습니다.', 'owner-size');
  }

  async function validateFiles(ownerId, careerId, fileList, pendingFileList) {
    const owner = cleanId(ownerId);
    const career = cleanId(careerId);
    if (!owner || !career) throw makeError('로그인 정보 또는 경력 항목을 확인할 수 없습니다.', 'missing-owner');
    const files = Array.from(fileList || []);
    const pending = Array.from(pendingFileList || []).map(file => ({
      careerId: career,
      size: Number(file && file.size) || 0,
    }));
    const existing = await listForOwner(owner);
    validateNewFiles(existing.concat(pending), career, files);
    return true;
  }

  async function addFiles(ownerId, careerId, fileList) {
    const owner = cleanId(ownerId);
    const career = cleanId(careerId);
    if (!owner || !career) throw makeError('로그인 정보 또는 경력 항목을 확인할 수 없습니다.', 'missing-owner');
    const files = Array.from(fileList || []);
    const existing = await listForOwner(owner);
    validateNewFiles(existing, career, files);
    const now = new Date().toISOString();
    const records = files.map((file, index) => {
      const id = `${Date.now().toString(36)}${index}${Math.random().toString(36).slice(2, 10)}`;
      return {
        id,
        storageKey: `${owner}:${id}`,
        ownerId: owner,
        careerId: career,
        name: cleanFileName(file.name),
        type: normalizedType(file.name, file.type),
        size: file.size,
        createdAt: now,
        blob: file,
      };
    });

    const db = await openDb();
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      records.forEach(record => store.put(record));
      await transactionDone(transaction);
    } finally {
      db.close();
    }
    return records;
  }

  async function getFile(ownerId, attachmentId) {
    const owner = cleanId(ownerId);
    const id = cleanId(attachmentId);
    const db = await openDb();
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const record = await requestResult(transaction.objectStore(STORE_NAME).get(`${owner}:${id}`));
      return record && record.ownerId === owner ? record : null;
    } finally {
      db.close();
    }
  }

  async function deleteFile(ownerId, attachmentId) {
    const owner = cleanId(ownerId);
    const id = cleanId(attachmentId);
    return (await deleteMatching(record => record.ownerId === owner && record.id === id)) > 0;
  }

  async function deleteMatching(predicate) {
    const records = (await allRecords()).filter(predicate);
    if (!records.length) return 0;
    const db = await openDb();
    try {
      const storeNames = [STORE_NAME];
      if (db.objectStoreNames.contains(LEGACY_STORE_NAME)) storeNames.push(LEGACY_STORE_NAME);
      const transaction = db.transaction(storeNames, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      records.forEach(record => store.delete(record.storageKey));
      if (storeNames.includes(LEGACY_STORE_NAME)) {
        const legacyCursor = transaction.objectStore(LEGACY_STORE_NAME).openCursor();
        legacyCursor.onsuccess = event => {
          const cursor = event.target.result;
          if (!cursor) return;
          if (predicate(cursor.value)) cursor.delete();
          cursor.continue();
        };
      }
      await transactionDone(transaction);
      return records.length;
    } finally {
      db.close();
    }
  }

  async function deleteForCareer(ownerId, careerId) {
    const owner = cleanId(ownerId);
    const career = cleanId(careerId);
    return deleteMatching(record => record.ownerId === owner && record.careerId === career);
  }

  async function deleteForOwner(ownerId) {
    const owner = cleanId(ownerId);
    return deleteMatching(record => record.ownerId === owner);
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 24576;
    let result = '';
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
      let binary = '';
      for (let i = 0; i < chunk.length; i++) binary += String.fromCharCode(chunk[i]);
      result += btoa(binary);
    }
    return result;
  }

  function base64ToBlob(data, type) {
    if (typeof data !== 'string' || data.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 + 8 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
      throw makeError('백업의 첨부파일 데이터가 올바르지 않습니다.', 'backup-data');
    }
    let binary;
    try { binary = atob(data); } catch (_) { throw makeError('백업의 첨부파일을 해석하지 못했습니다.', 'backup-data'); }
    const parts = [];
    for (let offset = 0; offset < binary.length; offset += 16384) {
      const slice = binary.slice(offset, offset + 16384);
      const bytes = new Uint8Array(slice.length);
      for (let i = 0; i < slice.length; i++) bytes[i] = slice.charCodeAt(i);
      parts.push(bytes);
    }
    return new Blob(parts, { type });
  }

  async function exportForOwner(ownerId, allowedCareerIds) {
    const allowed = allowedCareerIds ? new Set(allowedCareerIds) : null;
    const records = (await listForOwner(ownerId)).filter(record => !allowed || allowed.has(record.careerId));
    const output = [];
    for (const record of records) {
      output.push({
        id: cleanId(record.id),
        careerId: cleanId(record.careerId),
        name: cleanFileName(record.name),
        type: normalizedType(record.name, record.type),
        size: Number(record.size) || 0,
        createdAt: String(record.createdAt || '').slice(0, 40),
        data: arrayBufferToBase64(await record.blob.arrayBuffer()),
      });
    }
    return output;
  }

  async function restoreForOwner(ownerId, serializedRecords, allowedCareerIds) {
    const owner = cleanId(ownerId);
    if (!owner) throw makeError('로그인 정보를 확인할 수 없습니다.', 'missing-owner');
    if (!Array.isArray(serializedRecords) || serializedRecords.length > MAX_OWNER_FILES) throw makeError('백업의 첨부파일 목록이 올바르지 않습니다.', 'backup-list');
    const allowed = new Set(allowedCareerIds || []);
    const incoming = [];
    for (const raw of serializedRecords) {
      const id = cleanId(raw && raw.id);
      const careerId = cleanId(raw && raw.careerId);
      const name = cleanFileName(raw && raw.name);
      const type = normalizedType(name, raw && raw.type);
      if (!id || !careerId || !allowed.has(careerId) || !type) throw makeError('백업의 첨부파일 정보가 올바르지 않습니다.', 'backup-file');
      const blob = base64ToBlob(raw.data, type);
      if (blob.size <= 0 || blob.size > MAX_FILE_BYTES || blob.size !== Number(raw.size)) throw makeError('백업의 첨부파일 크기가 올바르지 않습니다.', 'backup-size');
      incoming.push({ id, storageKey: `${owner}:${id}`, ownerId: owner, careerId, name, type, size: blob.size, createdAt: String(raw.createdAt || '').slice(0, 40), blob });
    }

    const existing = await listForOwner(owner);
    const merged = new Map(existing.map(record => [record.id, record]));
    incoming.forEach(record => merged.set(record.id, record));
    const mergedRecords = [...merged.values()];
    if (mergedRecords.length > MAX_OWNER_FILES) throw makeError('복원 후 첨부파일 수가 허용 범위를 초과합니다.', 'owner-file-limit');
    const totalBytes = mergedRecords.reduce((sum, record) => sum + (Number(record.size) || 0), 0);
    if (totalBytes > MAX_OWNER_BYTES) throw makeError('복원 후 첨부파일 용량이 50MB를 초과합니다.', 'owner-size');
    const careerCounts = new Map();
    mergedRecords.forEach(record => careerCounts.set(record.careerId, (careerCounts.get(record.careerId) || 0) + 1));
    if ([...careerCounts.values()].some(count => count > MAX_FILES_PER_CAREER)) throw makeError('한 경력에 첨부된 파일이 3개를 초과합니다.', 'career-limit');

    const db = await openDb();
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      incoming.forEach(record => store.put(record));
      await transactionDone(transaction);
    } finally {
      db.close();
    }
    return incoming.length;
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value}B`;
    if (value < 1024 * 1024) return `${Math.round(value / 1024)}KB`;
    return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
  }

  return {
    MAX_FILE_BYTES, MAX_OWNER_BYTES, MAX_FILES_PER_CAREER,
    normalizedType, cleanFileName, listForOwner, listForCareer, validateFiles, addFiles, getFile,
    deleteFile, deleteForCareer, deleteForOwner, exportForOwner, restoreForOwner, formatBytes,
  };
});
