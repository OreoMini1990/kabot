# 참고 소스 코드 분석 보고서 + 구현 완료

## ✅ 구현 완료 사항 (2024-12-17)

### A. 무단 홍보 감지 기능 ✅
- **파일**: `server/labbot-node.js`
- **모듈**: `PROMOTION_DETECTOR`
- 금지 도메인: `open.kakao.com`, `toss.me`, `toss.im`, `discord.gg`, `discord.com/invite`
- 화이트리스트: `naver.com`, `google.com`, `youtube.com`, `youtu.be`
- 위반 횟수별 단계적 경고 (1회: 경고, 2회: 강력 경고, 3회: 관리자 보고)

### B. 닉네임 변경 감지 ✅
- **파일**: `server/labbot-node.js`
- **모듈**: `NICKNAME_TRACKER`
- 사용자별 닉네임 히스토리 추적
- 변경 시 알림 메시지 자동 생성

### C. 메시지 삭제 감지 ✅
- **파일**: `server/labbot-node.js`, `server/server.js`, `client/kakao_poller.py`
- **모듈**: `MESSAGE_DELETE_TRACKER`
- `v.origin === 'SYNCDLMSG'` 감지
- 24시간 내 삭제 횟수 추적
- 단계별 경고 (1회: 자제 안내, 2회: 경고, 3회: 관리자 보고)

### D. 입퇴장/강퇴 감지 ✅
- **파일**: `server/labbot-node.js`, `server/server.js`
- **모듈**: `MEMBER_TRACKER`
- 입퇴장: 기능 구현 완료, **주석 처리** (비활성화)
- 강퇴: **활성화** - 강퇴 시 메시지 출력

### E. 반응(이모지) 감지 개선 ✅
- **파일**: `client/kakao_poller.py`
- attachment 필드에서 다양한 반응 키 지원: `reaction`, `like`, `thumbs`, `emoji`, `emoType`, `react`, `likeType`
- 이모지 타입 매핑: heart(❤️), thumbs_up(👍), check(✅), surprised(😱), sad(😢)

---

# 원본 분석 보고서

## 📊 분석 요약

| 기능 | 중요도 | 구현 난이도 | 우선순위 | 비고 |
|------|--------|-------------|----------|------|
| 무단 홍보 감지 | ⭐⭐⭐⭐⭐ | 중 | 1순위 | 즉시 활용 가능 |
| 닉네임 변경 감지 | ⭐⭐⭐⭐⭐ | 중 | 1순위 | 기존 코드 개선 필요 |
| 메시지 삭제 감지 | ⭐⭐⭐⭐ | 상 | 2순위 | DB origin 필드 활용 |
| 입퇴장/강퇴 감지 | ⭐⭐⭐⭐ | 중 | 2순위 | Feed 타입 파싱 필요 |
| DB 테이블/컬럼 정보 | ⭐⭐⭐⭐⭐ | - | 참고 자료 | 핵심 참고 자료 |

---

## 1. 무단 홍보 감지 기능

### 📌 핵심 아이디어

```javascript
// 링크 감지 정규식
const generalLinkRegex = /https?:\/\/[^\s]+/i;

// 특정 도메인 감지
const containsKakao = content.includes("open.kakao.com");
const containsToss = content.includes("toss.me") || content.includes("toss.im");
const containsDiscord = content.includes("discord.gg") || content.includes("discord.com");
```

### 📋 분석 내용

1. **링크 감지 방식**
   - 일반 URL 정규식으로 모든 링크 감지
   - 특정 도메인(오픈채팅, 토스, 디스코드)은 별도 분류
   - 사용자별 위반 횟수 누적 (JSON 파일 저장)

2. **DB 기반 URL 감지** (HOLAAA 소스)
   ```javascript
   // KakaoTalk2.db의 url_log 테이블에서 링크 조회
   db.rawQuery("SELECT * FROM url_log", null);
   ```
   - 카카오톡 DB에 `url_log` 테이블 존재
   - 메시지 내 URL이 자동 기록됨

3. **우리 코드에 적용 방안**
   - `server/labbot-node.js`에 링크 감지 미들웨어 추가
   - Supabase에 `promotion_violations` 테이블 생성
   - 사용자별 위반 횟수 및 경고 이력 관리

