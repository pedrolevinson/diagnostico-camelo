'use strict';
/* =========================================================
   Diagnóstico Camelo — relatório imprimível
   Gera uma visualização completa do projeto (campos, notas
   e fotos com legenda). O botão "Salvar como PDF" usa a
   impressão nativa do navegador — funciona offline, no
   celular e no computador.
   ========================================================= */

let _figCounter = 0;

async function renderReport() {
  document.body.classList.add('report-mode');
  const p = state.project;
  _figCounter = 0;

  const nucleos = (await dbByIndex('nucleos', 'byProject', p.id)).sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));
  const allPhotos = (await dbByIndex('photos', 'byProject', p.id)).sort((a, b) => a.ts - b.ts);
  const projectPhotos = allPhotos.filter(ph => !ph.nucleoId);
  const sc = scopeOf(p);

  let infoRows = `<tr><th>Escopo do diagnóstico</th><td>${esc(sc.aba)}</td></tr>`;
  for (const f of sc.projectFields) {
    if (!isFilled(p[f.key])) continue;
    infoRows += `<tr><th>${esc(f.label)}</th><td>${esc(p[f.key])}</td></tr>`;
  }

  let nucleosHtml = '';
  for (const n of nucleos) {
    nucleosHtml += nucleoReportHTML(n, allPhotos.filter(ph => ph.nucleoId === n.id), sc);
  }

  const hoje = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

  $('#view').innerHTML = `
  <div class="report-toolbar no-print">
    <a class="btn" href="#/p/${p.id}">‹ Voltar</a>
    <button class="btn primary" data-action="baixar-pdf">📄 Baixar PDF</button>
    <button class="btn" data-action="imprimir">🖨️ Imprimir</button>
  </div>

  <article class="report">
    <header class="report-cover">
      <div class="report-brand">ÁGUA CAMELO</div>
      <h1>Relatório de Diagnóstico de Campo</h1>
      <h2>${esc(p.nome)}</h2>
      <p class="report-date">${hoje}</p>
    </header>

    ${infoRows ? `<section class="report-block">
      <h3>Informações do projeto</h3>
      <table class="report-table">${infoRows}</table>
    </section>` : ''}

    ${figuresHTML(projectPhotos, 'Registro fotográfico geral')}

    ${nucleos.length ? `<section class="report-block">
      <h3>${esc(sc.visitados)}</h3>
      <table class="report-table">
        <tr><th>${esc(sc.Unidade)}</th>${sc.resumo.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr>
        ${nucleos.map(n => `<tr><td>${esc(n.nome)}</td>${sc.resumo.map(c => { const v = c.get(n.dados || {}); return `<td>${esc(isFilled(v) ? v : '—')}</td>`; }).join('')}</tr>`).join('')}
      </table>
    </section>` : `<p class="muted">${esc(sc.nenhum)}</p>`}

    ${nucleosHtml}

    <footer class="report-footer">
      Água Camelo · aguacamelo.com.br · Relatório gerado pela plataforma Diagnóstico Camelo em ${hoje}
    </footer>
  </article>`;
}

function nucleoReportHTML(n, photos, sc) {
  let html = `<section class="report-nucleo"><h2 class="nucleo-title">${esc(sc.Unidade)}: ${esc(n.nome)}</h2>`;
  const alertas = alertasDe(n.dados, sc.sections);
  if (alertas.length) html += `<div class="report-block alertas"><strong>⚠ Pontos de atenção</strong><ul>${alertas.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>`;
  for (const sec of sc.sections) {
    const secPhotos = photos.filter(ph => ph.section === sec.id);
    if (!sectionHasData(sec, n.dados) && secPhotos.length === 0) continue;
    html += `<div class="report-block"><h3>${sec.emoji} ${esc(sec.title)}</h3>`;
    const data = (n.dados || {})[sec.id] || {};
    if (sec.isArray) {
      const items = data[sec.arrayKey] || [];
      items.forEach((item, idx) => {
        const rows = fieldRowsHTML(sec.itemFields, item);
        const itemPhotos = secPhotos.filter(ph => ph.item === item.id);
        if (!rows && itemPhotos.length === 0) return;
        html += `<h4>${esc(sec.itemLabel)} ${idx + 1}${item.nome ? ' — ' + esc(item.nome) : ''}</h4>`;
        if (rows) html += `<table class="report-table">${rows}</table>`;
        html += figuresHTML(itemPhotos, '');
      });
      const orfas = secPhotos.filter(ph => !ph.item || !items.some(it => it.id === ph.item));
      html += figuresHTML(orfas, '');
    } else {
      const rows = fieldRowsHTML(sec.fields, data);
      if (rows) html += `<table class="report-table">${rows}</table>`;
      html += figuresHTML(secPhotos, '');
    }
    html += '</div>';
  }
  html += '</section>';
  return html;
}

function fieldRowsHTML(fields, data) {
  let rows = '';
  for (const f of fields) {
    const v = data[f.key];
    if (!isFilled(v)) continue;
    let out = Array.isArray(v) ? v.join(', ') : String(v);
    if (f.unit && !Array.isArray(v)) out += ' ' + f.unit;
    rows += `<tr><th>${esc(f.label)}</th><td>${esc(out)}</td></tr>`;
  }
  return rows;
}

function figuresHTML(photos, title) {
  if (!photos || !photos.length) return '';
  let figs = '';
  for (const ph of photos) {
    _figCounter++;
    const vid = isVideo(ph);
    const link = vid && ph.driveFileId ? ` <a href="${driveLink(ph.driveFileId)}" target="_blank" rel="noopener">Assistir no Google Drive</a>` : '';
    figs += `<figure class="report-fig">
      <img src="${photoUrl(ph, 'full')}" alt="">
      <figcaption>Figura ${_figCounter}${vid ? ' (vídeo' + (ph.duration ? ', ' + fmtDuration(ph.duration) : '') + ')' : ''}${ph.caption ? ' — ' + esc(ph.caption) : ''}${link}</figcaption>
    </figure>`;
  }
  return `<div class="report-figs">${title ? `<h3>${esc(title)}</h3>` : ''}<div class="fig-grid">${figs}</div></div>`;
}
