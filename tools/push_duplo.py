"""Publica arquivos do diagcamelo/ nos DOIS repos (pessoal + org), um commit em cada.

Uso:
  python push_update.py "mensagem do commit" arquivo1 [arquivo2 ...]
  python push_update.py "mensagem do commit" --all        # todos os arquivos (exceto test/)

O deploy do site sai do repo pessoal (Vercel + GitHub Pages); o repo da org
agua-camelo-cs e espelho para a equipe.
"""
import base64
import json
import os
import sys
import time
import urllib.request
import urllib.error

TOKEN = open(r"C:\Users\vwagu\Downloads\Pedro Levinson\Claude Code\agente-linkedin\dados\github_token.txt", encoding="ascii", errors="ignore").read().strip()
REPOS = [("pedrolevinson", "diagnostico-camelo"), ("agua-camelo-cs", "diagnostico-camelo")]
BRANCH = "main"
SRC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # raiz do repo
API = "https://api.github.com"

MESSAGE = sys.argv[1]
if sys.argv[2] == "--all":
    FILES = []
    for root, dirs, fnames in os.walk(SRC):
        dirs[:] = [d for d in dirs if d not in ("test", ".git")]
        for fn in fnames:
            FILES.append(os.path.relpath(os.path.join(root, fn), SRC).replace("\\", "/"))
else:
    FILES = sys.argv[2:]

def gh(method, path, payload=None, retries=4):
    data = json.dumps(payload).encode() if payload is not None else None
    last = None
    for attempt in range(retries):
        req = urllib.request.Request(API + path, data=data, method=method)
        req.add_header("Authorization", "token " + TOKEN)
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("User-Agent", "diagcamelo-deploy")
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                body = r.read().decode()
                return r.status, json.loads(body) if body else {}
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            try:
                return e.code, json.loads(body)
            except Exception:
                return e.code, {"raw": body[:300]}
        except Exception as e:
            last = e
            print(f"  rede falhou ({e}); tentativa {attempt+1}/{retries}", flush=True)
            time.sleep(4 * (attempt + 1))
    raise SystemExit(f"Rede GitHub indisponível: {last}")

conteudos = {rel: open(os.path.join(SRC, rel.replace("/", os.sep)), "rb").read() for rel in FILES}

for owner, repo in REPOS:
    print(f"== {owner}/{repo}", flush=True)
    st, ref = gh("GET", f"/repos/{owner}/{repo}/git/ref/heads/{BRANCH}")
    if st != 200:
        raise SystemExit(f"ref {owner}: {st} {ref}")
    head = ref["object"]["sha"]
    st, base_commit = gh("GET", f"/repos/{owner}/{repo}/git/commits/{head}")
    base_tree = base_commit["tree"]["sha"]

    tree = []
    for rel, raw in conteudos.items():
        st, blob = gh("POST", f"/repos/{owner}/{repo}/git/blobs",
                      {"content": base64.b64encode(raw).decode(), "encoding": "base64"})
        if st != 201:
            raise SystemExit(f"blob {rel} em {owner}: {st} {blob}")
        tree.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    # garante .nojekyll presente
    if not any(x["path"] == ".nojekyll" for x in tree):
        st, blob = gh("POST", f"/repos/{owner}/{repo}/git/blobs", {"content": "", "encoding": "utf-8"})
        tree.append({"path": ".nojekyll", "mode": "100644", "type": "blob", "sha": blob["sha"]})

    st, t = gh("POST", f"/repos/{owner}/{repo}/git/trees", {"base_tree": base_tree, "tree": tree})
    if st != 201:
        raise SystemExit(f"tree em {owner}: {st} {t}")
    st, c = gh("POST", f"/repos/{owner}/{repo}/git/commits", {
        "message": MESSAGE + "\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>",
        "tree": t["sha"],
        "parents": [head],
    })
    if st != 201:
        raise SystemExit(f"commit em {owner}: {st} {c}")
    st, u = gh("PATCH", f"/repos/{owner}/{repo}/git/refs/heads/{BRANCH}", {"sha": c["sha"]})
    if st != 200:
        raise SystemExit(f"ref update em {owner}: {st} {u}")
    print(f"  commit {c['sha'][:10]} ({len(conteudos)} arquivo(s))", flush=True)

print("PRONTO — push duplo concluído")