### ✅ 구현 시 참고사항
- 화이트리스트 도메인 설정 기능 필요 (허용된 링크)
- 관리자/운영진 예외 처리
- 위반 횟수별 단계적 경고 (1회: 경고, 2회: 강력 경고, 3회: 관리자 보고)

---

## 2. 닉네임 변경 감지 기능

### 📌 핵심 아이디어

```javascript
// 사용자별 닉네임 파일 저장
const previousNickname = FileStream.read(dir + userid + ".txt");

if (previousNickname !== sender) {
    FileStream.write(dir + userid + ".txt", sender);
    FileStream.append(dir + userid + "_log_" + ".txt", 
        "닉네임 변경: " + sender + " 시간: " + nowtime
    );
    msg.reply("닉네임 변경 발생\n이전: " + previousNickname + "\n현재: " + sender);
}
```

### 📋 분석 내용

1. **파일 기반 저장 방식** (미나링 소스)
   - `{userid}.txt`: 현재 닉네임
   - `{userid}_log_.txt`: 닉네임 변경 이력

2. **DBManager 방식** (고급)
   ```javascript
   // open_profile_change 이벤트
   DBListener.on("open_profile_change", (beforeUser, afterUser, channel) => {
       channel.send("프로필이 바뀌었어요\n" + beforeUser.name + "->" + afterUser.name);
   });
   ```

3. **Iris 방식** (KakaoDB.kt)
   ```kotlin
   // open_chat_member 테이블에서 닉네임 조회
   "SELECT COALESCE(open_chat_member.nickname, friends.name) AS name, 
           COALESCE(open_chat_member.enc, friends.enc) AS enc 
    FROM info 
    LEFT JOIN db2.open_chat_member ON open_chat_member.user_id = info.user_id 
    LEFT JOIN db2.friends ON friends.id = info.user_id"
   ```

4. **우리 코드에 적용 방안**
   - 현재 `client/kakao_poller.py`에서 매 메시지마다 발신자 이름 조회
   - Supabase `chat_users` 테이블에 이전 닉네임 저장
   - 닉네임 변경 시 `MemberActivity` 레코드 생성

### ✅ 구현 시 참고사항
- `db2.open_chat_member` 테이블 접근 가능 여부 확인 필요
- 채팅방별 닉네임 변경 이력 관리
- 프로필 이미지 변경도 감지 가능 (avatar.hash 비교)

---

## 3. 메시지 삭제 감지 기능

### 📌 핵심 아이디어

```python
# Iris 방식 - v 필드의 origin 확인
if chat.message.v.get("origin") == "SYNCDLMSG":
    on_delmsg(chat)

# 24시간 내 삭제 횟수 추적
delete_logs[user_id].append(now)
count = len(delete_logs[user_id])
chat.reply(f"{user_name} 님 24시간 내 삭제 {count}회")
```

### 📋 분석 내용

1. **삭제 메시지 감지 방법** (Iris)
   - `v` 필드 내 `origin` 값이 `"SYNCDLMSG"`면 삭제된 메시지
   - `ObserverHelper.kt`에서 `SYNCMSG`, `MCHATLOGS` origin은 무시

2. **DBManager 방식**
   ```javascript
   // delete 이벤트
   DBListener.on("delete", (chat, channel) => {
       channel.send(chat.deletedChat.text + "메시지가 지워졌어요");
   });
   
   // hide 이벤트 (관리자 가리기)
   DBListener.on("hide", (chat, channel) => {
       channel.send(chat.user.name + "님이 메시지를 가렸어요");
   });
   ```

3. **우리 코드에 적용 방안**
   - `client/kakao_poller.py`에서 `v` 필드의 `origin` 값 파싱
   - 삭제된 메시지는 별도 처리 (로그 저장, 경고 발송)
   - 24시간 내 삭제 횟수 추적 및 경고 시스템

### ✅ 구현 시 참고사항
- 삭제된 메시지의 원본 내용 복구 가능 여부 확인
- 최근 메시지 캐시 필요 (삭제 전 내용 저장)
- 단계별 경고: 1회(자제 안내), 2회(경고), 3회(운영진 보고)

