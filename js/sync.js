'use strict';
/* =========================================================
   Diagnóstico Camelo — sincronização com a nuvem (Supabase)

   Fluxo: tudo continua salvo primeiro no aparelho (IndexedDB).
   Quando há internet, os registros alterados desde a última
   sincronização sobem sozinhos: fotos para o Storage e
   dados via RPC sync_up (última escrita vence, por registro).
   As leituras da nuvem (Central) exigem o código da equipe.
   ========================================================= */

/* as funções da Vercel moram sempre no endereço oficial (o espelho do
   GitHub Pages não tem servidor) */
const API_BASE = 'https://diagnostico-camelo.vercel.app';

const syncState = {
  running: false,
  progress: '',
  lastOk: Number(localStorage.getItem('diagcamelo-sync-last') || 0),
  lastError: null
};

function deviceName() {
  let d = localStorage.getItem('diagcamelo-device');
  if (!d) {
    d = (navigator.platform || 'aparelho').split(' ')[0] + '-' + Math.random().toString(36).slice(2, 6);
    localStorage.setItem('diagcamelo-device', d);
  }
  return d;
}

function _sbHeaders(json) {
  const h = {
    'apikey': CONFIG.supabaseAnon,
    'Authorization': 'Bearer ' + CONFIG.supabaseAnon
  };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

const isoOrNull = ms => ms ? new Date(ms).toISOString() : null;

function photoStoragePath(ph) {
  return ph.projectId + '/' + (ph.nucleoId || 'projeto') + '/' + ph.id + '.jpg';
}

function publicPhotoUrl(storagePath) {
  return CONFIG.supabaseUrl + '/storage/v1/object/public/fotos/' + storagePath;
}

/* ---------- o que está pendente ---------- */
function _isDirty(rec) {
  return (rec.atualizadoEm || 0) > (rec.syncEm || 0);
}
function _photoDirty(ph) {
  if (isVideo(ph) && !ph.blob && !ph.driveFileId) return false; /* sem arquivo para enviar */
  return !ph.syncEm || (ph.atualizadoEm || 0) > ph.syncEm;
}

async function pendingCounts() {
  const [projects, nucleos, photos] = await Promise.all([
    dbAll('projects'), dbAll('nucleos'), dbAll('photos')
  ]);
  const pf = photos.filter(_photoDirty);
  return {
    projects: projects.filter(_isDirty).length,
    nucleos: nucleos.filter(_isDirty).length,
    photos: pf.filter(p => !isVideo(p)).length,
    videos: pf.filter(isVideo).length
  };
}

/* fetch com tempo limite: em sinal fraco a requisição pode ficar
   pendurada para sempre e travar a sincronização */
async function fetchT(url, init, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 30000);
  try {
    return await fetch(url, Object.assign({}, init, { signal: ctrl.signal }));
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('conexão lenta demais (tempo esgotado)');
    throw new Error('sem conexão com o servidor');
  } finally {
    clearTimeout(t);
  }
}

/* marca como enviado relendo do banco: se o registro foi editado durante
   o envio, ele continua pendente (antes a cópia antiga sobrescrevia a edição) */
async function _markSynced(store, id, enviadoEm, extra) {
  const cur = await dbGet(store, id);
  if (!cur) return;
  cur.syncEm = enviadoEm;
  if (extra) Object.assign(cur, extra);
  await dbPut(store, cur);
}

async function _rpcSync(payload) {
  const res = await fetchT(CONFIG.supabaseUrl + '/rest/v1/rpc/sync_up', {
    method: 'POST', headers: _sbHeaders(true), body: JSON.stringify({ payload })
  }, 45000);
  if (!res.ok) throw new Error('envio de dados falhou (' + res.status + ')');
}

async function _uploadStorage(path, blob) {
  const res = await fetchT(CONFIG.supabaseUrl + '/storage/v1/object/fotos/' + path, {
    method: 'POST',
    headers: Object.assign(_sbHeaders(false), { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }),
    body: blob
  }, 120000);
  if (!res.ok) throw new Error('upload de foto falhou (' + res.status + ')');
}

function _photoRow(ph, device) {
  const row = {
    id: ph.id, project_id: ph.projectId, nucleo_id: ph.nucleoId || '',
    section: ph.section || '', item: ph.item || '', caption: ph.caption || '',
    w: ph.w, h: ph.h, ts: isoOrNull(ph.ts), storage_path: photoStoragePath(ph), device
  };
  if (isVideo(ph)) Object.assign(row, {
    kind: 'video', mime: ph.mime, size: ph.size, duration: ph.duration, drive_file_id: ph.driveFileId || ''
  });
  return row;
}

