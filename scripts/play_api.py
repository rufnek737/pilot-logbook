#!/usr/bin/env python3
"""Google Play Developer API — 서비스 계정으로 AAB 업로드·출시 자동화.
키: ~/.playconsole/flyrecord-sa.json (git 밖). 패키지: com.rufnek.pilotlogbook.
외부 라이브러리 없이 openssl로 RS256 JWT 서명 → androidpublisher 액세스 토큰."""
import base64, json, os, subprocess, tempfile, time, urllib.request, urllib.error, sys

SA = os.path.expanduser("~/.playconsole/flyrecord-sa.json")
PKG = "com.rufnek.pilotlogbook"
SCOPE = "https://www.googleapis.com/auth/androidpublisher"

def _b64(raw): return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

def access_token():
    sa = json.load(open(SA))
    now = int(time.time())
    header = _b64(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    claims = _b64(json.dumps({"iss": sa["client_email"], "scope": SCOPE,
                              "aud": sa["token_uri"], "iat": now, "exp": now + 3600}).encode())
    signing_input = f"{header}.{claims}".encode()
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".pem") as kf:
        kf.write(sa["private_key"]); keypath = kf.name
    with tempfile.NamedTemporaryFile(delete=False) as mf:
        mf.write(signing_input); msgpath = mf.name
    try:
        sig = subprocess.run(["openssl", "dgst", "-sha256", "-sign", keypath, msgpath],
                             capture_output=True, check=True).stdout
    finally:
        os.unlink(keypath); os.unlink(msgpath)
    jwt = f"{header}.{claims}.{_b64(sig)}"
    body = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": jwt}).encode()
    req = urllib.request.Request(sa["token_uri"], data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"})
    return json.load(urllib.request.urlopen(req))["access_token"]

def api(method, path, token, body=None, headers=None):
    url = "https://androidpublisher.googleapis.com" + path
    data = json.dumps(body).encode() if body is not None else None
    h = {"Authorization": "Bearer " + token}
    if body is not None: h["Content-Type"] = "application/json"
    if headers: h.update(headers)
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        r = urllib.request.urlopen(req); return r.status, (json.loads(r.read().decode() or "{}"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")

import urllib.parse
if __name__ == "__main__" and (len(sys.argv) < 2 or sys.argv[1] == "test"):
    print("1) 액세스 토큰 발급…")
    tok = access_token(); print("   OK (len", len(tok), ")")
    print("2) edit 생성(쓰기 권한 확인)…")
    st, b = api("POST", f"/androidpublisher/v3/applications/{PKG}/edits", tok, body={})
    print("   status=", st)
    if st != 200:
        print("   ", json.dumps(b, ensure_ascii=False)[:400]); sys.exit(1)
    eid = b["id"]; print("   editId=", eid)
    print("3) 프로덕션 트랙 읽기…")
    st2, b2 = api("GET", f"/androidpublisher/v3/applications/{PKG}/edits/{eid}/tracks/production", tok)
    rels = b2.get("releases", []) if st2 == 200 else []
    print("   status=", st2, "| 현재 프로덕션 릴리스:",
          [{ "name": r.get("name"), "status": r.get("status"), "vc": r.get("versionCodes") } for r in rels])
    print("4) edit 취소(변경 없음)…")
    st3, _ = api("DELETE", f"/androidpublisher/v3/applications/{PKG}/edits/{eid}", tok)
    print("   status=", st3, "(204=취소됨)")
    print("\n✅ 서비스 계정으로 업로드·출시 API 접근 확인 완료." if st == 200 and st2 == 200 else "\n⚠️ 일부 실패 — 위 상태 확인")