---

## 4. 입퇴장/강퇴 감지 기능

### 📌 핵심 아이디어

```javascript
// DBManager - Feed 타입별 이벤트
DBListener.on("join", (chat, channel) => {
    channel.send(chat.joinUsers[0].nickName + "님 안녕하세요");
});

DBListener.on("leave", (chat, channel) => {
    if (chat.isKicked()) {
        channel.send(chat.leaveUser.nickName + "님이 강퇴당했어요");
    } else {
        channel.send(chat.leaveUser.nickName + "님 잘가요");
    }
});

DBListener.on("kick", (chat, channel) => {
    channel.send(chat.kickedBy.name + "님이 " + chat.kickedUser.nickName + "님을 강퇴했습니다");
});
```

### 📋 분석 내용

1. **Feed 타입 분류** (feed_type.js 분석)
   | feedType | 이벤트 |
   |----------|--------|
   | 1 | 초대 (InviteFeed) |
   | 2 | 퇴장 (LeaveFeed) |
   | 4 | 삭제됨 (DeleteFeed) |
   | 6 | 강퇴 (OpenChatKickedFeed) |
   | 11 | 부방장 승급 (PromoteFeed) |
   | 12 | 부방장 강등 (DemoteFeed) |
   | 14 | 알림 끔 (MuteFeed) |
   | 15 | 방장 위임 (HandOverFeed) |

2. **node-iris 컨트롤러 방식**
   ```typescript
   @DeleteMemberController
   async onDeleteMember(context: ChatContext) {
       const isKick = context.message.msg.feedType === 6;
       if (isKick) {
           const kickedUserName = feedData.member?.nickName;
           await context.reply(`${kickerName}님이 ${kickedUserName}님을 내보냈습니다.`);
       }
   }
   ```

3. **MemberService 패턴** (create-node-iris-app)
   - Prisma DB에 Room, Member, MemberActivity 테이블
   - 입장/퇴장 횟수 추적
   - 활동 기록 (JOIN, LEAVE, NICKNAME_CHANGE)

4. **우리 코드에 적용 방안**
   - `client/kakao_poller.py`에서 Feed 메시지 타입 감지
   - message `type`이 특정 값일 때 Feed로 처리
   - 입퇴장 이력을 Supabase에 저장

### ✅ 구현 시 참고사항
- Feed 메시지의 `type` 값 확인 필요 (26: 답장, 71: 반응 등)
- `attachment` 필드에서 joinUsers, leaveUser 정보 파싱
- 강퇴 시 강퇴자(kickedBy) 정보도 함께 저장

---

## 5. DB 테이블/컬럼 구조 정보

### 📌 핵심 DB 테이블 (KakaoTalk.db / KakaoTalk2.db)

| 테이블 | 설명 | 주요 컬럼 |
|--------|------|-----------|
| `chat_logs` | 채팅 로그 | `_id`, `chat_id`, `user_id`, `message`, `attachment`, `v`, `type`, `created_at` |
| `chat_rooms` | 채팅방 정보 | `id`, `name`, `private_meta`, `link_id` |
| `db2.friends` | 친구 목록 | `id`, `name`, `enc`, `profile_image_url` |
| `db2.open_chat_member` | 오픈채팅 멤버 | `user_id`, `nickname`, `enc` |
| `db2.open_link` | 오픈채팅 링크 | `id`, `name` |
| `url_log` | URL 로그 | URL이 포함된 메시지 기록 |

### 📌 v 필드 구조 (암호화 정보)

```json
{
  "enc": 31,           // 암호화 타입 (0-31)
  "origin": "MSG",     // 메시지 출처 (MSG, SYNCMSG, SYNCDLMSG, MCHATLOGS)
  "isMine": false      // 본인 메시지 여부
}
```

### 📌 origin 값 의미
| origin | 설명 |
|--------|------|
| `MSG` | 일반 메시지 (실시간) |
| `SYNCMSG` | 동기화된 메시지 (무시) |
| `SYNCDLMSG` | 삭제된 메시지 동기화 |
| `MCHATLOGS` | 다중 채팅 로그 (무시) |