/* ---------- vídeo: upload retomável direto para o Drive ---------- */
const VIDEO_CHUNK = 2 * 1024 * 1024; /* múltiplo de 256 KB, exigência do Drive */

async function _driveStatus(url, size) {
  const r = await fetchT(url, { method: 'PUT', headers: { 'Content-Range': 'bytes */' + size }, body: '' }, 30000);
  if (r.status === 200 || r.status === 201) return { done: true, id: (await r.json()).id };
  if (r.status === 308) {
    const range = r.headers.get('Range');
    return { done: false, offset: range ? Number(range.split('-')[1]) + 1 : 0 };
  }
  return { expired: true };
}

async function uploadVideo(v, onProgress) {
  const size = v.blob.size;
  let url = v.uploadUrl && (Date.now() - (v.uploadEm || 0) < 5 * 86400000) ? v.uploadUrl : null;
  let offset = 0;
  if (url) {
    const st = await _driveStatus(url, size);
    if (st.done) return st.id;
    if (st.expired) url = null; else offset = st.offset;
  }
  if (!url) {
    const projeto = await dbGet('projects', v.projectId);
    const nucleo = v.nucleoId ? await dbGet('nucleos', v.nucleoId) : null;
    const r = await fetchT(API_BASE + '/api/video-upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: v.id, mime: v.mime || 'video/mp4', size, caption: v.caption || '', ts: isoOrNull(v.ts),
        project_nome: (projeto && projeto.nome) || 'Projeto',
        nucleo_nome: nucleo ? (nucleo.nome || 'Núcleo sem nome') : 'Fotos do projeto'
      })
    }, 45000);
    if (!r.ok) throw new Error('Drive não abriu o envio do vídeo (' + r.status + ')');
    url = (await r.json()).uploadUrl;
    offset = 0;
    await _markSynced('photos', v.id, v.syncEm, { uploadUrl: url, uploadEm: Date.now() });
  }
  while (offset < size) {
    const end = Math.min(offset + VIDEO_CHUNK, size);
    let r;
    try {
      r = await fetchT(url, {
        method: 'PUT',
        headers: { 'Content-Range': 'bytes ' + offset + '-' + (end - 1) + '/' + size },
        body: v.blob.slice(offset, end)
      }, 180000);
    } catch (e) {
      /* pedaço perdido: pergunta ao Drive até onde chegou e segue dali */
      const st = await _driveStatus(url, size);
      if (st.done) return st.id;
      if (st.expired) throw e;
      offset = st.offset;
      continue;
    }
    if (r.status === 200 || r.status === 201) { if (onProgress) onProgress(1); return (await r.json()).id; }
    if (r.status !== 308) throw new Error('Drive recusou um pedaço do vídeo (' + r.status + ')');
    const range = r.headers.get('Range');
    offset = range ? Number(range.split('-')[1]) + 1 : end;
    if (onProgress) onProgress(offset / size);
  }
  const st = await _driveStatus(url, size);
  if (st.done) return st.id;
  throw new Error('vídeo não terminou de subir');
}

/* ---------- envio ----------
   Ordem: textos (pequenos, sobem primeiro) → fotos uma a uma → vídeos.
   Cada item é marcado assim que chega, então sinal que cai no meio
   não joga fora o que já foi; na próxima tentativa segue do resto. */
