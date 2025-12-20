# 문제 해결 가이드

## 🔴 발견된 문제

### 1. 관리자 페이지 경로 오류
```
ENOENT: no such file or directory, stat '/home/app/iris-core/admin/index.html'
```

### 2. 비속어 필터가 작동하지 않음
- 카카오톡에서 비속어를 보내도 반응 없음

---

## ✅ 해결 방법

### 문제 1: 관리자 페이지 경로

**원인:** NAS에 `admin/` 폴더가 업로드되지 않았거나 경로가 잘못됨

**확인:**
```bash
# admin 폴더 존재 확인
ls -la /home/app/iris-core/admin

# index.html 파일 확인
ls -la /home/app/iris-core/admin/index.html
```

**해결:**
1. 프로젝트 전체를 NAS에 복사했는지 확인
2. `admin/` 폴더가 있는지 확인
3. 없다면 로컬에서 NAS로 복사

### 문제 2: 비속어 필터 작동 안 함

**원인:** `handleMessage` 함수에서 "!hi" 체크 후 바로 return되어 비속어 필터가 실행되지 않음

**수정 완료:** 비속어 필터를 메시지 처리 전에 실행하도록 수정했습니다.

---

## 🚀 적용 방법

### 1. 파일 확인 및 업로드

```bash
# NAS에서 확인
cd /home/app/iris-core
ls -la admin/

# admin 폴더가 없다면 로컬에서 복사 필요
```

### 2. 서버 재시작

```bash
pm2 restart kakkaobot-server

# 또는
pm2 delete kakkaobot-server
pm2 start config/ecosystem.config.js
```

### 3. 테스트

비속어 필터 테스트:
1. 카카오톡에서 "의운모" 채팅방에 비속어 입력
2. 경고 메시지가 나와야 함

관리자 페이지 테스트:
```
http://your-nas-ip:5002/admin
```










