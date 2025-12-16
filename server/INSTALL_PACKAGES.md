# 패키지 설치 가이드

## 문제

서버가 시작되지 않고 다음 에러가 발생합니다:
```
MODULE_NOT_FOUND
requestPath: 'iconv-lite'
```

## 해결 방법

NAS 서버의 실제 경로에서 패키지를 설치해야 합니다.

### 1. SSH로 NAS 접속

```bash
ssh user@nas-ip
```

### 2. 서버 디렉토리로 이동

```bash
cd /home/app/iris-core/server
```

### 3. 패키지 설치

```bash
npm install iconv-lite uuid
```

또는 `package.json`을 업데이트했으면:

```bash
npm install
```

### 4. 설치 확인

```bash
npm list iconv-lite uuid
```

다음과 같이 나타나야 합니다:
```
iconv-lite@0.6.3
uuid@9.0.1
```

### 5. 서버 재시작

```bash
pm2 restart kakkaobot-server
```

## 또는 PM2를 통해 자동 설치

PM2의 cwd 설정을 확인하고, 해당 경로에서 설치:

```bash
# PM2 cwd 확인
pm2 show kakkaobot-server | grep "exec cwd"

# 해당 경로로 이동
cd [PM2가 보여준 경로]

# 패키지 설치
npm install iconv-lite uuid
```

## 확인

서버 재시작 후 로그 확인:

```bash
pm2 logs kakkaobot-server --lines 20
```

에러가 사라지고 다음이 보여야 합니다:
```
[DB] Supabase 클라이언트 초기화 완료
[설정] NAVER_CAFE 기능: true (환경변수: true)
[2025-xx-xx] HTTP listening on 0.0.0.0:5002
```