async function syncNow(manual) {
  if (syncState.running) return { ok: false, reason: 'já sincronizando' };
  if (!navigator.onLine) {
    if (manual) toast('Sem internet agora. Vai sincronizar sozinho quando conectar.');
    _notifySync();
    return { ok: false, reason: 'offline' };
  }
  syncState.running = true;
  syncState.lastError = null;
  syncState.progress = '';
  _notifySync();
  processTombstones();
  let total = 0, fotosEnviadas = 0;
  try {
    const [projects, nucleos, photos] = await Promise.all([
      dbAll('projects'), dbAll('nucleos'), dbAll('photos')
    ]);
    const dirtyP = projects.filter(_isDirty);
    const dirtyN = nucleos.filter(_isDirty);
    const dirtyF = photos.filter(_photoDirty).sort((a, b) => a.ts - b.ts);
    const fotos = dirtyF.filter(p => !isVideo(p));
    const videos = dirtyF.filter(isVideo);
    const device = deviceName();

    /* 1. textos de projetos e núcleos */
    if (dirtyP.length || dirtyN.length) {
      syncState.progress = 'Enviando textos…'; _notifySync();
      await _rpcSync({
        projects: dirtyP.map(p => {
          const dados = {};
          PROJECT_FIELDS.forEach(f => { if (isFilled(p[f.key])) dados[f.key] = p[f.key]; });
          return { id: p.id, nome: p.nome || '', dados, criado_em: isoOrNull(p.criadoEm), atualizado_em: isoOrNull(p.atualizadoEm), device };
        }),
        nucleos: dirtyN.map(n => ({
          id: n.id, project_id: n.projectId, nome: n.nome || '', dados: n.dados || {},
          criado_em: isoOrNull(n.criadoEm), atualizado_em: isoOrNull(n.atualizadoEm), device
        }))
      });
      for (const p of dirtyP) await _markSynced('projects', p.id, p.atualizadoEm || Date.now());
      for (const n of dirtyN) await _markSynced('nucleos', n.id, n.atualizadoEm || Date.now());
      total += dirtyP.length + dirtyN.length;
    }

    /* 2. fotos, uma a uma */
    for (let i = 0; i < fotos.length; i++) {
      const ph = fotos[i];
      syncState.progress = `Enviando foto ${i + 1} de ${fotos.length}…`; _notifySync();
      if (!ph.syncEm) await _uploadStorage(photoStoragePath(ph), ph.blob); /* legenda nova não reenvia o arquivo */
      await _rpcSync({ photos: [_photoRow(ph, device)] });
      await _markSynced('photos', ph.id, ph.atualizadoEm || ph.ts || Date.now());
      fotosEnviadas++; total++;
    }

    /* 3. vídeos: arquivo direto para o Drive, capa para a nuvem */
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      const rotulo = `Enviando vídeo ${i + 1} de ${videos.length}`;
      syncState.progress = rotulo + '…'; _notifySync();
      if (!v.driveFileId) {
        v.driveFileId = await uploadVideo(v, frac => {
          syncState.progress = `${rotulo} (${Math.round(frac * 100)}%)…`; _notifySync();
        });
        await _markSynced('photos', v.id, v.syncEm, { driveFileId: v.driveFileId, uploadUrl: null });
      }
      if (!v.syncEm) await _uploadStorage(photoStoragePath(v), v.poster || v.thumb);
      await _rpcSync({ photos: [_photoRow(v, device)] });
      await _markSynced('photos', v.id, v.atualizadoEm || v.ts || Date.now());
      total++;
    }

    syncState.lastOk = Date.now();
    localStorage.setItem('diagcamelo-sync-last', String(syncState.lastOk));
    if (manual) toast(total ? 'Sincronizado: ' + total + ' item(ns) enviados ✓' : 'Tudo já sincronizado ✓');
    return { ok: true, enviados: total };
  } catch (e) {
    console.error('sync:', e);
    syncState.lastError = e.message;
    if (manual) toast('Falha na sincronização: ' + e.message + '. O que já subiu está salvo; o resto tenta de novo sozinho.', 5000);
    return { ok: false, reason: e.message };
  } finally {
    if (fotosEnviadas) triggerDriveMirror();
    syncState.running = false;
    syncState.progress = '';
    _notifySync();
  }
}

function _notifySync() {
  document.dispatchEvent(new CustomEvent('syncchange'));
}

/* avisa o robô do espelho no Drive (fire-and-forget; roda no servidor) */
function triggerDriveMirror() {
  try {
    fetch(API_BASE + '/api/drive-mirror', { method: 'POST', mode: 'cors' })
      .catch(() => { });
  } catch (e) { }
}

/* ---------- exclusões propagadas para a nuvem (fila offline) ---------- */
let _tombstonesRunning = false;

function queueCloudDelete(tipo, id) {
  const fila = JSON.parse(localStorage.getItem('diagcamelo-tombstones') || '[]');
  fila.push({ tipo, id });
  localStorage.setItem('diagcamelo-tombstones', JSON.stringify(fila));
  processTombstones();
}

