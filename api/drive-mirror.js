// Espelho automático: copia para o Google Drive as fotos sincronizadas
// no Supabase que ainda não foram espelhadas. Idempotente: pode ser
// chamado quantas vezes for; processa um lote por chamada.
// Envs (Vercel): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
//                DRIVE_FOLDER_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY

const LOTE = 25;
const TEMPO_MAX_MS = 50000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const t0 = Date.now();
  const env = process.env;
  for (const k of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'DRIVE_FOLDER_ID', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) {
    if (!env[k]) return res.status(500).json({ erro: 'env ausente: ' + k });
  }
  const sb = (path, init = {}) => fetch(env.SUPABASE_URL + path, {
    ...init,
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });

  try {
    /* fotos pendentes */
    const pend = await (await sb(`/rest/v1/photos?mirrored_em=is.null&select=*&order=ts.asc&limit=${LOTE}`)).json();
    if (!Array.isArray(pend)) throw new Error('consulta photos falhou: ' + JSON.stringify(pend).slice(0, 200));
    const restantes = await countPendentes(sb);
    if (pend.length === 0) return res.status(200).json({ processadas: 0, restantes: 0 });

    /* nomes de projetos e núcleos envolvidos */
    const pids = [...new Set(pend.map(f => f.project_id))];
    const nids = [...new Set(pend.map(f => f.nucleo_id).filter(Boolean))];
    const projs = await (await sb(`/rest/v1/projects?id=in.(${pids.map(encodeURIComponent).join(',')})&select=id,nome`)).json();
    const nucs = nids.length ? await (await sb(`/rest/v1/nucleos?id=in.(${nids.map(encodeURIComponent).join(',')})&select=id,nome`)).json() : [];
    const projName = Object.fromEntries(projs.map(p => [p.id, p.nome || 'Projeto sem nome']));
    const nucName = Object.fromEntries(nucs.map(n => [n.id, n.nome || 'Núcleo sem nome']));

    const token = await googleToken(env);
    const folderCache = {};
    let processadas = 0;

    for (const foto of pend) {
      if (Date.now() - t0 > TEMPO_MAX_MS) break;
      const projPasta = await ensureFolder(token, env.DRIVE_FOLDER_ID, projName[foto.project_id] || 'Projeto', folderCache);
      const subNome = foto.nucleo_id ? (nucName[foto.nucleo_id] || 'Núcleo') : 'Fotos do projeto';
      const subPasta = await ensureFolder(token, projPasta, subNome, folderCache);

      const bin = await fetch(env.SUPABASE_URL + '/storage/v1/object/public/fotos/' + foto.storage_path);
      if (!bin.ok) { console.warn('storage 404', foto.storage_path); continue; }
      const bytes = Buffer.from(await bin.arrayBuffer());

      const nome = nomeArquivo(foto);
      const fileId = await uploadDrive(token, subPasta, nome, bytes);
      await sb(`/rest/v1/photos?id=eq.${encodeURIComponent(foto.id)}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ mirrored_em: new Date().toISOString(), drive_file_id: fileId })
      });
      processadas++;
    }
    const restam = await countPendentes(sb);
    return res.status(200).json({ processadas, restantes: restam });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: String(e.message || e) });
  }
}

async function countPendentes(sb) {
  const r = await sb('/rest/v1/photos?mirrored_em=is.null&select=id', { headers: { 'Prefer': 'count=exact', 'Range': '0-0' } });
  const cr = r.headers.get('content-range') || '';
  return parseInt(cr.split('/')[1] || '0', 10) || 0;
}

function nomeArquivo(foto) {
  const legenda = (foto.caption || '').trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 60);
  const quando = (foto.ts || '').slice(0, 10);
  return [quando, legenda || 'foto', foto.id.slice(0, 8)].filter(Boolean).join(' - ') + '.jpg';
}

async function googleToken(env) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });
  const d = await res.json();
  if (!d.access_token) throw new Error('refresh google falhou: ' + JSON.stringify(d).slice(0, 200));
  return d.access_token;
}

async function ensureFolder(token, parentId, name, cache) {
  const key = parentId + '/' + name;
  if (cache[key]) return cache[key];
  const q = encodeURIComponent(`name = '${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const found = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { 'Authorization': 'Bearer ' + token }
  })).json();
  let id = found.files && found.files[0] && found.files[0].id;
  if (!id) {
    const created = await (await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
    })).json();
    id = created.id;
    if (!id) throw new Error('não criou pasta ' + name);
  }
  cache[key] = id;
  return id;
}

async function uploadDrive(token, parentId, name, bytes) {
  const boundary = 'diagcamelo' + Date.now();
  const meta = JSON.stringify({ name, parents: [parentId] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--`)
  ]);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary },
    body
  });
  const d = await res.json();
  if (!d.id) throw new Error('upload drive falhou: ' + JSON.stringify(d).slice(0, 200));
  return d.id;
}
