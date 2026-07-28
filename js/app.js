'use strict';
/* =========================================================
   Diagnóstico Camelo — aplicação
   Rotas: #/            lista de projetos
          #/p/{pid}     projeto (dados + núcleos)
          #/p/{pid}/n/{nid}  núcleo (formulário por seções)
          #/p/{pid}/relatorio  relatório imprimível (PDF)
   ========================================================= */

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ---------- estado ---------- */
const state = {
  route: null,
  project: null,        // projeto aberto
  nucleo: null,         // núcleo aberto
  photoUrls: new Map(), // photoId -> objectURL (miniatura)
  pendingSaves: new Map(), // chave -> fn de gravação
  saveTimer: null,
  deferredInstall: null
};

/* ---------- util ---------- */
function toast(msg, ms) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms || 2600);
}

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function slug(s) {
  return String(s || 'projeto').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/(^-|-$)/g, '').toLowerCase() || 'projeto';
}

/* ---------- salvamento (auto-save com debounce) ---------- */
function scheduleSave(key, fn) {
  state.pendingSaves.set(key, fn);
  setSaveStatus('saving');
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(flushSaves, 500);
  if (typeof scheduleSync === 'function') scheduleSync();
}

async function flushSaves() {
  clearTimeout(state.saveTimer);
  const jobs = Array.from(state.pendingSaves.values());
  state.pendingSaves.clear();
  if (!jobs.length) return;
  try {
    for (const job of jobs) await job();
    setSaveStatus('saved');
  } catch (e) {
    console.error(e);
    setSaveStatus('error');
    toast('Erro ao salvar. Verifique o espaço do aparelho.');
  }
}

function setSaveStatus(st) {
  const el = $('#saveStatus');
  if (!el) return;
  if (st === 'saving') { el.textContent = 'Salvando…'; el.className = 'save-status saving'; }
  else if (st === 'saved') { el.textContent = '✓ Salvo'; el.className = 'save-status saved'; }
  else if (st === 'error') { el.textContent = '⚠ Erro ao salvar'; el.className = 'save-status error'; }
  else { el.textContent = ''; el.className = 'save-status'; }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSaves();
});
window.addEventListener('pagehide', flushSaves);

function touchProject() {
  if (!state.project) return;
  const p = state.project;
  p.atualizadoEm = Date.now();
  scheduleSave('project:' + p.id, () => dbPut('projects', p));
}

function touchNucleo() {
  if (!state.nucleo) return;
  const n = state.nucleo;
  n.atualizadoEm = Date.now();
  scheduleSave('nucleo:' + n.id, () => dbPut('nucleos', n));
  if (state.project) {
    state.project.atualizadoEm = Date.now();
    scheduleSave('project:' + state.project.id, () => dbPut('projects', state.project));
  }
}

/* ---------- fotos: object URLs ---------- */
function photoUrl(photo, kind) {
  const key = photo.id + (kind === 'full' ? ':full' : ':thumb');
  if (state.photoUrls.has(key)) return state.photoUrls.get(key);
  const url = URL.createObjectURL(kind === 'full' ? photo.blob : (photo.thumb || photo.blob));
  state.photoUrls.set(key, url);
  return url;
}

function clearPhotoUrls() {
  for (const url of state.photoUrls.values()) URL.revokeObjectURL(url);
  state.photoUrls.clear();
}

/* ---------- roteamento ---------- */
window.addEventListener('hashchange', route);

async function route() {
  await flushSaves();
  clearPhotoUrls();
  closeModal();
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  window.scrollTo(0, 0);
  try {
    if (parts[0] === 'p' && parts[1]) {
      const project = await dbGet('projects', parts[1]);
      if (!project) { location.hash = '#/'; return; }
      state.project = project;
      if (parts[2] === 'n' && parts[3]) {
        const nucleo = await dbGet('nucleos', parts[3]);
        if (!nucleo) { location.hash = '#/p/' + project.id; return; }
        state.nucleo = nucleo;
        await renderNucleo();
        return;
      }
      if (parts[2] === 'relatorio') {
        await renderReport();
        return;
      }
      state.nucleo = null;
      await renderProject();
      return;
    }
    if (parts[0] === 'central') {
      state.project = null; state.nucleo = null;
      await renderCentral();
      return;
    }
    state.project = null; state.nucleo = null;
    await renderHome();
  } catch (e) {
    console.error(e);
    $('#view').innerHTML = '<div class="card"><h2>Erro ao carregar</h2><p>' + esc(e.message) + '</p>' +
      '<button class="btn" onclick="location.reload()">Recarregar</button></div>';
  }
}

