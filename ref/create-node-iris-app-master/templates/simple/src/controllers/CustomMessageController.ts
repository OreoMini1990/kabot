import Bot, {
  AllowedRoom,
  BotCommand,
  ChatContext,
  HasParam,
  HasRole,
  HelpCommand,
  KakaoLink,
  MessageController,
  Prefix,
  Throttle,
} from "@tsuki-chat/node-iris";

@Prefix(">>")
@MessageController
class CustomMessageController {
  private kakaoLink?: KakaoLink;
  private bot: Bot;

  constructor() {
    this.kakaoLink = new KakaoLink(
      process.env.IRIS_HOST || "",
      process.env.KAKAOLINK_APP_KEY || "",
      process.env.KAKAOLINK_ORIGIN || ""
    );
    this.bot = Bot.requireInstance();
  }

  @BotCommand(["ping", "핑"], "봇 응답 테스트")
  async pingCommand(context: ChatContext) {
    await context.reply("Pong!");
  }

  // @BotCommand("photo", "테스트 이미지 전송")
  // async photoCommand(context: ChatContext) {
  //   await context.replyImageUrls([
  //     "IMAGE_URL",
  //   ]);
  // }

  @BotCommand("echo", "메시지 따라하기 <메시지>")
  @HasParam
  async echoCommand(context: ChatContext) {
    const text = context.message.param;
    await context.reply(`Echo: ${text}`);
  }

  @HelpCommand("help")
  async helpCommand(context: ChatContext) {
    // HelpCommand decorator automatically generates help text
    // This method body will be replaced by the decorator
  }

  @BotCommand("time")
  async timeCommand(context: ChatContext) {
    const now = new Date();
    const timeStr = now.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    await context.reply(`현재 시간: ${timeStr}`);
  }

  @BotCommand("room")
  async roomCommand(context: ChatContext) {
    const roomType = await context.room.getType();
    const roomInfo = `
🏠 채팅방 정보
• 이름: ${context.room.name}
• ID: ${context.room.id}
• 타입: ${roomType || "알 수 없음"}
    `.trim();

    await context.reply(roomInfo);
  }

  @BotCommand("user")
  async userCommand(context: ChatContext) {
    const userName = await context.sender.getName();
    const userType = await context.sender.getType();
    const userInfo = `
👤 사용자 정보
• 이름: ${userName}
• ID: ${context.sender.id}
• 타입: ${userType || "알 수 없음"}
• 아바타: ${context.sender.avatar.toString()}
    `.trim();

    await context.reply(userInfo);
  }

  @BotCommand("link")
  async linkCommand(context: ChatContext) {
    if (!this.kakaoLink) {
      await context.reply("카카오링크가 설정되지 않았습니다.");
      return;
    }

    try {
      await this.kakaoLink.send(
        context.room.name,
        123417, // 템플릿 ID (실제로는 카카오 개발자 센터에서 발급받은 ID 사용)
        {
          TEXT: "테스트",
        }
      );
    } catch (error) {
      console.error("카카오링크 전송 실패:", error);
      await context.reply("카카오링크 전송에 실패했습니다.");
    }
  }

  @BotCommand("admin")
  @HasRole(["HOST", "MANAGER"])
  async adminOnlyCommand(context: ChatContext) {
    await context.reply("관리자 전용 명령어가 실행되었습니다!");
  }

  @BotCommand("throttle")
  @Throttle(
    3,
    10000,
    async (
      context: ChatContext,
      maxCalls: number,
      windowMs: number,
      msUntilNext: number
    ) => {
      const secondsUntilNext = Math.ceil(msUntilNext / 1000);
      await context.reply(
        `⏱️ 명령어 사용 제한!\n` +
          `• 제한: ${windowMs / 1000}초 내 최대 ${maxCalls}번\n` +
          `• 다음 사용 가능: ${secondsUntilNext}초 후`
      );
    }
  ) // 10초(10000ms) 내 최대 3번
  async throttledCommand(context: ChatContext) {
    await context.reply("제한된 명령어가 실행되었습니다!");
  }

  @BotCommand("botinfo")
  async botInfoCommand(context: ChatContext) {
    const bot = Bot.requireInstance();
    const botInfo = `
**봇 정보**
• 이름: ${bot.name}
• 상태: 연결됨
    `.trim();

    await context.reply(botInfo);
  }

  @BotCommand("restricted")
  @AllowedRoom(["ROOM_ID_1", "ROOM_ID_2"]) // 특정 방에서만 실행 가능
  async restrictedCommand(context: ChatContext) {
    await context.reply("이 명령어는 허용된 방에서만 실행됩니다!");
  }

  @BotCommand("vip")
  @AllowedRoom(["VIP_ROOM_ID"]) // VIP 방에서만 실행
  @HasRole(["HOST", "MANAGER"]) // 관리자만 실행 가능
  async vipCommand(context: ChatContext) {
    await context.reply("VIP 전용 관리자 명령어입니다!");
  }
}

export default CustomMessageController;
