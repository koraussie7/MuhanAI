"""Dailymotion OAuth2 토큰 발급/관리 스크립트
- Private API key 기반 client_credentials 흐름 사용
- 토큰 유효기간 30분, 자동 재발급
"""

import os
import sys
import time
from pathlib import Path
from typing import Optional

import requests

# Dailymotion token endpoint (공식 문서 기준)
TOKEN_URL = "https://oauth2.dailymotion.com/v2/token"


class DailymotionAuth:
    """Dailymotion API 접근 토큰 관리"""

    def __init__(self, client_id: str, client_secret: str, scope: str = "bundle.publisher"):
        self.client_id = client_id
        self.client_secret = client_secret
        self.scope = scope
        self._access_token: Optional[str] = None
        self._expires_at: float = 0.0  # Unix timestamp

    def is_expired(self) -> bool:
        """토큰 만료 여부 (여유 5분 두고 만료로 간주)"""
        return time.time() >= (self._expires_at - 300)

    def fetch_token(self) -> str:
        """새 access_token 발급"""
        resp = requests.post(
            TOKEN_URL,
            headers={
                "accept": "application/json",
                "content-type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "scope": self.scope,
            },
        )

        if resp.status_code != 200:
            raise RuntimeError(
                f"토큰 발급 실패 [{resp.status_code}]: {resp.text}"
            )

        data = resp.json()
        self._access_token = data["access_token"]
        self._expires_at = time.time() + int(data.get("expires_in", 1800))
        print(f"✅ 토큰 발급 성공 (유효 {int(data.get('expires_in', 1800)) // 60}분)")
        return self._access_token

    def get_token(self) -> str:
        """유효한 토큰 반환 (만료 시 자동 재발급)"""
        if self._access_token is None or self.is_expired():
            return self.fetch_token()
        return self._access_token


def load_env() -> dict:
    """환경 변수 로드 (.env 또는 실제 환경)"""
    # 프로젝트 루트의 .env 파일 지원
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        print(f"🔎 .env 로드 중: {env_path}")
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    key, _, value = line.partition("=")
                    os.environ.setdefault(key.strip(), value.strip())

    required = ["DAILYMOTION_CLIENT_ID", "DAILYMOTION_CLIENT_SECRET"]
    missing = [k for k in required if not os.environ.get(k)]

    if missing:
        print("❌ 다음 환경 변수가 필요합니다: " + ", ".join(missing))
        print("   .env 파일을 생성하거나 export 하세요.")
        sys.exit(1)

    return {
        "client_id": os.environ["DAILYMOTION_CLIENT_ID"],
        "client_secret": os.environ["DAILYMOTION_CLIENT_SECRET"],
        "scope": os.environ.get("DAILYMOTION_SCOPE", "bundle.publisher"),
    }


def test_token(auth: DailymotionAuth):
    """토큰 발급 테스트 및 현재 계정 정보 확인"""
    token = auth.get_token()
    print(f"\n🔑 Access Token (일부): {token[:20]}...")

    # 간단한 계정 조회로 토큰 유효성 확인
    resp = requests.get(
        "https://api.dailymotion.com/me",
        headers={"Authorization": f"Bearer {token}"},
        params={"fields": "id,username,email"},
    )

    if resp.status_code == 200:
        me = resp.json()
        print(f"✅ 토큰 유효함 - 계정: {me.get('username')} (id={me.get('id')})")
    else:
        print(f"⚠️ 토큰 테스트 실패 [{resp.status_code}]: {resp.text}")


if __name__ == "__main__":
    print("=" * 60)
    print("Dailymotion OAuth2 토큰 발급 테스트")
    print("=" * 60)

    env = load_env()
    auth = DailymotionAuth(
        client_id=env["client_id"],
        client_secret=env["client_secret"],
        scope=env["scope"],
    )

    test_token(auth)

    print("\n📌 다음 단계:")
    print("  1. 토큰이 정상 발급되면 이 값을 환경 변수로 사용하세요.")
    print("  2. Upload Worker에서 auth.get_token()으로 매 요청마다 토큰을 가져오면 됩니다.")
    print("  3. 실제 업로드 시 Dailymotion API 호출 시 Authorization: Bearer <token> 헤더 사용")
