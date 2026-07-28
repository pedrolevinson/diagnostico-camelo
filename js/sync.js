'use strict';
/* =========================================================
   Diagnóstico Camelo — sincronização com a nuvem (Supabase)

   Fluxo: tudo continua salvo primeiro no aparelho (IndexedDB).
   Quando há internet, os registros alterados desde a última
   sincronização sobem sozinhos: fotos para o Storage e
   dados via RPC sync_up (última escrita vence, por registro).
   As leituras da nuvem (Central) exigem o código da equipe.
   ========================================================= */

const syncState = {
  running: false,
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

async function pendingCounts() {
  const [projects, nucleos, photos] = await Promise.all([
    dbAll('projects'), dbAll('nucleos'), dbAll('photos')
  ]);
  return {
    projects: projects.filter(_isDirty).length,
    nucleos: nucleos.filter(_isDirty).length,
    photos: photos.filter(p => !p.syncEm || (p.atualizadoEm || 0) > p.syncEm).length
  };
}

/* ---------- envio ---------- */
async function syncNow(manual) {
  if (syncState.running) return { ok: false, reason: 'já sincronizando' };
  if (!navigator.onLine) {
    if (manual) toast('Sem internet agora. Vai sincronizar sozinho quando conectar.');
    _notifySync();
    return { ok: false, reason: 'offline' };
  }
  syncState.running = true;
  syncState.lastError = null;
  _notifySync();
  try {
    const [projects, nucleos, photos] = await Promise.all([
      dbAll('projects'), dbAll('nucleos'), dbAll('photos')
    ]);
    const dirtyP = projects.filter(_isDirty);
    const dirtyN = nucleos.filter(_isDirty);
    const dirtyF = photos.filter(p => !p.syncEm || (p.atualizadoEm || 0) > p.syncEm);
    if (!dirtyP.length && !dirtyN.length && !dirtyF.length) {
      syncState.lastOk = Date.now();
      localStorage.setItem('diagcamelo-sync-last', String(syncState.lastOk));
      if (manual) toast('Tudo já sincronizado ✓');
      return { ok: true, enviados: 0 };
    }

    /* 1. sobe os blobs das fotos */
    const fotosOk = [];
    for (const ph of dirtyF) {
      const path = photoStoragePath(ph);
      const res = await fetch(CONFIG.supabaseUrl + '/storage/v1/object/fotos/' + path, {
        method: 'POST',
        headers: Object.assign(_sbHeaders(false), { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }),
        body: ph.blob
      });
      if (!res.ok) throw new Error('upload de foto falhou (' + res.status + ')');
      fotosOk.push(ph);
    }

    /* 2. sobe os dados num único RPC */
    const device = deviceName();
    const payload = {
      projects: dirtyP.map(p => {
        const dados = {};
        PROJECT_FIELDS.forEach(f => { if (isFilled(p[f.key])) dados[f.key] = p[f.key]; });
        return { id: p.id, nome: p.nome || '', dados, criado_em: isoOrNull(p.criadoEm), atualizado_em: isoOrNull(p.atualizadoEm), device };
      }),
      nucleos: dirtyN.map(n => ({
        id: n.id, project_id: n.projectId, nome: n.nome || '', dados: n.dados || {},
        criado_em: isoOrNull(n.criadoEm), atualizado_em: isoOrNull(n.atualizadoEm), device
      })),
      photos: fotosOk.map(ph => ({
        id: ph.id, project_id: ph.projectId, nucleo_id: ph.nucleoId || '',
        section: ph.section || '', item: ph.item || '', caption: ph.caption || '',
        w: ph.w, h: ph.h, ts: isoOrNull(ph.ts), storage_path: photoStoragePath(ph), device
      }))
    };
    const res = await fetch(CONFIG.supabaseUrl + '/rest/v1/rpc/sync_up', {
      method: 'POST', headers: _sbHeaders(true), body: JSON.stringify({ payload })
    });
    if (!res.ok) throw new Error('envio de dados falhou (' + res.status + ')');

    /* 3. marca como sincronizado (preservando edições feitas durante o envio) */
    for (const p of dirtyP) { p.syncEm = p.atualizadoEm || Date.now(); await dbPut('projects', p); }
    for (const n of dirtyN) { n.syncEm = n.atualizadoEm || Date.now(); await dbPut('nucleos', n); }
    for (const ph of fotosOk) { ph.syncEm = Math.max(ph.atualizadoEm || 0, Date.now()); await dbPut('photos', ph); }

    syncState.lastOk = Date.now();
    localStorage.setItem('diagcamelo-sync-last', String(syncState.lastOk));
    const total = dirtyP.length + dirtyN.length + fotosOk.length;
    if (fotosOk.length) triggerDriveMirror();
    if (manual) toast('Sincronizado: ' + total + ' item(ns) enviados ✓');
    return { ok: true, enviados: total };
  } catch (e) {
    console.error('sync:', e);
    syncState.lastError = e.message;
    if (manual) toast('Falha na sincronização: ' + e.message, 4000);
    return { ok: false, reason: e.message };
  } finally {
    syncState.running = false;
    _notifySync();
  }
}

function _notifySync() {
  document.dispatchEvent(new CustomEvent('syncchange'));
}

/* avisa o robô do espelho no Drive (fire-and-forget; roda no servidor) */
function triggerDriveMirror() {
  try {
    fetch('https://diagnostico-camelo.vercel.app/api/drive-mirror', { method: 'POST', mode: 'cors' })
      .catch(() => { });
  } catch (e) { }
}

/* dispara sozinho: ao abrir, ao voltar a internet e pouco depois de cada edição */
let _syncDebounce = null;
function scheduleSync() {
  clearTimeout(_syncDebounce);
  _syncDebounce = setTimeout(() => syncNow(false), 12000);
}
window.addEventListener('online', () => syncNow(false));
setTimeout(() => syncNow(false), 3500);

/* ---------- Central (leitura da nuvem com código da equipe) ---------- */
async function fetchPainel(code) {
  const res = await fetch(CONFIG.supabaseUrl + '/rest/v1/rpc/painel', {
    method: 'POST', headers: _sbHeaders(true), body: JSON.stringify({ code })
  });
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
    const res = await fetch(publicPhotoUrl(f.storage_path));
    if (!res.ok) continue;
    const blob = await res.blob();
    let thumb = blob;
    try { const proc = await processImage(blob); thumb = proc.thumb; } catch (e) { }
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
