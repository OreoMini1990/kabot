import { ChatContext } from "@tsuki-chat/node-iris";
import { prisma } from "../prisma";

export class MemberService {
  /**
   * 사용자 입장 처리
   */
  async handleMemberJoin(context: ChatContext) {
    const userId = context.sender.id.toString();
    const roomId = context.room.id.toString();
    const nickname = (await context.sender.getName()) || "알 수 없음";

    // 1. Room 정보 생성/업데이트
    await prisma.room.upsert({
      where: { roomId },
      update: {
        name: context.room.name || "알 수 없음",
        updatedAt: new Date(),
      },
      create: {
        roomId,
        name: context.room.name || "알 수 없음",
      },
    });

    // 2. Member 정보 생성/업데이트 (활성화)
    const member = await prisma.member.upsert({
      where: {
        userId_roomId: {
          userId,
          roomId,
        },
      },
      update: {
        nickname,
        isActive: true,
        lastSeen: new Date(),
      },
      create: {
        userId,
        roomId,
        nickname,
        isActive: true,
        joinedAt: new Date(),
        lastSeen: new Date(),
      },
    });

    // 3. 입장 기록 저장
    await prisma.memberActivity.create({
      data: {
        userId,
        roomId,
        nickname,
        activityType: "JOIN",
      },
    });

    // 4. 입장 메시지 생성
    const joinCount = await this.getJoinCount(userId, roomId);
    const joinMessage = this.generateJoinMessage(nickname, joinCount);

    // 5. 채팅 정보 추가
    const chatInfo = await this.getChatInfo(userId, roomId);

    return `${joinMessage}\n\n${chatInfo}`;
  }

  /**
   * 사용자 퇴장 처리
   */
  async handleMemberLeave(context: ChatContext) {
    let userId = context.sender.id.toString();
    let nickname = (await context.sender.getName()) || "알 수 없음";
    const roomId = context.room.id.toString();

    // feedType이 6인 경우 (추방), member 정보 사용
    if (
      context.message.msg &&
      typeof context.message.msg === "object" &&
      "feedType" in context.message.msg &&
      context.message.msg.feedType === 6
    ) {
      const feedData = context.message.msg as any;
      if (feedData.member) {
        userId = feedData.member.userId.toString();
        nickname = feedData.member.nickName || "알 수 없음";
      }
    }

    // 1. Member 상태 업데이트 (비활성화)
    await prisma.member.updateMany({
      where: {
        userId,
        roomId,
      },
      data: {
        isActive: false,
        lastSeen: new Date(),
      },
    });

    // 2. 퇴장 기록 저장
    await prisma.memberActivity.create({
      data: {
        userId,
        roomId,
        nickname,
        activityType: "LEAVE",
      },
    });

    // 3. 퇴장 메시지 생성
    const leaveCount = await this.getLeaveCount(userId, roomId);
    const leaveMessage = this.generateLeaveMessage(nickname, leaveCount);

    // 4. 채팅 정보 추가
    const chatInfo = await this.getChatInfo(userId, roomId);

    return `${leaveMessage}\n\n${chatInfo}`;
  }

  /**
   * 입장 횟수 조회
   */
  private async getJoinCount(userId: string, roomId: string): Promise<number> {
    const joinCount = await prisma.memberActivity.count({
      where: {
        userId,
        roomId,
        activityType: "JOIN",
      },
    });
    return joinCount;
  }

  /**
   * 퇴장 횟수 조회
   */
  private async getLeaveCount(userId: string, roomId: string): Promise<number> {
    const leaveCount = await prisma.memberActivity.count({
      where: {
        userId,
        roomId,
        activityType: "LEAVE",
      },
    });
    return leaveCount;
  }

  /**
   * 입장 메시지 생성
   */
  private generateJoinMessage(nickname: string, joinCount: number) {
    const isFirstTime = joinCount === 1;

    const welcomeText = isFirstTime
      ? `${nickname}님 오신 것을 환영해요!🎉`
      : `${nickname}님 돌아오신 것을 환영해요!🎉`;

    return `🎟 《 입장 : ${welcomeText}》${"\u200B".repeat(
      500
    )}\n🎟 《 입장 수 》${joinCount}회`;
  }

