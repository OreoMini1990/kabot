# Create Node Iris App

🤖 카카오톡 봇 프로젝트를 위한 Node Iris 템플릿 생성기

[@syncate-core/node-iris](https://www.npmjs.com/package/@syncate-core/node-iris)를 사용하여 TypeScript 기반의 카카오톡 봇을 빠르게 구축할 수 있도록 도와주는 CLI 도구입니다.

## 특징

- 📦 **다양한 템플릿**: 프로젝트 요구사항에 맞는 템플릿 선택
- 🚀 **빠른 시작**: 몇 가지 질문만으로 프로젝트 생성
- 🛠 **패키지 매니저 지원**: npm, pnpm, yarn 지원
- 📝 **자동 설정**: package.json, .env 파일 자동 구성
- 🎯 **TypeScript 지원**: 완전한 타입 안전성과 IntelliSense 지원
- 🔧 **컨트롤러 기반**: 체계적인 봇 개발을 위한 컨트롤러 패턴
- 📚 **풍부한 데코레이터**: 다양한 메시지 타입과 이벤트 처리

## 사용법

### Interactive 모드

```bash
npx create-node-iris-app
```

### 직접 프로젝트 이름 지정

```bash
npx create-node-iris-app my-bot
```

### 템플릿 지정

```bash
npx create-node-iris-app my-bot --template simple
```

## 사용 가능한 템플릿

### `simple` (기본 템플릿)

완전한 기능을 갖춘 카카오톡 봇 템플릿으로, 모든 컨트롤러 타입과 데코레이터 사용 예제를 포함합니다.

**포함 기능:**

- ✅ **모든 컨트롤러 타입**: Chat, Message, Feed, Error 등 8가지 컨트롤러
- ✅ **부트스트랩 시스템**: 봇 시작 시 초기화 작업 수행
- ✅ **배치 처리**: 스케줄링과 주기적 작업 관리
- ✅ **메시지 타입 필터링**: 사진, 비디오, 파일 등 특정 메시지 타입 처리
- ✅ **피드 이벤트 처리**: 사용자 입장/퇴장, 관리자 변경 등
- ✅ **권한 관리**: 관리자 전용, 방 제한, 사용자 차단 기능
- ✅ **스로틀링**: 명령어 사용 빈도 제한
- ✅ **HTTP 웹훅 모드**: WebSocket 대신 HTTP 웹훅 지원
- ✅ **카카오링크**: 템플릿 메시지 전송 기능
- ✅ **통합 로깅**: 다양한 로그 레벨 지원

**프로젝트 구조:**

```
src/
├── controllers/          # 8가지 컨트롤러
│   ├── CustomBootstrapController.ts    # 부트스트랩 초기화
│   ├── CustomBatchController.ts        # 배치/스케줄 처리
│   ├── CustomChatController.ts         # 모든 채팅 이벤트
│   ├── CustomMessageController.ts      # 메시지 명령어
│   ├── CustomNewMemberController.ts    # 새 멤버 입장
│   ├── CustomDeleteMemberController.ts # 멤버 퇴장
│   ├── CustomFeedController.ts         # 피드 이벤트
│   ├── CustomUnknownController.ts      # 알 수 없는 명령어
│   └── CustomErrorController.ts        # 에러 처리
├── app.ts               # 봇 설정 및 구성
└── index.ts             # 애플리케이션 진입점
```

## 컨트롤러 시스템

### 컨트롤러 타입별 역할

#### 🔧 **BootstrapController**

봇 시작 시 우선순위에 따라 초기화 작업을 수행합니다.

```typescript
@Bootstrap(1)    // 데이터베이스 초기화 (최우선)
@Bootstrap(10)   // 봇 설정 로드
@Bootstrap(50)   // 주기적 작업 설정
@Bootstrap(100)  // 정리 및 최적화 (마지막)
```

#### ⏰ **BatchController**

주기적 작업과 메시지 스케줄링을 관리합니다.

```typescript
@Schedule(5000)              // 5초마다 실행
@ScheduleMessage('reminder') // 스케줄된 메시지 처리
```

#### 💬 **ChatController**

모든 채팅 이벤트를 포괄적으로 처리하는 최상위 컨트롤러입니다.

#### 📝 **MessageController**

일반 텍스트 메시지와 봇 명령어를 처리합니다.

```typescript
@BotCommand('안녕', '인사 명령어')
@Prefix('!')  // 명령어 접두사
```

#### 👋 **NewMemberController & DeleteMemberController**

채팅방 멤버 입장/퇴장 이벤트를 처리합니다.

#### 📢 **FeedController**

채팅방 내 다양한 이벤트 피드를 처리합니다.

```typescript
@OnInviteUserFeed      // 사용자 초대
@OnPromoteManagerFeed  // 관리자 승급
@OnLeaveUserFeed       // 사용자 퇴장
```

#### ❓ **UnknownController**

등록되지 않은 명령어나 알 수 없는 요청을 처리합니다.

#### ⚠️ **ErrorController**

봇에서 발생하는 모든 오류를 중앙에서 처리합니다.

## 주요 데코레이터

### 클래스 데코레이터

- `@BootstrapController`: 봇 앱 시작시 우선적으로 실행
- `@BatchController`: 스케줄, 배치 처리
- `@ChatController` / `@Controller`: 모든 채팅 이벤트 처리
- `@MessageController`: 메시지 이벤트 처리
- `@NewMemberController`: 새 멤버 입장 이벤트 처리
- `@DeleteMemberController`: 멤버 퇴장 이벤트 처리
- `@FeedController`: 피드 이벤트 처리
- `@UnknownController`: 알 수 없는 명령어 처리
- `@ErrorController`: 에러 이벤트 처리

### 메소드 데코레이터

**명령어 등록:**

```typescript
@BotCommand('명령어', '설명')  // 봇 명령어 등록
@HelpCommand('도움말')         // 도움말 명령어
@Command                      // 기본 명령어
```

**Prefix 설정:**

```typescript
@Prefix('!')                  // 컨트롤러의 기본 prefix 설정
@MethodPrefix('특정메소드!')   // 특정 메소드에만 prefix 설정
```

**조건부 실행:**

```typescript
@HasParam                     // 파라미터 필수
@IsAdmin                      // 관리자만
@HasRole(['HOST', 'MANAGER']) // 특정 역할만
@IsNotBanned                  // 차단되지 않은 사용자
@IsReply                      // 답장 메시지만
@AllowedRoom(['방이름'])      // 특정 방에서만
@Throttle(3, 60000)          // 사용 빈도 제한 (횟수, 시간ms)
```

**메시지 타입별:**

```typescript
@OnMessage              // 모든 메시지
@OnNormalMessage        // 일반 텍스트 메시지
@OnPhotoMessage         // 사진 메시지
@OnImageMessage         // 이미지 메시지
@OnVideoMessage         // 비디오 메시지
@OnAudioMessage         // 오디오 메시지
@OnFileMessage          // 파일 메시지
@OnMapMessage           // 지도 메시지
@OnEmoticonMessage      // 이모티콘 메시지
@OnProfileMessage       // 프로필 메시지
@OnMultiPhotoMessage    // 다중 사진 메시지
@OnNewMultiPhotoMessage // 새로운 다중 사진 메시지
@OnReplyMessage         // 답장 메시지
```

**피드 타입별:**

```typescript
@OnFeedMessage              // 피드 메시지
@OnInviteUserFeed           // 사용자 초대 피드
@OnLeaveUserFeed            // 사용자 퇴장 피드
@OnDeleteMessageFeed        // 메시지 삭제 피드
@OnHideMessageFeed          // 메시지 숨김 피드
@OnPromoteManagerFeed       // 관리자 승급 피드
@OnDemoteManagerFeed        // 관리자 강등 피드
@OnHandOverHostFeed         // 방장 위임 피드
@OnOpenChatJoinUserFeed     // 오픈채팅 사용자 입장 피드
@OnOpenChatKickedUserFeed   // 오픈채팅 사용자 추방 피드
```

**스케줄링 및 부트스트랩:**

```typescript
@Schedule(5000)           // 주기적 실행 (밀리초)
@ScheduleMessage('key')   // 스케줄된 메시지 처리
@Bootstrap(1)             // 부트스트랩 실행 (낮은 숫자 우선)
```

### 유틸리티 함수

**스케줄링 관련:**

- `addContextToSchedule(context, delay, key)`: 컨텍스트를 스케줄에 추가
- `scheduleMessage(id, roomId, message, time, metadata)`: 메시지 스케줄링

**스로틀링 관리:**

- `clearUserThrottle(userId, commandName)`: 특정 사용자의 스로틀 해제
- `clearAllThrottle(commandName)`: 모든 사용자의 스로틀 해제

**디버깅 및 메타데이터:**

- `debugDecoratorMetadata()`: 데코레이터 메타데이터 디버깅
- `debugRoomRestrictions()`: 방 제한 설정 디버깅

**정보 조회:**

- `getRegisteredCommands()`: 등록된 명령어 목록 조회
- `getRegisteredControllers()`: 등록된 컨트롤러 목록 조회
- `getBatchControllers()`: 배치 컨트롤러 목록 조회
- `getBootstrapControllers()`: 부트스트랩 컨트롤러 목록 조회
- `getBootstrapMethods()`: 부트스트랩 메소드 목록 조회
- `getScheduleMethods()`: 스케줄 메소드 목록 조회
- `getScheduleMessageMethods()`: 스케줄 메시지 메소드 목록 조회

**하위 호환성 함수 (함수형):**

- `hasParam()`: @HasParam 데코레이터의 함수형 버전
- `isAdmin()`: @IsAdmin 데코레이터의 함수형 버전
- `isNotBanned()`: @IsNotBanned 데코레이터의 함수형 버전
- `isReply()`: @IsReply 데코레이터의 함수형 버전

## 프로젝트 생성 후

1. 프로젝트 폴더로 이동

```bash
cd your-project-name
```

2. 의존성 설치 (자동 설치를 선택하지 않은 경우)

```bash
pnpm install
# 또는
npm install
# 또는
yarn install
```

3. `.env` 파일 설정

```env
# Iris URL (IP:PORT 형식)
IRIS_URL=127.0.0.1:3000

# 최대 워커 스레드 수 (선택사항)
MAX_WORKERS=4

# 차단된 사용자 ID 목록 (쉼표로 구분, 선택사항)
BANNED_USERS=123456789,987654321

# KakaoLink 설정 (카카오링크 기능 사용시 필요)
KAKAOLINK_APP_KEY=your_kakao_app_key_here
KAKAOLINK_ORIGIN=your_origin_here

# 로그 레벨 설정 (error, warn, info, debug)
LOG_LEVEL=debug

# HTTP 웹훅 모드 설정 (선택사항)
HTTP_MODE=false
HTTP_PORT=3001
WEBHOOK_PATH=/webhook/message

# 채팅 로그 저장 여부
SAVE_CHAT_LOGS=false
```

4. 개발 서버 실행

```bash
pnpm run dev
# 또는
npm run dev
# 또는
yarn dev
```

5. 프로덕션 빌드

```bash
pnpm run build
pnpm start
```

## 기본 사용 예제

### 간단한 명령어

```typescript
@MessageController
@Prefix("!")
export default class CustomMessageController {
  @BotCommand("안녕", "인사 명령어")
  async hello(context: ChatContext) {
    await context.reply("안녕하세요!");
  }

  @BotCommand("반복", "메시지 반복")
  @HasParam
  async echo(context: ChatContext) {
    await context.reply(`반복: ${context.message.param}`);
  }

  @BotCommand("관리자", "관리자 전용 명령어")
  @IsAdmin
  async adminOnly(context: ChatContext) {
    await context.reply("관리자만 사용할 수 있는 명령어입니다!");
  }
}
```

### 스케줄링 작업

```typescript
@BatchController
export default class CustomBatchController {
  @Schedule(60000) // 1분마다
  async periodicTask() {
    console.log("주기적 작업 실행 중...");
  }

  @ScheduleMessage("reminder")
  async handleReminder(scheduledMessage: ScheduledMessage) {
    console.log("리마인더:", scheduledMessage.message);
  }
}
```

### 피드 이벤트 처리

```typescript
@FeedController
export default class CustomFeedController {
  @OnInviteUserFeed
  async onUserJoin(context: ChatContext) {
    await context.reply("새로운 멤버를 환영합니다! 🎉");
  }

  @OnPromoteManagerFeed
  async onManagerPromote(context: ChatContext) {
    await context.reply("새로운 관리자가 임명되었습니다! 👑");
  }
}
```

## 고급 기능

### HTTP 웹훅 모드

WebSocket 대신 HTTP 웹훅을 사용하여 더 안정적인 연결을 구성할 수 있습니다.

### 카카오링크

템플릿 메시지를 사용하여 풍부한 콘텐츠를 전송할 수 있습니다.

### 배치 스케줄러

지연된 메시지 전송, 주기적 작업, 리마인더 등을 관리할 수 있습니다.

### 통합 로깅

다양한 로그 레벨(error, warn, info, debug)을 지원하여 효과적인 디버깅이 가능합니다.

## 참조

- [node-iris](https://github.com/Tsuki-Chat/node-iris)

## 라이선스

MIT

## 면책 조항

이 프로젝트는 오직 교육 및 연구 목적으로 제공됩니다. 개발자들은 이 소프트웨어의 오용이나 이로 인한 손상에 대해 책임지지 않습니다. 본인의 책임 하에 사용하시고, 관련 법률 및 서비스 약관을 준수하시기 바랍니다.

This project is provided for educational and research purposes only. The developers are not responsible for any misuse or damage caused by this software. Use it at your own risk and ensure you comply with all applicable laws and terms of service.