/* ---------- HOME ---------- */
async function renderHome() {
  document.body.classList.remove('report-mode');
  const projects = (await dbAll('projects')).sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
  const nucleos = await dbAll('nucleos');
  const countByProject = {};
  nucleos.forEach(n => { countByProject[n.projectId] = (countByProject[n.projectId] || 0) + 1; });

  let cards = '';
  for (const p of projects) {
    const nCount = countByProject[p.id] || 0;
    cards += `
    <a class="card project-card" href="#/p/${p.id}">
      <div class="project-card-top">
        <h3>${esc(p.nome)}</h3>
        <span class="chevron">›</span>
      </div>
      <p class="muted">${esc(p.cliente || 'Sem cliente definido')}${p.local ? ' · ' + esc(p.local) : ''}</p>
      <div class="badges">
        <span class="badge">${nCount} núcleo${nCount === 1 ? '' : 's'}</span>
        <span class="badge light">Atualizado ${fmtDate(p.atualizadoEm)}</span>
      </div>
    </a>`;
  }

  const est = await storageEstimate();
  const estHtml = est && est.quota ? `<p class="muted small center">Armazenamento local: ${(est.usage / 1048576).toFixed(1)} MB usados de ${(est.quota / 1073741824).toFixed(1)} GB disponíveis</p>` : '';

  $('#view').innerHTML = `
  <div class="hero">
    <h1>Diagnósticos de campo</h1>
    <p>Crie um projeto por diagnóstico (ex.: MRN, Angola) e um núcleo para cada vila, cidade ou área visitada. Tudo fica salvo neste aparelho, mesmo sem internet.</p>
  </div>
  ${projects.length ? cards : `
    <div class="card empty">
      <p>Nenhum projeto ainda.</p>
      <p class="muted">Toque no botão abaixo para criar o primeiro (ex.: “MRN — Comunidade do Ajudante”).</p>
    </div>`}
  <button class="btn primary big" data-action="novo-projeto">＋ Novo projeto</button>
  <div class="card" id="syncCard"></div>
  <div class="row gap">
    <button class="btn" data-action="importar">📥 Importar backup</button>
    <button class="btn" data-action="ajuda">❔ Como usar</button>
  </div>
  <div id="installArea"></div>
  ${estHtml}
  <input type="file" id="importFile" accept=".json,application/json" hidden>
  `;
  renderInstallButton();
  updateSyncCard();
}

async function updateSyncCard() {
  const el = $('#syncCard');
  if (!el) return;
  let status;
  if (syncState.running) status = '<span class="muted">☁️ Enviando…</span>';
  else if (!navigator.onLine) status = '<span class="muted">📴 Sem internet, dados guardados no aparelho</span>';
  else if (syncState.lastError) status = '<span class="sync-err">⚠ ' + esc(syncState.lastError) + '</span>';
  else if (syncState.lastOk) status = '<span class="sync-ok">✓ Última sincronização: ' + fmtDate(syncState.lastOk) + '</span>';
  else status = '<span class="muted">Ainda não sincronizado</span>';
  let pend = '';
  try {
    const c = await pendingCounts();
    const total = c.projects + c.nucleos + c.photos;
    pend = total ? `<span class="badge">${total} item(ns) a enviar</span>` : '<span class="badge light">nada pendente</span>';
  } catch (e) { }
  el.innerHTML = `
    <div class="project-card-top"><h3>☁️ Nuvem da equipe</h3>${pend}</div>
    <p class="small" style="margin:6px 0 10px">${status}</p>
    <div class="row gap">
      <button class="btn small" data-action="sincronizar" ${syncState.running ? 'disabled' : ''}>☁️ Sincronizar agora</button>
      <a class="btn small accent" href="#/central">🌐 Central da equipe</a>
    </div>`;
}

document.addEventListener('syncchange', updateSyncCard);

