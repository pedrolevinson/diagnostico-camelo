'use strict';
/* =========================================================
   Diagnóstico Camelo — persistência local (IndexedDB)
   Tudo fica salvo no aparelho: projetos, núcleos e fotos
   (como blobs, sem limite prático de 5 MB do localStorage).
   ========================================================= */

const DB_NAME = 'diagcamelo';
const DB_VER = 1;
let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const rq = indexedDB.open(DB_NAME, DB_VER);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('nucleos')) {
        const s = db.createObjectStore('nucleos', { keyPath: 'id' });
        s.createIndex('byProject', 'projectId');
      }
      if (!db.objectStoreNames.contains('photos')) {
        const s = db.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('byProject', 'projectId');
        s.createIndex('byNucleo', 'nucleoId');
      }
    };
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
  return _dbPromise;
}

function _req(storeName, mode, op) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const rq = op(t.objectStore(storeName));
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  }));
}

const dbPut    = (store, val)        => _req(store, 'readwrite', s => s.put(val));
const dbGet    = (store, key)        => _req(store, 'readonly',  s => s.get(key));
const dbDel    = (store, key)        => _req(store, 'readwrite', s => s.delete(key));
const dbAll    = (store)             => _req(store, 'readonly',  s => s.getAll());
const dbByIndex = (store, idx, key)  => _req(store, 'readonly',  s => s.index(idx).getAll(key));

function newId() {
  return (crypto.randomUUID) ? crypto.randomUUID()
    : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/* Pede armazenamento persistente (evita que o navegador apague os dados) */
async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted();
      if (!already) await navigator.storage.persist();
    }
  } catch (e) { /* opcional, sem impacto se falhar */ }
}

async function storageEstimate() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      return { usage: usage || 0, quota: quota || 0 };
    }
  } catch (e) { }
  return null;
}

/* ---------- Fotos ---------- */

/* Comprime imagem para JPEG (máx. 1600 px) e gera miniatura (máx. 320 px) */
async function processImage(file) {
  const bitmap = await _loadBitmap(file);
  const full  = await _scaleToBlob(bitmap, 1600, 0.82);
  const thumb = await _scaleToBlob(bitmap, 320, 0.7);
  if (bitmap.close) bitmap.close();
  return { blob: full.blob, w: full.w, h: full.h, thumb: thumb.blob };
}

async function _loadBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    /* fallback para navegadores sem createImageBitmap(file) */
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem')); };
      img.src = url;
    });
  }
}

function _scaleToBlob(bitmap, maxSide, quality) {
  const w0 = bitmap.width, h0 = bitmap.height;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve({ blob: b, w, h }) : reject(new Error('Falha ao comprimir imagem')), 'image/jpeg', quality);
  });
}

async function savePhoto(projectId, nucleoId, sectionId, itemId, file) {
  const { blob, w, h, thumb } = await processImage(file);
  const photo = {
    id: newId(), projectId, nucleoId: nucleoId || '', section: sectionId || '',
    item: itemId || '', blob, thumb, w, h, caption: '', ts: Date.now()
  };
  await dbPut('photos', photo);
  return photo;
}

async function photosOf(nucleoId, projectId) {
  const list = nucleoId ? await dbByIndex('photos', 'byNucleo', nucleoId)
                        : (await dbByIndex('photos', 'byProject', projectId)).filter(p => !p.nucleoId);
  return list.sort((a, b) => a.ts - b.ts);
}

/* ---------- Backup (JSON com fotos em base64) ---------- */

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataURLtoBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

async function exportProjectJSON(projectId) {
  const project = await dbGet('projects', projectId);
  const nucleos = await dbByIndex('nucleos', 'byProject', projectId);
  const photos = await dbByIndex('photos', 'byProject', projectId);
  const photosOut = [];
  for (const p of photos) {
    photosOut.push({
      id: p.id, projectId: p.projectId, nucleoId: p.nucleoId, section: p.section,
      item: p.item, caption: p.caption, ts: p.ts, w: p.w, h: p.h,
      dataUrl: await blobToDataURL(p.blob)
    });
  }
  return {
    formato: 'diagcamelo-backup', versao: 1, appVersion: APP_VERSION,
    exportadoEm: new Date().toISOString(),
    project, nucleos, photos: photosOut
  };
}

async function importProjectJSON(payload) {
  if (!payload || payload.formato !== 'diagcamelo-backup' || !payload.project) {
    throw new Error('Arquivo não é um backup válido do Diagnóstico Camelo.');
  }
  const existing = await dbGet('projects', payload.project.id);
  if (existing && (existing.atualizadoEm || 0) > (payload.project.atualizadoEm || 0)) {
    /* mantém o mais recente, mas ainda mescla núcleos/fotos novos */
  } else {
    await dbPut('projects', payload.project);
  }
  for (const n of (payload.nucleos || [])) {
    const cur = await dbGet('nucleos', n.id);
    if (!cur || (n.atualizadoEm || 0) >= (cur.atualizadoEm || 0)) await dbPut('nucleos', n);
  }
  let fotosNovas = 0;
  for (const p of (payload.photos || [])) {
    const cur = await dbGet('photos', p.id);
    if (cur) { /* já existe; só atualiza legenda se veio preenchida */
      if (p.caption && p.caption !== cur.caption) { cur.caption = p.caption; await dbPut('photos', cur); }
      continue;
    }
    const blob = await dataURLtoBlob(p.dataUrl);
    let thumb = null;
    try { const proc = await processImage(blob); thumb = proc.thumb; } catch (e) { thumb = blob; }
    await dbPut('photos', {
      id: p.id, projectId: p.projectId, nucleoId: p.nucleoId || '', section: p.section || '',
      item: p.item || '', blob, thumb, w: p.w, h: p.h, caption: p.caption || '', ts: p.ts || Date.now()
    });
    fotosNovas++;
  }
  return { nucleos: (payload.nucleos || []).length, fotos: fotosNovas };
}
