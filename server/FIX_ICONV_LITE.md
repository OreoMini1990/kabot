# iconv-lite 모듈 에러 해결 가이드

## 문제

서버가 시작되지 않고 다음 에러 발생:
```
MODULE_NOT_FOUND
requestPath: 'iconv-lite'
path: '/home/app/iris-core/server/node_modules/raw-body/node_modules/iconv-lite/package.json'
```

## 원인

`raw-body` (express의 의존성)가 `iconv-lite`를 찾으려고 하지만 설치되지 않았습니다.

## 해결 방법

### 방법 1: NAS 서버에서 npm install 실행 (권장)

1. **NAS 서버에 SSH 접속**
   ```bash
   ssh user@nas-ip
   ```

2. **서버 디렉토리로 이동**
   ```bash
   cd /home/app/iris-core/server
   ```

3. **패키지 설치**
   ```bash
   npm install
   ```

4. **설치 확인**
   ```bash
   ls node_modules/iconv-lite
   ```

5. **서버 재시작**
   ```bash
   pm2 restart kakkaobot-server
   ```

### 방법 2: 로컬에서 설치 후 NAS로 전송

로컬에서:
```bash
cd server
npm install iconv-lite uuid
```

그리고 `node_modules/iconv-lite`와 `node_modules/uuid` 폴더를 NAS로 전송

### 방법 3: package.json 확인 및 재설치

1. **package.json 확인**
   ```json
   {
     "dependencies": {
       "iconv-lite": "^0.7.1",
       "uuid": "^13.0.0"
     }
   }
   ```

2. **node_modules 완전 삭제 후 재설치**
   ```bash
   cd /home/app/iris-core/server
   rm -rf node_modules
   npm install
   ```

## 빠른 테스트

NAS 서버에서 다음 명령어로 확인:

```bash
cd /home/app/iris-core/server
npm list iconv-lite
```

다음과 같이 나타나야 합니다:
```
iconv-lite@0.7.1
```

## 중요 사항

- **로컬 설치 ≠ NAS 설치**: 로컬에서 설치해도 NAS 서버에는 설치되지 않습니다.
- **package.json에 있어도 실제 설치 필요**: package.json에 있더라도 `npm install`을 실행해야 `node_modules`에 설치됩니다.
- **PM2 재시작 필수**: 패키지 설치 후 반드시 `pm2 restart kakkaobot-server` 실행



