/* ---------- CENTRAL (dados de todos os aparelhos) ---------- */
async function renderCentral() {
  document.body.classList.remove('report-mode');
  const code = localStorage.getItem('diagcamelo-central-code');
  if (!code) {
    $('#view').innerHTML = `
    <nav class="crumbs"><a href="#/">‹ Início</a></nav>
    <div class="card">
      <h2 style="margin-top:0">🌐 Central da equipe</h2>
      <p class="muted">Aqui você vê tudo o que a equipe enviou, de todos os aparelhos. Digite o código da equipe para entrar.</p>
      <label class="field"><span class="field-label">Código da equipe</span>
        <input type="text" id="centralCode" autocomplete="off" placeholder="código combinado com a equipe">
      </label>
      <button class="btn primary" data-action="central-entrar">Entrar</button>
    </div>`;
    return;
  }
  $('#view').innerHTML = '<nav class="crumbs"><a href="#/">‹ Início</a></nav><div class="card empty"><p>Consultando a central…</p></div>';
  let cloud;
  try {
    cloud = await fetchPainel(code);
  } catch (e) {
    if (String(e.message).includes('incorreto')) localStorage.removeItem('diagcamelo-central-code');
    $('#view').innerHTML = `<nav class="crumbs"><a href="#/">‹ Início</a></nav>
      <div class="card"><p>⚠ ${esc(e.message)}</p><a class="btn" href="#/central" onclick="setTimeout(route)">Tentar de novo</a></div>`;
    return;
  }
  state._cloud = cloud;
  let cards = '';
  for (const p of cloud.projects) {
    const nucleos = cloud.nucleos.filter(n => n.project_id === p.id);
    const fotos = cloud.photos.filter(f => f.project_id === p.id);
    const thumbs = fotos.slice(0, 8).map(f =>
      `<figure class="thumb"><img loading="lazy" src="${publicPhotoUrl(f.storage_path)}" alt=""></figure>`).join('');
    const nucleoLines = nucleos.map(n => {
      const s2 = (n.dados || {}).s2 || {};
      const extra = [s2.moradores ? s2.moradores + ' moradores' : '', s2.frequentadores ? s2.frequentadores + ' na EAS' : '']
        .filter(Boolean).join(' · ');
      return `<li><strong>${esc(n.nome)}</strong>${extra ? ' <span class="muted small">(' + esc(extra) + ')</span>' : ''}</li>`;
    }).join('');
    cards += `
    <div class="card">
      <div class="project-card-top"><h3>${esc(p.nome)}</h3>
        <span class="badge light">${esc((p.device || '') + (p.sync_em ? ' · ' + fmtDate(Date.parse(p.sync_em)) : ''))}</span></div>
      <p class="muted small">${esc((p.dados || {}).cliente || '')}${(p.dados || {}).local ? ' · ' + esc(p.dados.local) : ''}</p>
      <div class="badges"><span class="badge">${nucleos.length} núcleo(s)</span><span class="badge">${fotos.length} foto(s)</span></div>
      ${nucleoLines ? `<ul class="central-nucleos">${nucleoLines}</ul>` : ''}
      ${thumbs ? `<div class="thumbs">${thumbs}</div>` : ''}
      <button class="btn small" data-action="central-baixar" data-pid="${p.id}">📥 Baixar para este aparelho</button>
    </div>`;
  }
  $('#view').innerHTML = `
  <nav class="crumbs"><a href="#/">‹ Início</a></nav>
  <div class="hero"><h1>🌐 Central da equipe</h1>
    <p>Tudo o que foi sincronizado por todos os aparelhos. Baixe um projeto para ver o conteúdo completo, editar e gerar o PDF.</p></div>
  ${cards || '<div class="card empty"><p class="muted">Nada sincronizado ainda. Assim que a equipe enviar dados, eles aparecem aqui.</p></div>'}
  <button class="btn danger-link" data-action="central-sair">Sair da central</button>`;
}

function renderInstallButton() {
  const area = $('#installArea');
  if (!area) return;
  if (state.deferredInstall) {
    area.innerHTML = '<button class="btn accent" data-action="instalar">📲 Instalar no aparelho (usar offline)</button>';
  } else if (!window.matchMedia('(display-mode: standalone)').matches) {
    area.innerHTML = '<p class="muted small center">Para usar offline: abra o menu do navegador e toque em “Adicionar à tela inicial”.</p>';
  } else {
    area.innerHTML = '';
  }
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  state.deferredInstall = e;
  renderInstallButton();
});

/* ---------- PROJETO ---------- */
async function renderProject() {
  document.body.classList.remove('report-mode');
  const p = state.project;
  const nucleos = (await dbByIndex('nucleos', 'byProject', p.id)).sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));
  const fotosProjeto = await photosOf(null, p.id);

  let fieldsHtml = '';
  for (const f of PROJECT_FIELDS) fieldsHtml += fieldHTML(f, p[f.key], { scope: 'project' });

  let nucleoCards = '';
  for (const n of nucleos) {
    const prog = nucleoProgress(n);
    const done = SECTIONS.filter(s => sectionHasData(s, n.dados)).length;
    nucleoCards += `
    <a class="card nucleo-card" href="#/p/${p.id}/n/${n.id}">
      <div class="project-card-top"><h3>${esc(n.nome)}</h3><span class="chevron">›</span></div>
      <div class="progress-line"><div class="progress-bar"><div class="progress-fill" style="width:${prog}%"></div></div><span class="muted small">${prog}%</span></div>
      <p class="muted small">${done}/${SECTIONS.length} seções com dados · atualizado ${fmtDate(n.atualizadoEm)}</p>
    </a>`;
  }

  $('#view').innerHTML = `
  <nav class="crumbs"><a href="#/">‹ Projetos</a></nav>
  <div class="card">
    <label class="field"><span class="field-label">Nome do projeto</span>
      <input type="text" value="${esc(p.nome)}" data-scope="project" data-key="nome">
    </label>
    ${fieldsHtml}
    ${photoZoneHTML('projeto', '', fotosProjeto, 'Fotos gerais do projeto')}
  </div>

  <h2 class="section-heading">Núcleos <span class="muted">(vilas, cidades, áreas)</span></h2>
  ${nucleoCards || '<div class="card empty"><p class="muted">Nenhum núcleo ainda. Ex.: na MRN, cada vila é um núcleo; em Angola, cada cidade.</p></div>'}
  <button class="btn primary big" data-action="novo-nucleo">＋ Novo núcleo</button>

  <div class="row gap">
    <a class="btn accent" href="#/p/${p.id}/relatorio">📄 Relatório (PDF)</a>
    <button class="btn" data-action="exportar">💾 Backup (.json)</button>
  </div>
  <div class="danger-zone">
    <button class="btn danger-link" data-action="apagar-projeto">Apagar projeto…</button>
  </div>`;
}

