import { Bot, Logger, type LogLevel } from "@tsuki-chat/node-iris";
import "dotenv/config";

// Import controller classes
import CustomBatchController from "./controllers/CustomBatchController";
import CustomDeleteMemberController from "./controllers/CustomDeleteMemberController";
import CustomErrorController from "./controllers/CustomErrorController";
import CustomNewMemberController from "./controllers/CustomNewMemberController";
import CustomUnknownController from "./controllers/CustomUnknownController";

const appName = "Create-Node-Iris-App";

// Controller configuration
const controllers = [
  CustomNewMemberController,
  CustomDeleteMemberController,
  CustomUnknownController,
  CustomErrorController,
  CustomBatchController,
];

class App {
  private bot: Bot;
  private logger: Logger;

  constructor() {
    if (!process.env.IRIS_URL) {
      throw new Error("Need IRIS_URL environment variable");
    }
    this.logger = new Logger("Bootstrap");
    this.bot = new Bot(appName, process.env.IRIS_URL, {
      saveChatLogs: process.env.SAVE_CHAT_LOGS === "true",
      autoRegisterControllers: false, // Disable auto-registration
      logLevel: (process.env.LOG_LEVEL as LogLevel) || "debug",
      // httpMode: true, //If you want to use webhook mode, uncomment these lines
      // webhookPort: 3000,
      // webhookPath: "/webhook/message",
    });

    // Register controllers manually
    this.bot.registerControllers(controllers);
  }

  public async start() {
    try {
      if (!process.env.IRIS_URL) {
        throw new Error("Need IRIS_URL environment variable");
      }
      this.logger.info(`${this.bot.name} is starting...`);
      await this.bot.run();
    } catch (error) {
      this.logger.error(`${this.bot.name} failed to start:`, error);
      process.exit(1);
    }
  }

  public async stop() {
    try {
      this.bot.stop();
    } catch (error) {
      this.logger.error(`${this.bot.name} failed to stop:`, error);
    }
  }
}

export default App;
