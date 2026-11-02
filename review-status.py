#!/usr/bin/env python3
"""날고적고 심사 상태 조회 — App Store Connect API.

Play 쪽은 공개 API로 게시 상태를 읽을 수 없어 콘솔/메일로 확인한다.
키: ~/.appstoreconnect/private_keys/AuthKey_QS53NUHWUF.p8
"""
import base64
import json
import os
import subprocess
import tempfile
import time
import urllib.request

KID = "QS53NUHWUF"
ISS = "7c1c9cef-f7ff-4f55-90c4-798b7753f6c5"
KEY = os.path.expanduser("~/.appstoreconnect/private_keys/AuthKey_QS53NUHWUF.p8")
APP = "6823952877"


def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def token():
    header = b64(json.dumps({"alg": "ES256", "kid": KID, "typ": "JWT"}).encode())
    now = int(time.time())
    payload = b64(json.dumps({"iss": ISS, "iat": now, "exp": now + 1200,
                              "aud": "appstoreconnect-v1"}).encode())
    message = f"{header}.{payload}".encode()
    with tempfile.NamedTemporaryFile(delete=False) as f:
        f.write(message)
        path = f.name
    try:
        der = subprocess.run(["openssl", "dgst", "-sha256", "-sign", KEY, path],
                             capture_output=True, check=True).stdout
    finally:
        os.unlink(path)
    # openssl 은 DER(SEQUENCE of two INTEGER)로 주지만 JWS ES256 은 R||S 64바이트를 요구한다.
    i = 2 if der[1] < 0x80 else 3
    rlen = der[i + 1]
    r = der[i + 2:i + 2 + rlen]
    j = i + 2 + rlen
    slen = der[j + 1]
    s = der[j + 2:j + 2 + slen]
    r = r.lstrip(b"\x00").rjust(32, b"\x00")
    s = s.lstrip(b"\x00").rjust(32, b"\x00")
    return f"{header}.{payload}.{b64(r + s)}"


def get(path):
    req = urllib.request.Request("https://api.appstoreconnect.apple.com" + path,
                                 headers={"Authorization": "Bearer " + token()})
    return json.load(urllib.request.urlopen(req))


versions = get(f"/v1/apps/{APP}/appStoreVersions?limit=3")["data"]
for v in versions:
    a = v["attributes"]
    line = f"앱 버전 {a['versionString']:8} {a['appStoreState']}"
    try:
        build = get(f"/v1/appStoreVersions/{v['id']}/build")["data"]
        line += f"   빌드 {build['attributes']['version']}"
    except Exception:
        line += "   빌드 없음"
    print(line)

print()
for d in get(f"/v1/reviewSubmissions?filter[app]={APP}&limit=5")["data"]:
    a = d["attributes"]
    print(f"심사 제출 {a['platform']:4} {a['state']}   제출 {a.get('submittedDate')}")