/* ---------- NÚCLEO ---------- */
async function renderNucleo() {
  document.body.classList.remove('report-mode');
  const p = state.project, n = state.nucleo;
  const photos = await photosOf(n.id, p.id);
  state._nucleoPhotos = photos;

  let sectionsHtml = '';
  for (let i = 0; i < SECTIONS.length; i++) {
    const sec = SECTIONS[i];
    const has = sectionHasData(sec, n.dados) || photos.some(ph => ph.section === sec.id);
    sectionsHtml += `
    <details class="card section" id="sec-${sec.id}" data-secid="${sec.id}" ${i === 0 ? 'open' : ''}>
      <summary><span class="sec-emoji">${sec.emoji}</span><span class="sec-title">${esc(sec.title)}</span>
        <span class="sec-check ${has ? 'on' : ''}">${has ? '✓' : ''}</span></summary>
      <div class="section-body">${sectionBodyHTML(sec)}</div>
    </details>`;
  }

  const prog = nucleoProgress(n);
  $('#view').innerHTML = `
  <nav class="crumbs"><a href="#/p/${p.id}">‹ ${esc(p.nome)}</a></nav>
  <div class="nucleo-head card">
    <label class="field"><span class="field-label">Nome do núcleo</span>
      <input type="text" value="${esc(n.nome)}" data-scope="nucleo-nome">
    </label>
    <div class="progress-line"><div class="progress-bar"><div class="progress-fill" style="width:${prog}%"></div></div><span class="muted small" id="progText">${prog}%</span></div>
  </div>
  ${sectionsHtml}
  <div class="danger-zone">
    <button class="btn danger-link" data-action="apagar-nucleo">Apagar núcleo…</button>
  </div>`;
}

function sectionBodyHTML(sec) {
  const n = state.nucleo;
  const dados = n.dados[sec.id] || {};
  if (sec.isArray) {
    const items = dados[sec.arrayKey] || [];
    let html = '';
    items.forEach((item, idx) => {
      let fh = '';
      for (const f of sec.itemFields) {
        if (!condSatisfied(f.conditional, item)) continue;
        fh += fieldHTML(f, item[f.key], { scope: 'nucleo', sec: sec.id, item: item.id });
      }
      const itemPhotos = (state._nucleoPhotos || []).filter(ph => ph.section === sec.id && ph.item === item.id);
      html += `
      <div class="array-item" data-item="${item.id}">
        <div class="array-item-head"><strong>${esc(sec.itemLabel)} ${idx + 1}</strong>
          <button class="btn small danger-link" data-action="remover-item" data-sec="${sec.id}" data-item="${item.id}">Remover</button>
        </div>
        ${fh}
        ${photoZoneHTML(sec.id, item.id, itemPhotos, 'Fotos desta fonte')}
      </div>`;
    });
    html += `<button class="btn" data-action="add-item" data-sec="${sec.id}">＋ Adicionar ${esc(sec.itemLabel.toLowerCase())}</button>`;
    return html;
  }
  let html = '';
  for (const f of sec.fields) {
    if (!condSatisfied(f.conditional, dados)) continue;
    html += fieldHTML(f, dados[f.key], { scope: 'nucleo', sec: sec.id });
  }
  const secPhotos = (state._nucleoPhotos || []).filter(ph => ph.section === sec.id && !ph.item);
  html += photoZoneHTML(sec.id, '', secPhotos, 'Fotos desta seção');
  return html;
}

