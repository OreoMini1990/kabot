import {
  ChatContext,
  Command,
  DeleteMemberController,
  Logger,
} from "@tsuki-chat/node-iris";
import { MemberService } from "../services/MemberService";

@DeleteMemberController
class CustomDeleteMemberController {
  private logger: Logger;
  private memberService: MemberService;

  constructor() {
    this.logger = new Logger(CustomDeleteMemberController.name);
    this.memberService = new MemberService();
  }

  @Command
  async onDeleteMember(context: ChatContext) {
    try {
      // MemberService를 통해 퇴장 처리 및 메시지 생성
      // feedType 확인하여 추방인지 자진 퇴장인지 구분
      const isKick =
        context.message.msg &&
        typeof context.message.msg === "object" &&
        "feedType" in context.message.msg &&
        context.message.msg.feedType === 6;

      const farewell = await this.memberService.handleMemberLeave(context);
      await context.reply(farewell);

      if (isKick) {
        const feedData = context.message.msg as any;
        const kickedUserName = feedData.member?.nickName || "알 수 없는 사용자";
        const kickerName = await context.sender.getName();
        this.logger.info(
          `⚠️${kickerName}님이 ${kickedUserName}님을 [${context.room.name}] 채팅방에서 추방했습니다.⚠️`
        );
        await context.reply(
          `⚠️${kickerName}님이 ${kickedUserName}님을 내보내기(추방)하였습니다.⚠️`
        );
      }
    } catch (error) {
      this.logger.error("멤버 퇴장 처리 중 오류:", error);
    }
  }
}

export default CustomDeleteMemberController;