  /**
   * 퇴장 메시지 생성
   */
  private generateLeaveMessage(nickname: string, leaveCount: number) {
    return `🎟 《 퇴장 : ${nickname}님이 채팅방을 나가셨습니다.👋》${"\u200B".repeat(
      500
    )}\n🎟 《 퇴장 수 》${leaveCount}회`;
  }

  /**
   * 채팅 정보 조회
   */
  async getChatInfo(userId: string, roomId: string) {
    // Member 정보 조회
    const member = await prisma.member.findUnique({
      where: {
        userId_roomId: {
          userId,
          roomId,
        },
      },
    });

    if (!member) {
      return "사용자 정보를 찾을 수 없습니다.";
    }

    // 입장/퇴장 횟수 계산
    const joinCount = await this.getJoinCount(userId, roomId);
    const leaveCount = await this.getLeaveCount(userId, roomId);

    // 최근 활동 기록 조회 (입퇴장 + 닉변 통합)
    const activities = await prisma.memberActivity.findMany({
      where: {
        userId,
        roomId,
      },
      orderBy: {
        timestamp: "desc",
      },
      take: 15, // 조금 더 많이 가져오기
    });

    return this.formatChatInfo(member, joinCount, leaveCount, activities);
  }

  /**
   * 채팅 정보 포맷팅
   */
  private formatChatInfo(
    member: any,
    joinCount: number,
    leaveCount: number,
    activities: any[]
  ) {
    const firstJoin = member.joinedAt
      ? new Intl.DateTimeFormat("ko-KR", {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(member.joinedAt))
      : "기록 없음";

    const lastSeen = member.lastSeen
      ? new Intl.DateTimeFormat("ko-KR", {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(member.lastSeen))
      : "기록 없음";

    let message = `┏📑 《 채팅 정보 》
┣━━━━━━━━━━━━━━
┃🎟 【입장 수】${joinCount}회
┃🚪 【퇴장 수】${leaveCount}회
┃[ 처음 입장 ] : [${firstJoin}]
┃[ 마지막 활동 ] : [${lastSeen}]
┃[ 현재 상태 ] : ${member.isActive ? "✅ 방에 있음" : "❌ 방을 나감"}
┗━━━━━━━━━━━━━━

┏📜 《 활동 기록 》
┣━━━━━━━━━━━━━━`;

    // 모든 활동 기록 (입퇴장 + 닉변 통합 처리)
    if (activities.length > 0) {
      activities.forEach((activity) => {
        const timestamp = new Intl.DateTimeFormat("ko-KR", {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(activity.timestamp));

        if (activity.activityType === "NICKNAME_CHANGE") {
          // 닉네임 변경 기록
          message += `\n[${timestamp}] 닉변: ${activity.oldNickname} → ${activity.newNickname}`;
        } else {
          // 입퇴장 기록
          const action = activity.activityType === "JOIN" ? "입장" : "퇴장";
          const activityNickname = activity.nickname;
          message += `\n[${timestamp}] ${activityNickname} 닉네임으로 ${action}`;
        }
      });
    } else {
      message += "\n활동 기록이 없습니다.";
    }

    message += "\n┗━━━━━━━━━━━━━━";

    return message;
  }

  /**
   * 닉네임 변경 기록 저장
   */
  async recordNicknameChange(
    userId: string,
    roomId: string,
    oldNickname: string,
    newNickname: string
  ) {
    // 닉네임 변경 기록을 MemberActivity에 저장
    await prisma.memberActivity.create({
      data: {
        userId,
        roomId,
        nickname: newNickname, // 변경 후 닉네임
        activityType: "NICKNAME_CHANGE",
        oldNickname,
        newNickname,
      },
    });

    // Member 정보 업데이트
    await prisma.member.updateMany({
      where: {
        userId,
        roomId,
      },
      data: {
        nickname: newNickname,
        lastSeen: new Date(),
      },
    });
  }

  /**
   * 멤버 정보 조회
   */
  async getMemberInfo(userId: string, roomId: string) {
    const member = await prisma.member.findUnique({
      where: {
        userId_roomId: {
          userId,
          roomId,
        },
      },
    });

    const activities = await prisma.memberActivity.findMany({
      where: {
        userId,
        roomId,
      },
      orderBy: {
        timestamp: "desc",
      },
      take: 10,
    });

    return { member, activities };
  }
}