/* ---------- renderização de campos ---------- */
function fieldHTML(f, val, ctx) {
  const dataAttrs = `data-scope="${ctx.scope}" data-key="${f.key}"` +
    (ctx.sec ? ` data-sec="${ctx.sec}"` : '') + (ctx.item ? ` data-item="${ctx.item}"` : '');
  const req = f.required ? ' <em class="req">*</em>' : '';
  const label = `<span class="field-label">${esc(f.label)}${req}</span>`;

  if (f.type === 'textarea') {
    return `<label class="field">${label}<textarea rows="${f.rows || 2}" placeholder="${esc(f.placeholder || '')}" ${dataAttrs}>${esc(val)}</textarea></label>`;
  }
  if (f.type === 'radio' || f.type === 'checkbox') {
    const cur = f.type === 'checkbox' ? (Array.isArray(val) ? val : []) : val;
    let pills = '';
    for (const opt of f.options) {
      const on = f.type === 'checkbox' ? cur.includes(opt) : cur === opt;
      pills += `<button type="button" class="pill ${on ? 'on' : ''}" data-pill="${f.type}" data-value="${esc(opt)}" ${dataAttrs}>${esc(opt)}</button>`;
    }
    return `<div class="field"><span class="field-label">${esc(f.label)}${req}</span><div class="pills">${pills}</div></div>`;
  }
  if (f.type === 'gps') {
    return `<div class="field">${label}
      <div class="gps-row">
        <input type="text" inputmode="decimal" placeholder="latitude, longitude" value="${esc(val)}" ${dataAttrs}>
        <button type="button" class="btn small" data-action="gps" data-sec="${ctx.sec || ''}" data-item="${ctx.item || ''}" data-key="${f.key}" data-gscope="${ctx.scope}">🛰️ Capturar</button>
      </div>
    </div>`;
  }
  const type = f.type === 'number' ? 'number' : 'text';
  const unit = f.unit ? `<span class="unit">${esc(f.unit)}</span>` : '';
  const inputmode = f.type === 'number' ? ' inputmode="decimal" step="any"' : '';
  return `<label class="field">${label}
    <span class="input-wrap"><input type="${type}"${inputmode} placeholder="${esc(f.placeholder || '')}" value="${esc(val)}" ${dataAttrs}>${unit}</span>
  </label>`;
}

function photoZoneHTML(sectionId, itemId, photos, title) {
  let thumbs = '';
  for (const ph of photos) {
    thumbs += `<figure class="thumb" data-action="ver-foto" data-photo="${ph.id}">
      <img src="${photoUrl(ph, 'thumb')}" alt="">
      ${ph.caption ? `<figcaption>${esc(ph.caption)}</figcaption>` : ''}
    </figure>`;
  }
  return `
  <div class="photozone" data-psec="${sectionId}" data-pitem="${itemId || ''}">
    <span class="field-label">${esc(title || 'Fotos')} <span class="muted">(${photos.length})</span></span>
    <div class="thumbs">${thumbs}</div>
    <div class="row gap">
      <label class="btn small">📷 Tirar foto<input type="file" accept="image/*" capture="environment" data-photoinput hidden></label>
      <label class="btn small">🖼️ Galeria<input type="file" accept="image/*" multiple data-photoinput hidden></label>
    </div>
  </div>`;
}

/* ---------- escrita no modelo ---------- */
function getSectionData(secId) {
  const n = state.nucleo;
  if (!n.dados[secId]) n.dados[secId] = {};
  return n.dados[secId];
}

function findArrayItem(secId, itemId) {
  const sec = sectionById(secId);
  const data = getSectionData(secId);
  const items = data[sec.arrayKey] || [];
  return items.find(it => it.id === itemId);
}

function setFieldValue(el, value) {
  const scope = el.dataset.scope;
  const key = el.dataset.key;
  if (scope === 'project') {
    state.project[key] = value;
    touchProject();
    return;
  }
  const secId = el.dataset.sec;
  const itemId = el.dataset.item;
  const target = itemId ? findArrayItem(secId, itemId) : getSectionData(secId);
  if (!target) return;
  target[key] = value;
  touchNucleo();
  updateSectionCheck(secId);
  updateProgressLine();
  maybeRerenderSection(secId, itemId, key);
}

function updateSectionCheck(secId) {
  const sec = sectionById(secId);
  const det = $('#sec-' + secId);
  if (!sec || !det) return;
  const has = sectionHasData(sec, state.nucleo.dados) ||
    (state._nucleoPhotos || []).some(ph => ph.section === secId);
  const chk = det.querySelector('.sec-check');
  chk.classList.toggle('on', has);
  chk.textContent = has ? '✓' : '';
}

function updateProgressLine() {
  const el = $('#progText');
  if (!el || !state.nucleo) return;
  const prog = nucleoProgress(state.nucleo);
  el.textContent = prog + '%';
  const fill = $('.nucleo-head .progress-fill');
  if (fill) fill.style.width = prog + '%';
}

/* re-renderiza a seção quando o campo alterado controla condicionais */
function maybeRerenderSection(secId, itemId, changedKey) {
  const sec = sectionById(secId);
  if (!sec) return;
  const fields = sectionFields(sec);
  const isController = fields.some(f => f.conditional && f.conditional.field === changedKey);
  if (!isController) return;
  const det = $('#sec-' + secId);
  if (det) det.querySelector('.section-body').innerHTML = sectionBodyHTML(sec);
}