### 📌 message type 값 (참고)
| type | 설명 |
|------|------|
| 1 | 일반 텍스트 |
| 2 | 사진 |
| 3 | 동영상 |
| 26 | 답장 메시지 |
| 70-79 | 반응 (이모지) |
| Feed | 시스템 메시지 (입퇴장 등) |

---

## 6. 복호화 로직 분석 (Iris vs 우리 코드)

### 📌 Iris 복호화 방식 (KakaoDecrypt.kt)

```kotlin
// 1. enc 타입에 따른 salt prefix
val prefixes = arrayOf(
    "", "", "12", "24", "18", "30", "36", "12", "48", "7", 
    "35", "40", "17", "23", "29",
    "isabel", "kale", "sulli", "van", "merry", "kyle", "james", "maddux",
    "tony", "hayden", "paul", "elijah", "dorothy", "sally", "bran",
    incept(830819), "veil"  // enc=30, enc=31
)

// 2. Salt 생성
val saltStr = prefixes[encType] + user_id
saltStr = saltStr.substring(0, min(16, saltStr.length))

// 3. PKCS12 키 유도 + AES/CBC/NoPadding 복호화
```

### 📌 핵심 포인트
- `user_id`는 **봇의 user_id** (메시지 발신자가 아님!)
- `botUserId`는 `isMine: true`인 메시지에서 자동 감지
- enc 값은 `v` 필드에서 추출

### ✅ 우리 코드 확인 사항
- `MY_USER_ID` 설정이 올바른지 확인
- enc 값 추출 로직 확인 (v 필드 파싱)

---

## 7. 추가 구현 추천 기능

### 🔥 높은 우선순위
1. **무단 홍보 감지 + 자동 경고** (즉시 활용 가능)
2. **닉네임 변경 감지 개선** (기존 코드 개선)
3. **메시지 삭제 감지 + 경고 시스템**

### 📈 중간 우선순위
4. **입퇴장 로그 시스템** (DB 저장 + 통계)
5. **강퇴 감지 + 로그**
6. **권한 변경 감지** (부방장 승급/강등)

### 📊 낮은 우선순위
7. **프로필 변경 감지** (이미지 해시 비교)
8. **URL 로그 활용** (db.url_log 테이블)
9. **메시지 가리기 감지** (hide 이벤트)

---

## 8. 구현 작업 목록 (선택 가능)

### A. 무단 홍보 감지 기능
- [ ] 링크 감지 정규식 추가
- [ ] 특정 도메인 분류 (오픈채팅, 토스, 디스코드 등)
- [ ] 위반 횟수 DB 저장
- [ ] 단계별 경고 메시지 발송
- [ ] 화이트리스트 도메인 설정

### B. 닉네임 변경 감지 개선
- [ ] 이전 닉네임 DB 저장
- [ ] 변경 시 알림 메시지 발송
- [ ] 변경 이력 조회 명령어

### C. 메시지 삭제 감지
- [ ] v.origin 필드 파싱
- [ ] 삭제 메시지 로그 저장
- [ ] 24시간 내 삭제 횟수 추적
- [ ] 단계별 경고 시스템 (1회/2회/3회)

### D. 입퇴장/강퇴 감지
- [ ] Feed 타입 파싱
- [ ] 입퇴장 이력 DB 저장
- [ ] 강퇴 시 관리자 알림
- [ ] 입퇴장 통계 조회 명령어

---

## 📝 결론

제공된 참고 소스들은 **매우 유용한 정보**를 담고 있습니다:

1. **DBManager**: DB 테이블 구조, 이벤트 타입, Feed 분류 방법
2. **Iris**: 복호화 로직, v.origin 활용, 봇 user_id 감지
3. **node-iris-app**: 컨트롤러 패턴, MemberService 설계, Prisma 스키마
4. **커뮤니티 예제**: 실용적인 기능 구현 아이디어

이 정보들을 바탕으로 우리 코드에 맞게 기능을 구현할 수 있습니다.

---

*이 보고서를 검토하시고, 구현하고 싶은 기능을 선택해 주세요.*

