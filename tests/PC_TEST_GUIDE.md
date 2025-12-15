# PC 로컬 테스트 가이드

## 1. Android 기기에서 DB 파일 추출

### 방법 1: ADB 사용
```bash
# Android 기기 연결 확인
adb devices

# DB 파일 추출
adb pull /data/data/com.kakao.talk/databases/KakaoTalk.db ./KakaoTalk.db

# 또는 백업 파일 사용
adb pull /data/data/com.kakao.talk/databases/KakaoTalk.db.backup ./KakaoTalk.db.backup
```

### 방법 2: Termux에서 직접 복사
```bash
# Termux에서 실행
cp /data/data/com.kakao.talk/databases/KakaoTalk.db /sdcard/KakaoTalk.db

# PC에서 다운로드 폴더에서 찾기
```

## 2. PC에서 테스트 실행

### 필수 패키지 설치
```bash
pip install pycryptodome
```

### 테스트 실행

#### 특정 chat_id로 테스트
```bash
cd kakkaobot
python3 tests/test_room_name_local.py ./KakaoTalk.db 18469584418690487
```

#### 최근 메시지들의 chat_id로 테스트
```bash
python3 tests/test_room_name_local.py ./KakaoTalk.db
```

## 3. 예상 출력

```
[정보] 사용 중인 DB 경로: ./KakaoTalk.db
[정보] 자신의 user_id: 429744344

============================================================
[테스트] 채팅방 이름 조회: chat_id=18469584418690487
============================================================

[방법 1] private_meta 조회 시도
[방법 1] private_meta 조회 성공: 길이=123
[방법 1] JSON 파싱 성공: 키=['name', 'enc', ...]
[방법 1] name 필드 추출: name_element='암호화된문자열', 타입=<class 'str'>
[방법 1] 채팅방 이름이 암호화된 것으로 확인됨 (base64 형태)
[방법 1] 복호화 시도: user_id=429744344, enc 후보=[31, 32, 30]
[✓ 방법 1] 채팅방 이름 복호화 성공!
  - enc: 31
  - 복호화된 이름: "의운모"

============================================================
[테스트 결과]
  - DB 경로: ./KakaoTalk.db
  - chat_id: 18469584418690487
  - my_user_id: 429744344
  - room_name: "의운모"
  - "의운모" 매칭: True
============================================================
```

## 4. 문제 해결

### DB 파일을 찾을 수 없는 경우
```bash
# 현재 디렉토리에 DB 파일이 있는지 확인
ls -la *.db

# 또는 절대 경로 사용
python3 tests/test_room_name_local.py /path/to/KakaoTalk.db 18469584418690487
```

### pycryptodome 설치 오류
```bash
# Windows
pip install pycryptodome

# 또는
python -m pip install pycryptodome
```

### 복호화 실패하는 경우
- `my_user_id`가 올바른지 확인
- `private_meta`에 `enc` 필드가 있는지 확인
- DB 파일이 최신인지 확인