/* ---------- eventos ---------- */
document.addEventListener('input', e => {
  const el = e.target;
  if (el.matches('#modal input, #modal textarea')) return;
  if (el.dataset && el.dataset.scope === 'nucleo-nome') {
    state.nucleo.nome = el.value.trim() || 'Núcleo sem nome';
    touchNucleo();
    return;
  }
  if (el.dataset && el.dataset.scope && el.dataset.key && !el.dataset.pill) {
    const value = el.value;
    if (el.dataset.scope === 'project' && el.dataset.key === 'nome') {
      state.project.nome = value.trim() || 'Projeto sem nome';
      touchProject();
      return;
    }
    setFieldValue(el, value);
  }
});

document.addEventListener('click', async e => {
  const pill = e.target.closest('[data-pill]');
  if (pill) {
    const kind = pill.dataset.pill;
    if (kind === 'radio') {
      const was = pill.classList.contains('on');
      pill.parentElement.querySelectorAll('.pill').forEach(b => b.classList.remove('on'));
      if (!was) pill.classList.add('on');
      setFieldValue(pill, was ? '' : pill.dataset.value);
    } else {
      pill.classList.toggle('on');
      const values = Array.from(pill.parentElement.querySelectorAll('.pill.on')).map(b => b.dataset.value);
      setFieldValue(pill, values);
    }
    return;
  }

  const act = e.target.closest('[data-action]');
  if (!act) return;
  const action = act.dataset.action;

  if (action === 'novo-projeto') {
    promptModal('Novo projeto', 'Nome do projeto', 'Ex.: MRN — Comunidade do Ajudante', async nome => {
      const p = { id: newId(), nome, criadoEm: Date.now(), atualizadoEm: Date.now() };
      await dbPut('projects', p);
      requestPersistentStorage();
      location.hash = '#/p/' + p.id;
    });
  }
  else if (action === 'novo-nucleo') {
    promptModal('Novo núcleo', 'Nome do núcleo', 'Ex.: Vila 1, Lucira, Aldeia Trocará', async nome => {
      const n = { id: newId(), projectId: state.project.id, nome, dados: {}, criadoEm: Date.now(), atualizadoEm: Date.now() };
      await dbPut('nucleos', n);
      location.hash = '#/p/' + state.project.id + '/n/' + n.id;
    });
  }
  else if (action === 'add-item') {
    const sec = sectionById(act.dataset.sec);
    const data = getSectionData(sec.id);
    if (!data[sec.arrayKey]) data[sec.arrayKey] = [];
    data[sec.arrayKey].push({ id: newId() });
    touchNucleo();
    $('#sec-' + sec.id).querySelector('.section-body').innerHTML = sectionBodyHTML(sec);
  }
  else if (action === 'remover-item') {
    if (!confirm('Remover esta fonte e suas informações? As fotos dela também serão apagadas.')) return;
    const sec = sectionById(act.dataset.sec);
    const data = getSectionData(sec.id);
    data[sec.arrayKey] = (data[sec.arrayKey] || []).filter(it => it.id !== act.dataset.item);
    touchNucleo();
    const dead = (state._nucleoPhotos || []).filter(ph => ph.section === sec.id && ph.item === act.dataset.item);
    for (const ph of dead) await dbDel('photos', ph.id);
    state._nucleoPhotos = (state._nucleoPhotos || []).filter(ph => !(ph.section === sec.id && ph.item === act.dataset.item));
    $('#sec-' + sec.id).querySelector('.section-body').innerHTML = sectionBodyHTML(sec);
    updateSectionCheck(sec.id);
  }
  else if (action === 'gps') {
    captureGPS(act);
  }
  else if (action === 'ver-foto') {
    openPhotoModal(act.dataset.photo);
  }
  else if (action === 'exportar') {
    exportBackup();
  }
  else if (action === 'sincronizar') {
    await flushSaves();
    syncNow(true).then(updateSyncCard);
  }
  else if (action === 'central-entrar') {
    const code = ($('#centralCode').value || '').trim();
    if (!code) { $('#centralCode').focus(); return; }
    localStorage.setItem('diagcamelo-central-code', code);
    renderCentral();
  }
  else if (action === 'central-sair') {
    localStorage.removeItem('diagcamelo-central-code');
    location.hash = '#/';
  }
  else if (action === 'central-baixar') {
    const pid = act.dataset.pid;
    act.disabled = true;
    act.textContent = '⏳ Baixando…';
    try {
      const res = await downloadCloudProject(state._cloud, pid, (i, n) => { act.textContent = `⏳ Baixando fotos ${i}/${n}…`; });
      toast(`Projeto baixado: ${res.nucleos} núcleo(s), ${res.fotos} foto(s) ✓`, 4000);
      location.hash = '#/p/' + pid;
    } catch (e) {
      console.error(e);
      act.disabled = false;
      act.textContent = '📥 Baixar para este aparelho';
      toast('Falha ao baixar: ' + e.message, 4000);
    }
  }
  else if (action === 'importar') {
    $('#importFile').click();
  }
  else if (action === 'ajuda') {
    helpModal();
  }
  else if (action === 'instalar') {
    if (state.deferredInstall) {
      state.deferredInstall.prompt();
      state.deferredInstall = null;
      renderInstallButton();
    }
  }
  else if (action === 'apagar-projeto') {
    const p = state.project;
    if (!confirm(`Apagar o projeto “${p.nome}” com todos os núcleos e fotos?\n\nEssa ação não pode ser desfeita. Considere exportar um backup antes.`)) return;
    if (!confirm('Tem certeza? Digite OK para confirmar a exclusão definitiva.')) return;
    const nucleos = await dbByIndex('nucleos', 'byProject', p.id);
    for (const n of nucleos) await dbDel('nucleos', n.id);
    const photos = await dbByIndex('photos', 'byProject', p.id);
    for (const ph of photos) await dbDel('photos', ph.id);
    await dbDel('projects', p.id);
    toast('Projeto apagado.');
    location.hash = '#/';
  }
  else if (action === 'apagar-nucleo') {
    const n = state.nucleo;
    if (!confirm(`Apagar o núcleo “${n.nome}” com todas as informações e fotos?`)) return;
    const photos = await dbByIndex('photos', 'byNucleo', n.id);
    for (const ph of photos) await dbDel('photos', ph.id);
    await dbDel('nucleos', n.id);
    toast('Núcleo apagado.');
    location.hash = '#/p/' + state.project.id;
  }
  else if (action === 'imprimir') {
    window.print();
  }
});

