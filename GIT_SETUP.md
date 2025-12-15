# Git 저장소 설정 가이드

## 현재 상태
- ✅ Git 저장소 초기화 완료
- ✅ 초기 커밋 완료

## 원격 저장소 연결 방법

### 1. GitHub에서 새 저장소 생성
1. GitHub에 로그인
2. https://github.com/new 접속
3. Repository name: `kakkaobot`
4. Description: "Iris 기반 카카오톡 자동 응답 봇 시스템"
5. Public 또는 Private 선택
6. "Create repository" 클릭

### 2. 원격 저장소 연결
```bash
cd D:\JosupAI\kakkaobot
git remote add origin https://github.com/YOUR_USERNAME/kakkaobot.git
git branch -M main
git push -u origin main
```

### 3. GitHub CLI 사용 (선택사항)
```bash
# GitHub CLI 설치 필요: https://cli.github.com/
gh repo create kakkaobot --public --source=. --remote=origin --push
```

## 버전 관리 규칙

### 커밋 메시지 형식
```
타입: 간단한 설명

상세 설명 (선택사항)
```

### 타입 종류
- `feat`: 새로운 기능 추가
- `fix`: 버그 수정
- `docs`: 문서 수정
- `refactor`: 코드 리팩토링
- `test`: 테스트 추가/수정
- `chore`: 빌드/설정 변경

### 예시
```bash
git commit -m "feat: Iris HTTP API를 통한 메시지 전송 기능 추가"
git commit -m "fix: chat_id 전달 오류 수정"
git commit -m "docs: 기술적 한계 문서 추가"
```

## 브랜치 전략
- `main`: 안정적인 프로덕션 버전
- `develop`: 개발 브랜치
- `feature/*`: 기능 개발 브랜치
- `fix/*`: 버그 수정 브랜치

## 태그 관리
```bash
# 버전 태그 생성
git tag -a v1.0.0 -m "KakaoBot v1.0.0 - 초기 릴리스"

# 태그 푸시
git push origin v1.0.0

# 모든 태그 푸시
git push origin --tags
```