async function processTombstones() {
  if (_tombstonesRunning || !navigator.onLine) return;
  _tombstonesRunning = true;
  try {
    let fila = JSON.parse(localStorage.getItem('diagcamelo-tombstones') || '[]');
    while (fila.length) {
      const item = fila[0];
      const res = await fetchT(API_BASE + '/api/apagar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      }, 30000);
      if (!res.ok) break;
      fila = fila.slice(1);
      localStorage.setItem('diagcamelo-tombstones', JSON.stringify(fila));
    }
  } catch (e) { /* sem rede ou servidor fora: tenta de novo no próximo sync */ }
  _tombstonesRunning = false;
}

window.addEventListener('online', processTombstones);

/* dispara sozinho: ao abrir, ao voltar a internet e pouco depois de cada edição */
let _syncDebounce = null;
function scheduleSync() {
  clearTimeout(_syncDebounce);
  _syncDebounce = setTimeout(() => syncNow(false), 12000);
}
window.addEventListener('online', () => syncNow(false));
setTimeout(() => syncNow(false), 3500);

/* sinal fraco: o navegador acha que está online mas o envio falha.
   Enquanto houver pendência, tenta de novo a cada minuto. */
setInterval(async () => {
  if (syncState.running || !navigator.onLine || document.visibilityState !== 'visible') return;
  try {
    const c = await pendingCounts();
    if (c.projects + c.nucleos + c.photos + c.videos) syncNow(false);
  } catch (e) { }
}, 60000);

/* ---------- Central (leitura da nuvem com código da equipe) ---------- */
async function fetchPainel(code) {
  const res = await fetchT(CONFIG.supabaseUrl + '/rest/v1/rpc/painel', {
    method: 'POST', headers: _sbHeaders(true), body: JSON.stringify({ code })
  }, 60000);
  if (res.status === 400) throw new Error('Código da equipe incorreto.');
  if (!res.ok) throw new Error('Falha ao consultar a central (' + res.status + ')');
  return res.json();
}

/* baixa um projeto da nuvem para o aparelho (vira projeto local completo) */
async function downloadCloudProject(cloud, projectId, onProgress) {
  const proj = cloud.projects.find(p => p.id === projectId);
  if (!proj) throw new Error('Projeto não encontrado na nuvem.');
  const local = Object.assign({
    id: proj.id, nome: proj.nome,
    criadoEm: Date.parse(proj.criado_em) || Date.now(),
    atualizadoEm: Date.parse(proj.atualizado_em) || Date.now()
  }, proj.dados || {});
  local.syncEm = local.atualizadoEm;
  const cur = await dbGet('projects', proj.id);
  if (!cur || (local.atualizadoEm >= (cur.atualizadoEm || 0))) await dbPut('projects', local);

  const nucleos = cloud.nucleos.filter(n => n.project_id === projectId);
  for (const n of nucleos) {
    const ln = {
      id: n.id, projectId: n.project_id, nome: n.nome, dados: n.dados || {},
      criadoEm: Date.parse(n.criado_em) || Date.now(),
      atualizadoEm: Date.parse(n.atualizado_em) || Date.now()
    };
    ln.syncEm = ln.atualizadoEm;
    const curN = await dbGet('nucleos', n.id);
    if (!curN || (ln.atualizadoEm >= (curN.atualizadoEm || 0))) await dbPut('nucleos', ln);
  }

  const fotos = cloud.photos.filter(f => f.project_id === projectId);
  let baixadas = 0;
  for (const f of fotos) {
    const cur2 = await dbGet('photos', f.id);
    if (cur2) {
      if ((f.caption || '') !== (cur2.caption || '')) { cur2.caption = f.caption || ''; await dbPut('photos', cur2); }
      continue;
    }
    let res;
    try { res = await fetchT(publicPhotoUrl(f.storage_path), {}, 90000); } catch (e) { continue; }
    if (!res.ok) continue;
    const blob = await res.blob();
    let thumb = blob;
    try { const proc = await processImage(blob); thumb = proc.thumb; } catch (e) { }
    if (f.kind === 'video') {
      /* o vídeo em si fica no Drive; aqui vem a capa e o link */
      await dbPut('photos', {
        id: f.id, kind: 'video', projectId: f.project_id, nucleoId: f.nucleo_id || '', section: f.section || '',
        item: f.item || '', blob: null, poster: blob, thumb, mime: f.mime, size: f.size, duration: f.duration,
        driveFileId: f.drive_file_id || '', w: f.w, h: f.h, caption: f.caption || '',
        ts: Date.parse(f.ts) || Date.now(), syncEm: Date.now()
      });
      baixadas++;
      if (onProgress) onProgress(baixadas, fotos.length);
      continue;
    }
    await dbPut('photos', {
      id: f.id, projectId: f.project_id, nucleoId: f.nucleo_id || '', section: f.section || '',
      item: f.item || '', blob, thumb, w: f.w, h: f.h, caption: f.caption || '',
      ts: Date.parse(f.ts) || Date.now(), syncEm: Date.now()
    });
    baixadas++;
    if (onProgress) onProgress(baixadas, fotos.length);
  }
  return { nucleos: nucleos.length, fotos: baixadas };
}
