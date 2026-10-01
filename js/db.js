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
  const w0 = bitmap.videoWidth || bitmap.naturalWidth || bitmap.width;
  const h0 = bitmap.videoHeight || bitmap.naturalHeight || bitmap.height;
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

/* ---------- Vídeos ----------
   O arquivo original fica guardado no aparelho (sem recompressão) e sobe
   direto para o Drive na sincronização. Do vídeo se extrai um quadro de
   capa (JPEG), que serve de miniatura, de capa no PDF e na Central. */
async function saveVideo(projectId, nucleoId, sectionId, itemId, file) {
  const meta = await videoPoster(file);
  const video = {
    id: newId(), kind: 'video', projectId, nucleoId: nucleoId || '', section: sectionId || '',
    item: itemId || '', blob: file, mime: file.type || 'video/mp4', size: file.size,
    duration: meta.duration, poster: meta.poster, thumb: meta.thumb, w: meta.w, h: meta.h,
    caption: '', ts: Date.now()
  };
  await dbPut('photos', video);
  return video;
}

function videoPoster(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    let done = false;
    const finish = async ok => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      let out;
      try {
        if (!ok || !v.videoWidth) throw new Error('sem quadro');
        const full = await _scaleToBlob(v, 1280, 0.8);
        const thumb = await _scaleToBlob(v, 320, 0.7);
        out = { poster: full.blob, thumb: thumb.blob, w: full.w, h: full.h };
      } catch (e) {
        out = await _placeholderPoster();
      }
      out.duration = isFinite(v.duration) ? Math.round(v.duration) : null;
      URL.revokeObjectURL(url);
      resolve(out);
    };
    const timer = setTimeout(() => finish(v.readyState >= 2), 10000);
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
    v.addEventListener('loadeddata', () => {
      const t = isFinite(v.duration) && v.duration > 0 ? Math.min(1, v.duration / 3) : 0;
      if (t > 0) v.currentTime = t; else finish(true);
    });
    v.addEventListener('seeked', () => finish(true));
    v.addEventListener('error', () => finish(false));
    v.src = url;
    v.load();
  });
}

/* capa genérica quando o navegador não consegue decodificar o vídeo */
async function _placeholderPoster() {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 360;
  const x = c.getContext('2d');
  x.fillStyle = '#1d2b36'; x.fillRect(0, 0, 640, 360);
  x.fillStyle = '#ffffff';
  x.beginPath(); x.moveTo(280, 130); x.lineTo(280, 230); x.lineTo(370, 180); x.closePath(); x.fill();
  x.font = '24px sans-serif'; x.textAlign = 'center'; x.fillText('Vídeo', 320, 290);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
  return { poster: blob, thumb: blob, w: 640, h: 360 };
}

const isVideo = ph => ph && ph.kind === 'video';

function fmtDuration(s) {
  if (!s && s !== 0) return '';
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return m + ':' + String(r).padStart(2, '0');
}

function driveLink(fileId) {
  return 'https://drive.google.com/file/d/' + fileId + '/view';
}

async function photosOf(nucleoId, projectId) {
  const list = nucleoId ? await dbByIndex('photos', 'byNucleo', nucleoId)
                        : (await dbByIndex('photos', 'byProject', projectId)).filter(p => !p.nucleoId);
  return list.sort((a, b) => a.ts - b.ts);
}

/* ---------- Backup (JSON com fotos em base64) ---------- */

const VIDEO_BACKUP_MAX = 30 * 1024 * 1024;

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
    const out = {
      id: p.id, projectId: p.projectId, nucleoId: p.nucleoId, section: p.section,
      item: p.item, caption: p.caption, ts: p.ts, w: p.w, h: p.h
    };
    if (isVideo(p)) {
      /* vídeo grande não cabe num backup de WhatsApp: vai a capa, e o
         arquivo só se for pequeno (o original sobe pela nuvem) */
      Object.assign(out, { kind: 'video', mime: p.mime, size: p.size, duration: p.duration, driveFileId: p.driveFileId || '' });
      out.posterUrl = await blobToDataURL(p.poster || p.thumb);
      if (p.blob && p.size <= VIDEO_BACKUP_MAX) out.dataUrl = await blobToDataURL(p.blob);
    } else {
      out.dataUrl = await blobToDataURL(p.blob);
    }
    photosOut.push(out);
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
    if (p.kind === 'video') {
      const poster = await dataURLtoBlob(p.posterUrl);
      await dbPut('photos', {
        id: p.id, kind: 'video', projectId: p.projectId, nucleoId: p.nucleoId || '', section: p.section || '',
        item: p.item || '', blob: p.dataUrl ? await dataURLtoBlob(p.dataUrl) : null, poster, thumb: poster,
        mime: p.mime, size: p.size, duration: p.duration, driveFileId: p.driveFileId || '',
        w: p.w, h: p.h, caption: p.caption || '', ts: p.ts || Date.now(),
        /* já está no Drive, ou o backup não trouxe o arquivo: nada a subir.
           Se trouxe o arquivo e ele nunca subiu, este aparelho envia. */
        syncEm: (p.dataUrl && !p.driveFileId) ? undefined : (p.ts || Date.now())
      });
      fotosNovas++;
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