document.addEventListener('change', async e => {
  const el = e.target;
  if (el.matches('[data-photoinput]')) {
    const zone = el.closest('.photozone');
    const files = Array.from(el.files || []);
    el.value = '';
    if (!files.length) return;
    toast(`Processando ${files.length} foto${files.length > 1 ? 's' : ''}…`);
    const secId = zone.dataset.psec;
    const itemId = zone.dataset.pitem;
    const nucleoId = state.nucleo ? state.nucleo.id : '';
    try {
      for (const file of files) {
        const ph = await savePhoto(state.project.id, nucleoId, secId, itemId, file);
        if (state._nucleoPhotos) state._nucleoPhotos.push(ph);
        const fig = document.createElement('figure');
        fig.className = 'thumb';
        fig.dataset.action = 'ver-foto';
        fig.dataset.photo = ph.id;
        fig.innerHTML = `<img src="${photoUrl(ph, 'thumb')}" alt="">`;
        zone.querySelector('.thumbs').appendChild(fig);
      }
      const label = zone.querySelector('.field-label .muted');
      if (label) label.textContent = '(' + zone.querySelectorAll('.thumb').length + ')';
      if (secId && secId !== 'projeto') updateSectionCheck(secId);
      touchNucleo();
      toast('Foto(s) salva(s) ✓');
    } catch (err) {
      console.error(err);
      toast('Erro ao salvar foto: ' + err.message);
    }
    return;
  }
  if (el.id === 'importFile') {
    const file = el.files && el.files[0];
    el.value = '';
    if (!file) return;
    try {
      toast('Importando backup…');
      const payload = JSON.parse(await file.text());
      const res = await importProjectJSON(payload);
      toast(`Backup importado: ${res.nucleos} núcleo(s), ${res.fotos} foto(s) nova(s) ✓`, 4000);
      route();
    } catch (err) {
      console.error(err);
      alert('Não foi possível importar: ' + err.message);
    }
  }
});

/* ---------- GPS ---------- */
function captureGPS(btn) {
  if (!navigator.geolocation) { toast('GPS não disponível neste navegador.'); return; }
  const original = btn.textContent;
  btn.textContent = '⏳ Obtendo…';
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude, accuracy } = pos.coords;
    const value = latitude.toFixed(6) + ', ' + longitude.toFixed(6);
    const input = btn.parentElement.querySelector('input');
    input.value = value;
    setFieldValue(input, value);
    btn.textContent = original;
    btn.disabled = false;
    toast(`GPS capturado (precisão ±${Math.round(accuracy)} m)`);
  }, err => {
    btn.textContent = original;
    btn.disabled = false;
    toast('Não foi possível obter o GPS: ' + err.message);
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
}

