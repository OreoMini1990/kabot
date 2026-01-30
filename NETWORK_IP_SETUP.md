# 네트워크 IP 설정 (사무실 이전 기준)

개발 환경 네트워크 주소 정리. 사무실 이전 등으로 변경 시 이 문서와 코드 내 IP를 함께 수정하세요.

| 구분 | IP | 용도 |
|------|-----|------|
| **서버** | `192.168.0.15` | KakaoBot 서버 (HTTP/WS 5002), SSH 타깃 |
| **클라이언트** | `192.168.0.21` | Poller/Termux 실행 PC (참고용) |

- **Client · Bridge** → 서버 `192.168.0.15:5002` 로 접속 (WebSocket `/ws`, HTTP API).
- **SERVER_URL / NAVER_REDIRECT_URI / SSH_HOST** 등은 서버 IP `192.168.0.15` 기준으로 설정됨.

IP 변경 시 점검 대상: `client/*.py`, `server/**`, `bridge/**`, `config/ecosystem.config.js`, `scripts/*.ps1` / `*.js`, `.env`, 루트 `*.ps1`.
