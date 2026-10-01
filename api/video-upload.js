// Abre uma sessão de upload retomável no Google Drive para um vídeo.
// O app manda o arquivo DIRETO para o Drive em pedaços (o vídeo não passa
// pela Vercel nem pelo Supabase, que no plano free limita 50 MB por arquivo).
// Se a conexão cair no meio, o app consulta a sessão e continua de onde parou.
// Body: { id, project_nome, nucleo_nome, caption, ts, mime, size }
// Envs (Vercel): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, DRIVE_FOLDER_ID

const ORIGENS = [
  'https://diagnostico-camelo.vercel.app',
  'https://pedrolevinson.github.io'
];
const TAMANHO_MAX = 4 * 1024 * 1024 * 1024; // 4 GB

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const permitida = ORIGENS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  res.setHeader('Access-Control-Allow-Origin', permitida ? origin : ORIGENS[0]);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'use POST' });
  if (!permitida) return res.status(403).json({ erro: 'origem não permitida' });

  const env = process.env;
  for (const k of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'DRIVE_FOLDER_ID']) {
    if (!env[k]) return res.status(500).json({ erro: 'env ausente: ' + k });
  }
  const b = req.body || {};
  const size = Number(b.size);
  const mime = String(b.mime || 'video/mp4');
  if (!b.id || !size || size > TAMANHO_MAX || !mime.startsWith('video/')) {
    return res.status(400).json({ erro: 'informe id, size (até 4 GB) e mime de vídeo' });
  }

  try {
    const token = await googleToken(env);
    const cache = {};
    const projPasta = await ensureFolder(token, env.DRIVE_FOLDER_ID, String(b.project_nome || 'Projeto'), cache);
    const subPasta = await ensureFolder(token, projPasta, String(b.nucleo_nome || 'Fotos do projeto'), cache);

    const ext = mime.includes('quicktime') ? 'mov' : mime.includes('webm') ? 'webm' : mime.includes('3gp') ? '3gp' : 'mp4';
    const legenda = String(b.caption || '').trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 60);
    const quando = String(b.ts || '').slice(0, 10);
    const nome = [quando, legenda || 'video', String(b.id).slice(0, 8)].filter(Boolean).join(' - ') + '.' + ext;

    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mime,
        'X-Upload-Content-Length': String(size),
        'Origin': origin
      },
      body: JSON.stringify({ name: nome, parents: [subPasta] })
    });
    const uploadUrl = r.headers.get('location');
    if (!r.ok || !uploadUrl) throw new Error('drive recusou a sessão (' + r.status + '): ' + (await r.text()).slice(0, 200));
    return res.status(200).json({ uploadUrl, nome });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: String(e.message || e) });
  }
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
  const q = encodeURIComponent(`name = '${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
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