/* ---------- modais ---------- */
function openModal(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="modal-box">${html}</div>`;
  m.classList.add('open');
}
function closeModal() {
  const m = $('#modal');
  if (m) { m.classList.remove('open'); m.innerHTML = ''; }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
document.addEventListener('click', e => {
  if (e.target.id === 'modal') closeModal();
  if (e.target.closest('[data-action="fechar-modal"]')) closeModal();
});

function promptModal(title, label, placeholder, onOk) {
  openModal(`
    <h3>${esc(title)}</h3>
    <label class="field"><span class="field-label">${esc(label)}</span>
      <input type="text" id="promptInput" placeholder="${esc(placeholder)}" autocomplete="off">
    </label>
    <div class="row gap right">
      <button class="btn" data-action="fechar-modal">Cancelar</button>
      <button class="btn primary" id="promptOk">Criar</button>
    </div>`);
  const input = $('#promptInput');
  input.focus();
  const go = () => {
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    closeModal();
    onOk(v);
  };
  $('#promptOk').addEventListener('click', go);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}

async function openPhotoModal(photoId) {
  const ph = await dbGet('photos', photoId);
  if (!ph) return;
  const url = photoUrl(ph, 'full');
  openModal(`
    <div class="photo-view">
      <img src="${url}" alt="">
      <label class="field"><span class="field-label">Legenda</span>
        <input type="text" id="captionInput" value="${esc(ph.caption)}" placeholder="Ex.: Cacimba da casa do seu Maneco">
      </label>
      <div class="row gap right">
        <button class="btn danger-link" id="delPhoto">🗑 Apagar foto</button>
        <button class="btn primary" data-action="fechar-modal">Fechar</button>
      </div>
    </div>`);
  $('#captionInput').addEventListener('input', e => {
    ph.caption = e.target.value;
    ph.atualizadoEm = Date.now();
    scheduleSave('photo:' + ph.id, () => dbPut('photos', ph));
    const fig = document.querySelector(`.thumb[data-photo="${ph.id}"]`);
    if (fig) {
      let cap = fig.querySelector('figcaption');
      if (!cap && ph.caption) { cap = document.createElement('figcaption'); fig.appendChild(cap); }
      if (cap) cap.textContent = ph.caption;
    }
  });
  $('#delPhoto').addEventListener('click', async () => {
    if (!confirm('Apagar esta foto?')) return;
    await dbDel('photos', ph.id);
    state._nucleoPhotos = (state._nucleoPhotos || []).filter(x => x.id !== ph.id);
    const fig = document.querySelector(`.thumb[data-photo="${ph.id}"]`);
    if (fig) fig.remove();
    if (ph.section && ph.section !== 'projeto') updateSectionCheck(ph.section);
    closeModal();
    toast('Foto apagada.');
  });
}

function helpModal() {
  openModal(`
    <h3>Como usar</h3>
    <ol class="help">
      <li><strong>Instale no celular:</strong> abra este site com internet uma vez e use “Adicionar à tela inicial”. Depois disso, funciona 100% offline (MRN, Angola, qualquer lugar).</li>
      <li><strong>Crie um projeto</strong> para cada diagnóstico (ex.: MRN, Pumangol) e <strong>um núcleo</strong> para cada vila/cidade.</li>
      <li><strong>Preencha as seções</strong> tocando nelas. Tudo salva sozinho a cada toque, pode fechar e voltar depois.</li>
      <li><strong>Fotos:</strong> em cada seção, use “Tirar foto” (câmera) ou “Galeria”. Toque na foto para dar legenda ou apagar.</li>
      <li><strong>GPS:</strong> o botão “Capturar” pega as coordenadas mesmo sem internet (o GPS do celular não precisa de sinal).</li>
      <li><strong>Ao voltar do campo:</strong> no projeto, toque em “Backup (.json)” e envie o arquivo (WhatsApp, e-mail, Drive). Quem receber importa em “Importar backup” e vê tudo, incluindo fotos.</li>
      <li><strong>PDF:</strong> “Relatório (PDF)” gera o documento completo com fotos e notas; toque em “Salvar como PDF”.</li>
    </ol>
    <p class="muted small">Os dados ficam salvos neste aparelho. Backup regularmente para não depender de um único celular.</p>
    <div class="row right"><button class="btn primary" data-action="fechar-modal">Entendi</button></div>`);
}

/* ---------- backup ---------- */
async function exportBackup() {
  try {
    toast('Gerando backup…');
    await flushSaves();
    const payload = await exportProjectJSON(state.project.id);
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const name = 'diagnostico-' + slug(state.project.nome) + '-' + new Date().toISOString().slice(0, 10) + '.json';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    toast('Backup gerado: ' + name, 4000);
  } catch (e) {
    console.error(e);
    alert('Erro ao gerar backup: ' + e.message);
  }
}

/* ---------- service worker / inicialização ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Nova versão disponível. Feche e reabra o app para atualizar.', 5000);
          }
        });
      });
    }).catch(() => { });
  });
}

route();
