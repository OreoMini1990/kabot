# 변경 이력 (Changelog)

모든 주요 변경사항은 이 파일에 기록됩니다.

형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.0.0/)를 따르며,
이 프로젝트는 [Semantic Versioning](https://semver.org/lang/ko/)을 따릅니다.

## [1.0.0] - 2025-01-XX

### 추가됨
- 카카오톡 메시지 복호화 로직 (AES-256-CBC, PKCS12 키 유도)
- 카카오톡 DB 폴링 시스템 (Iris 방식)
- 채팅방 이름 복호화 및 필터링 기능
- WebSocket 기반 실시간 메시지 처리
- Iris HTTP API를 통한 메시지 전송 기능
- "의운모" 채팅방 필터링 및 자동 응답
- 기술적 한계 분석 문서 (TECHNICAL_LIMITATIONS.md)
- Git 설정 가이드 (GIT_SETUP.md)
- PC 로컬 테스트 가이드
- 다양한 테스트 스크립트

### 변경됨
- README.md 업데이트 (주요 기능 설명 추가)
- .gitignore 업데이트 (카카오톡 DB 파일 제외)

### 수정됨
- chat_id 전달 시 문자열로 변환하여 JavaScript Number 정밀도 문제 해결
- 채팅방 이름 조회 로직 개선 (private_meta, open_link, name 컬럼 순서 확인)

### 알려진 이슈
- `am startservice`를 통한 직접 메시지 전송은 RemoteInput Bundle 전달 불가로 실패 가능성 높음
- Iris HTTP API 사용 권장

---

## 향후 계획

### v1.1.0 (예정)
- [ ] 다중 채팅방 지원
- [ ] 메시지 전송 재시도 로직
- [ ] 에러 핸들링 개선

### v1.2.0 (예정)
- [ ] 이미지 메시지 지원
- [ ] 파일 전송 지원
- [ ] 관리자 대시보드
