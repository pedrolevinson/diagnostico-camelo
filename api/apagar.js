// Exclusão propagada: quando o usuário apaga no app, este endpoint remove
// da nuvem (linhas + fotos do Storage) e manda os arquivos do Drive para a
// LIXEIRA (recuperáveis por 30 dias). Idempotente.
// Body: { "tipo": "projeto" | "nucleo" | "foto", "id": "..." }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'use POST' });

  const env = process.env;
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) {
    if (!env[k]) return res.status(500).json({ erro: 'env ausente: ' + k });
  }
  const { tipo, id } = req.body || {};
  if (!id || !['projeto', 'nucleo', 'foto'].includes(tipo)) {
    return res.status(400).json({ erro: 'informe tipo (projeto|nucleo|foto) e id' });
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
  const eid = encodeURIComponent(id);

  try {
    /* localiza as fotos afetadas */
    let filtro;
    if (tipo === 'foto') filtro = `id=eq.${eid}`;
    else if (tipo === 'nucleo') filtro = `nucleo_id=eq.${eid}`;
    else filtro = `project_id=eq.${eid}`;
    const fotos = await (await sb(`/rest/v1/photos?${filtro}&select=id,storage_path,drive_file_id`)).json();
    if (!Array.isArray(fotos)) throw new Error('consulta falhou: ' + JSON.stringify(fotos).slice(0, 200));

    /* storage */
    const paths = fotos.map(f => f.storage_path).filter(Boolean);
    if (paths.length) {
      await sb('/storage/v1/object/fotos', { method: 'DELETE', body: JSON.stringify({ prefixes: paths }) });
    }

    /* Drive: lixeira (se as credenciais Google existirem; erros são ignorados) */
    const driveIds = fotos.map(f => f.drive_file_id).filter(Boolean);
    if (driveIds.length && env.GOOGLE_CLIENT_ID && env.GOOGLE_REFRESH_TOKEN) {
      try {
        const token = await googleToken(env);
        for (const fid of driveIds) {
          await fetch(`https://www.googleapis.com/drive/v3/files/${fid}`, {
            method: 'PATCH',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ trashed: true })
          }).catch(() => { });
        }
      } catch (e) { console.warn('drive trash falhou:', e.message); }
    }

    /* linhas */
    await sb(`/rest/v1/photos?${filtro}`, { method: 'DELETE', headers: { 'Prefer': 'return=minimal' } });
    if (tipo === 'nucleo') {
      await sb(`/rest/v1/nucleos?id=eq.${eid}`, { method: 'DELETE', headers: { 'Prefer': 'return=minimal' } });
    }
    if (tipo === 'projeto') {
      await sb(`/rest/v1/nucleos?project_id=eq.${eid}`, { method: 'DELETE', headers: { 'Prefer': 'return=minimal' } });
      await sb(`/rest/v1/projects?id=eq.${eid}`, { method: 'DELETE', headers: { 'Prefer': 'return=minimal' } });
    }
    return res.status(200).json({ ok: true, fotosRemovidas: fotos.length });
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
  if (!d.access_token) throw new Error('refresh google falhou');
  return d.access_token;
}
