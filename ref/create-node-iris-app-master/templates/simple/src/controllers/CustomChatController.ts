import { ChatController, Logger } from "@tsuki-chat/node-iris";

@ChatController
class CustomChatController {
  private logger: Logger;

  constructor() {
    this.logger = new Logger(CustomChatController.name);
  }

  // @Command
  // async onChat(context: ChatContext) {
  //   this.logger.info("Chat message received", {
  //     data: context.raw,
  //   });
  // }
}

export default CustomChatController;
