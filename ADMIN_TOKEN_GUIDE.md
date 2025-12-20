# 관리자 토큰 안내

## 🔑 관리자 토큰 확인 방법

### 1. .env 파일 확인

NAS에서 다음 명령어로 확인:

```bash
cat /home/app/iris-core/server/.env | grep ADMIN_TOKEN
```

### 2. 기본 토큰

`.env` 파일에 `ADMIN_TOKEN`이 설정되지 않았다면:

**기본 토큰:** `default-admin-token-change-me`

---

## 📝 관리자 페이지에서 사용

1. 관리자 페이지 접속: `http://your-nas-ip:5002/admin`
2. 상단의 "관리자 토큰 입력" 필드에 토큰 입력
3. "인증" 버튼 클릭

---

## 🔐 토큰 변경 방법

`.env` 파일 수정:

```bash
cd /home/app/iris-core/server
nano .env
```

다음 줄 추가 또는 수정:
```
ADMIN_TOKEN=your-secure-token-here
```

저장 후 서버 재시작:
```bash
pm2 restart kakkaobot-server
```










