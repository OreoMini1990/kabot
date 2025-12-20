import {
  ChatContext,
  Command,
  Logger,
  NewMemberController,
} from "@tsuki-chat/node-iris";
import { MemberService } from "../services/MemberService";

@NewMemberController
class CustomNewMemberController {
  private logger: Logger;
  private memberService: MemberService;

  constructor() {
    this.logger = new Logger(CustomNewMemberController.name);
    this.memberService = new MemberService();
  }

  @Command
  async onNewMember(context: ChatContext) {
    try {
      // MemberService를 통해 입장 처리 및 메시지 생성
      const welcomeMessage = await this.memberService.handleMemberJoin(context);
      await context.reply(welcomeMessage);

      const userName = await context.sender.getName();
      this.logger.info(
        `${userName}님이 [${context.room.name}] 채팅방에 입장했습니다.`
      );
    } catch (error) {
      this.logger.error("멤버 입장 처리 중 오류:", error);
      await context.reply("입장 처리 중 오류가 발생했습니다.");
    }
  }
}

export default CustomNewMemberController;
