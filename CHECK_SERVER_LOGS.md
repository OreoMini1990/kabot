# 서버 로그 확인 방법

## 서버 로그 위치

서버가 Linux에서 PM2로 실행 중이라면, 다음 명령어로 로그를 확인할 수 있습니다:

### 1. PM2 로그 확인 (실시간)
```bash
pm2 logs kakkaobot-server --lines 100
```

### 2. PM2 로그 파일 직접 읽기
```bash
# 로그 파일 위치
~/.pm2/logs/kakkaobot-server-out.log  # 표준 출력
~/.pm2/logs/kakkaobot-server-error.log  # 에러 로그

# 마지막 50줄 확인
tail -n 50 ~/.pm2/logs/kakkaobot-server-out.log
tail -n 50 ~/.pm2/logs/kakkaobot-server-error.log
```

### 3. 서버 디렉토리에서 로그 확인
```bash
cd /home/app/iris-core/server
# 또는
cd /home/app/iris-core

# 로그 파일이 있다면
tail -n 50 server.log
tail -n 50 logs/server.log
```

## 현재 확인해야 할 로그 키워드

다음 키워드로 최근 로그를 확인하세요:

```bash
# 이미지 처리 관련
pm2 logs kakkaobot-server --lines 100 | grep -E "이미지 처리|imageProcessor|imageDownloader|Bridge"

# 모듈 로딩 관련
pm2 logs kakkaobot-server --lines 100 | grep -E "모듈 로딩|Module|require|imageDownloader"

# Bridge 인증 관련
pm2 logs kakkaobot-server --lines 100 | grep -E "Bridge.*인증|authenticateBridge|key_mismatch|no_api_key"

# 에러 관련
pm2 logs kakkaobot-server --lines 100 | grep -E "ERROR|Error|error|실패|Failed"
```

## 로그를 공유해주시면

서버 로그의 마지막 50-100줄을 공유해주시면 문제를 진단하고 해결할 수 있습니다.

특히 다음 정보가 포함된 로그를 확인해주세요:
1. `[이미지 처리]` 로그
2. `[Bridge]` 로그
3. `Cannot find module` 에러
4. `인증 실패` 메시지

