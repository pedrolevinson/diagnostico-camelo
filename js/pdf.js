'use strict';
/* =========================================================
   Diagnóstico Camelo — PDF gerado no próprio aparelho
   Monta o arquivo com jsPDF (guardado no app, funciona offline)
   e entrega por "Compartilhar" no celular ou download no
   computador. Não depende do window.print(), que falha no
   iPhone com o app instalado na tela inicial.
   ========================================================= */

const PDF = { W: 210, H: 297, M: 16, LINE: 4.6 };
PDF.CW = PDF.W - 2 * PDF.M;

/* as fontes padrão do PDF só têm o alfabeto latino (cp1252):
   emojis e símbolos fora dele saem do texto */
const _CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function pdfText(s) {
  let out = '';
  for (const ch of String(s == null ? '' : s)) {
    const c = ch.codePointAt(0);
    if (c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || _CP1252_EXTRA.includes(ch)) out += ch;
    else if (c === 9) out += ' ';
  }
  return out.replace(/ {2,}/g, ' ').trim();
}

async function _blobBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

async function buildReportPDF(projectId, onProgress) {
  if (!window.jspdf) throw new Error('biblioteca de PDF não carregou; abra o app uma vez com internet');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const p = await dbGet('projects', projectId);
  const nucleos = (await dbByIndex('nucleos', 'byProject', projectId)).sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));
  const all = (await dbByIndex('photos', 'byProject', projectId)).sort((a, b) => a.ts - b.ts);
  const totalImgs = all.length;
  let imgsFeitas = 0, fig = 0;
  let y = PDF.M;

  const ensure = h => { if (y + h > PDF.H - PDF.M - 8) { doc.addPage(); y = PDF.M; return true; } return false; };

  const heading = (txt, size, bar) => {
    ensure(size * 0.6 + 8);
    y += 3;
    if (bar) { doc.setFillColor(0, 194, 222); doc.rect(PDF.M, y - 4.2, 1.6, 6, 'F'); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(size); doc.setTextColor(10, 10, 10);
    const lines = doc.splitTextToSize(pdfText(txt), PDF.CW - (bar ? 4 : 0));
    doc.text(lines, PDF.M + (bar ? 4 : 0), y);
    y += lines.length * size * 0.42 + 3;
  };

  /* tabela rótulo | valor, com quebra de página no meio de texto longo */
  const kvTable = rows => {
    const LW = 58, VW = PDF.CW - LW, pad = 2;
    doc.setFontSize(9.5);
    for (const [label, value] of rows) {
      doc.setFont('helvetica', 'bold');
      const ll = doc.splitTextToSize(pdfText(label), LW - 2 * pad);
      doc.setFont('helvetica', 'normal');
      let vl = doc.splitTextToSize(pdfText(value), VW - 2 * pad);
      let first = true;
      while (vl.length || first) {
        const avail = Math.floor((PDF.H - PDF.M - 8 - y - 2 * pad) / PDF.LINE);
        const need = Math.max(first ? ll.length : 1, vl.length);
        if (avail < Math.min(need, 3)) { doc.addPage(); y = PDF.M; continue; }
        const take = vl.splice(0, Math.max(1, Math.min(avail, vl.length)));
        const nLines = Math.max(take.length, first ? ll.length : 1);
        const h = nLines * PDF.LINE + 2 * pad;
        doc.setDrawColor(200, 200, 200); doc.setFillColor(245, 245, 240);
        doc.rect(PDF.M, y, LW, h, 'FD');
        doc.rect(PDF.M + LW, y, VW, h, 'S');
        doc.setTextColor(10, 10, 10);
        if (first) { doc.setFont('helvetica', 'bold'); doc.text(ll, PDF.M + pad, y + pad + 3.3); }
        doc.setFont('helvetica', 'normal');
        doc.text(take, PDF.M + LW + pad, y + pad + 3.3);
        y += h;
        first = false;
      }
    }
    y += 3;
  };

  const gridTable = (head, rows, widths) => {
    doc.setFontSize(9);
    const pad = 2;
    const draw = (cells, bold) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      const lines = cells.map((c, i) => doc.splitTextToSize(pdfText(c), widths[i] - 2 * pad));
      const h = Math.max(...lines.map(l => l.length)) * PDF.LINE + 2 * pad;
      if (ensure(h) && !bold) draw(head, true);
      let x = PDF.M;
      lines.forEach((l, i) => {
        doc.setDrawColor(200, 200, 200);
        if (bold) { doc.setFillColor(245, 245, 240); doc.rect(x, y, widths[i], h, 'FD'); } else doc.rect(x, y, widths[i], h, 'S');
        doc.setTextColor(10, 10, 10);
        doc.text(l, x + pad, y + pad + 3.3);
        x += widths[i];
      });
      y += h;
    };
    draw(head, true);
    rows.forEach(r => draw(r, false));
    y += 3;
  };

  /* fotos e capas de vídeo, duas por linha */
  const figures = async photos => {
    if (!photos.length) return;
    const gap = 6, cw = (PDF.CW - gap) / 2, maxH = 68;
    for (let i = 0; i < photos.length; i += 2) {
      const pair = photos.slice(i, i + 2);
      const cells = [];
      for (const ph of pair) {
        fig++;
        const src = isVideo(ph) ? (ph.poster || ph.thumb) : ph.blob;
        const ratio = (ph.h && ph.w) ? ph.h / ph.w : 0.75;
        let w = cw, h = cw * ratio;
        if (h > maxH) { h = maxH; w = h / ratio; }
        let cap = 'Figura ' + fig;
        if (isVideo(ph)) cap += ' (vídeo' + (ph.duration ? ', ' + fmtDuration(ph.duration) : '') + ')';
        if (ph.caption) cap += ' - ' + ph.caption;
        doc.setFontSize(8);
        const capLines = doc.splitTextToSize(pdfText(cap), cw);
        const linkH = isVideo(ph) ? 4 : 0;
        cells.push({ ph, src, w, h, capLines, total: h + 2 + capLines.length * 3.6 + linkH });
      }
      ensure(Math.max(...cells.map(c => c.total)) + 4);
      let x = PDF.M;
      for (const c of cells) {
        const ix = x + (cw - c.w) / 2;
        try {
          doc.addImage(await _blobBytes(c.src), 'JPEG', ix, y, c.w, c.h, undefined, 'FAST');
        } catch (e) {
          doc.setDrawColor(200, 200, 200); doc.rect(ix, y, c.w, c.h, 'S');
        }
        if (isVideo(c.ph)) {
          const cx = ix + c.w / 2, cy = y + c.h / 2;
          doc.setFillColor(10, 10, 10); doc.circle(cx, cy, 7, 'F');
          doc.setFillColor(255, 255, 255); doc.triangle(cx - 2.5, cy - 4, cx - 2.5, cy + 4, cx + 4.5, cy, 'F');
        }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90, 90, 90);
        doc.text(c.capLines, x, y + c.h + 4.5);
        if (isVideo(c.ph)) {
          const ly = y + c.h + 4.5 + c.capLines.length * 3.6;
          if (c.ph.driveFileId) {
            doc.setTextColor(0, 102, 204);
            doc.textWithLink('Assistir no Google Drive', x, ly, { url: driveLink(c.ph.driveFileId) });
          } else {
            doc.setTextColor(120, 120, 120);
            doc.text('Vídeo ainda não enviado à nuvem', x, ly);
          }
        }
        imgsFeitas++;
        if (onProgress) onProgress(imgsFeitas, totalImgs);
        x += cw + gap;
      }
      y += Math.max(...cells.map(c => c.total)) + 5;
    }
  };

  const fieldRows = (fields, data) => {
    const rows = [];
    for (const f of fields) {
      const v = data[f.key];
      if (!isFilled(v)) continue;
      let out = Array.isArray(v) ? v.join(', ') : String(v);
      if (f.unit && !Array.isArray(v)) out += ' ' + f.unit;
      rows.push([f.label, out]);
    }
    return rows;
  };

  /* capa */
  const hoje = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.setFillColor(10, 10, 10); doc.rect(0, 0, PDF.W, 46, 'F');
  doc.setFillColor(0, 194, 222); doc.rect(0, 46, PDF.W, 2, 'F');
  doc.setTextColor(0, 194, 222); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('ÁGUA CAMELO', PDF.M, 16);
  doc.setTextColor(255, 255, 255); doc.setFontSize(18);
  doc.text('Relatório de Diagnóstico de Campo', PDF.M, 28);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(12);
  doc.text(doc.splitTextToSize(pdfText(p.nome), PDF.CW), PDF.M, 37);
  doc.setTextColor(90, 90, 90); doc.setFontSize(9.5);
  y = 56;
  doc.text(pdfText('Gerado em ' + hoje + ' · ' + nucleos.length + ' núcleo(s) · ' +
    all.filter(x => !isVideo(x)).length + ' foto(s) · ' + all.filter(isVideo).length + ' vídeo(s)'), PDF.M, y);
  y += 8;

  const info = PROJECT_FIELDS.filter(f => isFilled(p[f.key])).map(f => [f.label, p[f.key]]);
  if (info.length) { heading('Informações do projeto', 13, true); kvTable(info); }

  const fotosProjeto = all.filter(ph => !ph.nucleoId);
  if (fotosProjeto.length) { heading('Registro fotográfico geral', 13, true); await figures(fotosProjeto); }

  if (nucleos.length) {
    heading('Núcleos visitados', 13, true);
    gridTable(['Núcleo', 'Moradores', 'Frequentadores da EAS', 'Fontes de água'], nucleos.map(n => {
      const s2 = (n.dados || {}).s2 || {};
      const fontes = (((n.dados || {}).s3 || {}).fontes || []).length;
      return [n.nome, s2.moradores || '-', s2.frequentadores || '-', fontes ? String(fontes) : '-'];
    }), [70, 32, 46, 30]);
  }

  for (const n of nucleos) {
    doc.addPage(); y = PDF.M;
    doc.setFillColor(10, 10, 10); doc.rect(PDF.M, y, PDF.CW, 11, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text(pdfText('Núcleo: ' + n.nome), PDF.M + 3, y + 7.5);
    y += 16;
    const photos = all.filter(ph => ph.nucleoId === n.id);
    for (const sec of SECTIONS) {
      const secPhotos = photos.filter(ph => ph.section === sec.id);
      if (!sectionHasData(sec, n.dados) && !secPhotos.length) continue;
      heading(sec.title, 12, true);
      const data = (n.dados || {})[sec.id] || {};
      if (sec.isArray) {
        const items = data[sec.arrayKey] || [];
        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          const rows = fieldRows(sec.itemFields, item);
          const itemPhotos = secPhotos.filter(ph => ph.item === item.id);
          if (!rows.length && !itemPhotos.length) continue;
          heading(sec.itemLabel + ' ' + (idx + 1) + (item.nome ? ' - ' + item.nome : ''), 10.5, false);
          if (rows.length) kvTable(rows);
          await figures(itemPhotos);
        }
        await figures(secPhotos.filter(ph => !ph.item || !items.some(it => it.id === ph.item)));
      } else {
        const rows = fieldRows(sec.fields, data);
        if (rows.length) kvTable(rows);
        await figures(secPhotos);
      }
    }
  }

  /* rodapé com paginação */
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 120, 120);
    doc.text(pdfText('Água Camelo · Diagnóstico de Campo · ' + p.nome), PDF.M, PDF.H - 8);
    doc.text('Página ' + i + ' de ' + n, PDF.W - PDF.M, PDF.H - 8, { align: 'right' });
  }

  const name = 'relatorio-' + slug(p.nome) + '-' + new Date().toISOString().slice(0, 10) + '.pdf';
  return { blob: doc.output('blob'), name };
}
