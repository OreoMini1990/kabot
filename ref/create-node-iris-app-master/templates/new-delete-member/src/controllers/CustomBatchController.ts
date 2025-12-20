import { BatchController, Bot, Logger, Schedule } from "@tsuki-chat/node-iris";
import { prisma } from "../prisma";
import { MemberService } from "../services/MemberService";

@BatchController
class CustomBatchController {
  private logger: Logger;
  private memberService: MemberService;
  private membersDatabase: Map<string, { nickname: string; roomId: string }> =
    new Map();

  constructor() {
    this.logger = new Logger(CustomBatchController.name);
    this.memberService = new MemberService();
  }

  /**
   * 3초마다 닉네임 변경 감지
   */
  @Schedule(3000) // 3초마다 실행
  async checkNicknameChanges() {
    try {
      const bot = Bot.getInstance();
      if (!bot) {
        this.logger.error("Bot instance not found");
        return;
      }

      // 현재 모든 멤버 정보 조회
      const query =
        "SELECT enc, nickname, user_id, involved_chat_id FROM db2.open_chat_member";
      const queryResult = await bot.api.query(query, []);

      const currentMembers = new Map<
        string,
        { nickname: string; roomId: string }
      >();

      // 현재 멤버 데이터 처리
      for (const member of queryResult) {
        const userId = member.user_id.toString();
        const nickname = member.nickname;
        const roomId = member.involved_chat_id.toString();

        currentMembers.set(userId, { nickname, roomId });
      }

      // 기존 데이터가 있으면 비교 수행
      if (this.membersDatabase.size > 0) {
        await this.compareAndDetectChanges(currentMembers, bot);
      }

      // 현재 데이터를 기존 데이터로 업데이트
      this.membersDatabase = currentMembers;
    } catch (error) {
      this.logger.error("닉네임 변경 감지 중 오류:", error);
    }
  }

  /**
   * 닉네임 변경 감지 및 처리
   */
  private async compareAndDetectChanges(
    currentMembers: Map<string, { nickname: string; roomId: string }>,
    bot: Bot
  ) {
    for (const [userId, oldData] of this.membersDatabase.entries()) {
      const currentData = currentMembers.get(userId);

      if (!currentData) {
        // 사용자가 방을 나갔거나 데이터가 없음
        continue;
      }

      // 닉네임 변경 감지
      if (oldData.nickname !== currentData.nickname) {
        await this.handleNicknameChange(
          userId,
          oldData.roomId,
          oldData.nickname,
          currentData.nickname,
          bot
        );
      }
    }
  }

  /**
   * 닉네임 변경 처리
   */
  private async handleNicknameChange(
    userId: string,
    roomId: string,
    oldNickname: string,
    newNickname: string,
    bot: Bot
  ) {
    try {
      this.logger.info(
        `닉네임 변경 감지: ${oldNickname} -> ${newNickname} (방: ${roomId})`
      );

      // 1. Member 테이블의 닉네임 업데이트
      await this.updateMemberNickname(userId, roomId, newNickname);

      // 2. MemberService를 통한 닉네임 변경 기록
      await this.memberService.recordNicknameChange(
        userId,
        roomId,
        oldNickname,
        newNickname
      );

      // 3. 채팅방에 알림 메시지 전송
      const message = `📢 닉네임 변경 알림!📢

⚠️기존: ${oldNickname}
↪️변경: ${newNickname}`;
      await bot.api.reply(roomId, message);
    } catch (error) {
      this.logger.error("닉네임 변경 처리 중 오류:", error);
    }
  }

  /**
   * Member 테이블의 닉네임 업데이트
   */
  private async updateMemberNickname(
    userId: string,
    roomId: string,
    newNickname: string
  ) {
    try {
      // Member 정보 업데이트
      const updatedMember = await prisma.member.updateMany({
        where: {
          userId,
          roomId,
        },
        data: {
          nickname: newNickname,
          lastSeen: new Date(),
        },
      });

      if (updatedMember.count > 0) {
        this.logger.info(
          `Member nickname updated: ${newNickname} (${userId} in ${roomId})`
        );
      } else {
        // Member가 없으면 새로 생성 (Room도 함께 생성)
        await prisma.room.upsert({
          where: { roomId },
          update: { updatedAt: new Date() },
          create: {
            roomId,
            name: "알 수 없음",
          },
        });

        await prisma.member.create({
          data: {
            userId,
            roomId,
            nickname: newNickname,
            isActive: true,
            joinedAt: new Date(),
            lastSeen: new Date(),
          },
        });

        this.logger.info(
          `New member created: ${newNickname} (${userId} in ${roomId})`
        );
      }
    } catch (error) {
      this.logger.error(`Error updating member nickname for ${userId}:`, error);
    }
  }
}

export default CustomBatchController;
