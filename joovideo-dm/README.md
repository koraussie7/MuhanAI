# joovideo.cfd → Dailymotion 자동 업로드

이 디렉토리는 **joovideo.cfd(PeerTube)** 의 새 영상을 감지해 **Dailymotion** 으로 자동 업로드하는 워커의 1단계(Dailymotion OAuth 인증) 코드입니다.

## 1) Dailymotion 앱 생성 및 OAuth 설정

1. [Dailymotion Developers](https://developers.dailymotion.com/) 에 접속해 애플리케이션을 생성합니다.
2. 앱 설정에서 **Client ID** 와 **Client Secret** 을 발급받습니다.
3. 권한(Scope)은 일반적으로 `bundle.publisher` 이상이 필요합니다. (정확한 scope는 Dailymotion 앱 유형에 따라 다를 수 있습니다.)
4. 발급받은 값으로 프로젝트 루트의 `.env` 파일을 생성합니다.

```env
DAILYMOTION_CLIENT_ID=your_client_id
DAILYMOTION_CLIENT_SECRET=your_client_secret
DAILYMOTION_SCOPE=bundle.publisher
```

## 2) 토큰 발급 테스트

```bash
cd muhanai/joovideo-dm
python3 auth_dailymotion.py
```

정상적으로 발급되면 다음과 같은 출력이 나타납니다.

```text
🔎 .env 로드 중: .../.env
✅ 토큰 발급 성공 (유효 30분)
🔑 Access Token (일부): eyJhbG...
✅ 토큰 유효함 - 계정: your_username (id=xxx)
```

## 3) 다음 단계

- `peertube_watcher.py`: joovideo.cfd PeerTube에서 새 영상 감지
- `upload_to_dailymotion.py`: Dailymotion 업로드 로직
- `state_manager.py`: 중복 업로드 방지 상태 저장

이 단계에서 토큰 발급이 정상이면 다음 모듈 구현으로 넘어갈 수 있습니다.
