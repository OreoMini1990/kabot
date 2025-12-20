import { FeedController, Logger } from "@tsuki-chat/node-iris";

@FeedController
class CustomFeedController {
  private logger: Logger;

  constructor() {
    this.logger = new Logger(CustomFeedController.name);
  }

  // @OnFeedMessage
  // async onFeedMessage(context: ChatContext) {
  //   this.logger.info("Feed message received", {
  //     message: context.message,
  //   });
  // }
}

export default CustomFeedController;
