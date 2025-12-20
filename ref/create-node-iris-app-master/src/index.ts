#!/usr/bin/env node

import chalk from "chalk";
import { execSync } from "child_process";
import { Command } from "commander";
import fs from "fs-extra";
import inquirer from "inquirer";
import ora from "ora";
import path from "path";

const program = new Command();

interface TemplateConfig {
  name: string;
  description: string;
  path: string;
}

interface ProjectAnswers {
  projectName: string;
  template: string;
  description: string;
  author: string;
  packageManager: "npm" | "pnpm" | "yarn";
  installDependencies: boolean;
}

const TEMPLATES: TemplateConfig[] = [
  {
    name: "simple",
    description:
      "Simple bot template with basic message handlers and controllers",
    path: "simple",
  },
  {
    name: "new-delete-member",
    description:
      "Bot template that handles member join/leave events and logs them",
    path: "new-delete-member",
  },
];

async function main() {
  console.log(chalk.blue.bold("🤖 Create Node Iris App"));
  console.log(chalk.gray("Easily start your KakaoTalk bot project!\n"));

  const answers = await inquirer.prompt<ProjectAnswers>([
    {
      type: "input",
      name: "projectName",
      message: "Project name:",
      default: "my-iris-bot",
      validate: (input: string) => {
        if (!input.trim()) {
          return "Project name is required.";
        }
        if (!/^[a-zA-Z0-9-_]+$/.test(input)) {
          return "Project name can only contain letters, numbers, hyphens, and underscores.";
        }
        return true;
      },
    },
    {
      type: "list",
      name: "template",
      message: "Select a template:",
      choices: TEMPLATES.map((t) => ({
        name: `${t.name} - ${t.description}`,
        value: t.name,
      })),
    },
    {
      type: "input",
      name: "description",
      message: "Project description (optional):",
      default: "",
    },
    {
      type: "input",
      name: "author",
      message: "Author name (optional):",
      default: "",
    },
    {
      type: "list",
      name: "packageManager",
      message: "Package manager:",
      choices: [
        { name: "pnpm (recommended)", value: "pnpm" },
        { name: "npm", value: "npm" },
        { name: "yarn", value: "yarn" },
      ],
      default: "pnpm",
    },
    {
      type: "confirm",
      name: "installDependencies",
      message: "Install dependencies automatically?",
      default: true,
    },
  ]);

  await createProject(answers);
}

async function createProject(answers: ProjectAnswers) {
  const {
    projectName,
    template,
    description,
    author,
    packageManager,
    installDependencies,
  } = answers;

  const targetDir = path.resolve(process.cwd(), projectName);
  const templateDir = path.resolve(__dirname, "..", "templates", template);

  // Check if project directory exists
  if (fs.existsSync(targetDir)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: "confirm",
        name: "overwrite",
        message: `Directory '${projectName}' already exists. Overwrite?`,
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(chalk.yellow("Project creation cancelled."));
      return;
    }

    await fs.remove(targetDir);
  }

  const spinner = ora("Creating project...").start();

  try {
    // Copy template
    await fs.copy(templateDir, targetDir);

    // Modify package.json
    const packageJsonPath = path.join(targetDir, "package.json");
    const packageJson = await fs.readJson(packageJsonPath);

    // Template variable substitution
    const packageJsonString = JSON.stringify(packageJson, null, 2)
      .replace(/\{\{PROJECT_NAME\}\}/g, projectName)
      .replace(
        /\{\{PROJECT_DESCRIPTION\}\}/g,
        description || "KakaoTalk bot project"
      )
      .replace(/\{\{AUTHOR_NAME\}\}/g, author)
      .replace(/\{\{NODE_IRIS_VERSION\}\}/g, "latest"); // Replace with actual version later

    await fs.writeFile(packageJsonPath, packageJsonString);

    // Create .env file (copy from .env.example)
    const envExamplePath = path.join(targetDir, ".env.example");
    const envPath = path.join(targetDir, ".env");
    if (await fs.pathExists(envExamplePath)) {
      await fs.copy(envExamplePath, envPath);
    }

    spinner.succeed("Project created successfully!");

    // Install dependencies
    if (installDependencies) {
      const installSpinner = ora("Installing dependencies...").start();

      try {
        process.chdir(targetDir);

        let installCommand: string;
        switch (packageManager) {
          case "pnpm":
            installCommand = "pnpm install";
            break;
          case "yarn":
            installCommand = "yarn install";
            break;
          default:
            installCommand = "npm install";
        }

        execSync(installCommand, { stdio: "pipe" });
        installSpinner.succeed("Dependencies installed successfully!");
      } catch (error) {
        installSpinner.fail("Failed to install dependencies.");
        console.log(chalk.yellow("Please install dependencies manually:"));
        console.log(chalk.gray(`cd ${projectName}`));
        console.log(chalk.gray(`${packageManager} install`));
      }
    }

    // Success message and next steps
    console.log("\n" + chalk.green.bold("🎉 Project created successfully!"));
    console.log("\nNext steps:");
    console.log(chalk.cyan(`1. cd ${projectName}`));
    if (!installDependencies) {
      console.log(chalk.cyan(`2. ${packageManager} install`));
      console.log(chalk.cyan("3. Configure .env file with your bot settings"));
      console.log(chalk.cyan(`4. ${packageManager} run dev`));
    } else {
      console.log(chalk.cyan("2. Configure .env file with your bot settings"));
      console.log(chalk.cyan(`3. ${packageManager} run dev`));
    }

    console.log("\n📖 Documentation: https://github.com/Tsuki-Chat/node-iris");
    console.log(
      "🐛 Report issues: https://github.com/Tsuki-Chat/node-iris/issues"
    );
  } catch (error) {
    spinner.fail("Failed to create project.");
    console.error(chalk.red("Error:"), error);
    process.exit(1);
  }
}

program
  .name("create-node-iris-app")
  .description("Node Iris template generator for KakaoTalk bot projects")
  .version("1.0.0")
  .argument("[project-name]", "Project name")
  .option("-t, --template <template>", "Template to use", "simple")
  .action(async (projectName) => {
    if (projectName) {
      // If project name is provided as argument, skip some steps
      const answers: ProjectAnswers = {
        projectName,
        template: program.opts().template || "simple",
        description: "",
        author: "",
        packageManager: "pnpm",
        installDependencies: true,
      };

      // Ask for additional info only
      const additionalAnswers = await inquirer.prompt([
        {
          type: "input",
          name: "description",
          message: "Project description (optional):",
          default: "",
        },
        {
          type: "input",
          name: "author",
          message: "Author name (optional):",
          default: "",
        },
        {
          type: "list",
          name: "packageManager",
          message: "Package manager:",
          choices: [
            { name: "pnpm (recommended)", value: "pnpm" },
            { name: "npm", value: "npm" },
            { name: "yarn", value: "yarn" },
          ],
          default: "pnpm",
        },
        {
          type: "confirm",
          name: "installDependencies",
          message: "Install dependencies automatically?",
          default: true,
        },
      ]);

      Object.assign(answers, additionalAnswers);
      await createProject(answers);
    } else {
      await main();
    }
  });

if (require.main === module) {
  program.parse();
}

export { createProject, main };
