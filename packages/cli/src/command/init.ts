import inquirer from "inquirer";
import readline from "readline";
import { authorize, parseCredentialsFile } from "../lib/auth";
import { scriptTemplates } from "../script-template";
import {
  getI18nsheetInitState,
  hasPackageJson,
  initPackageJson,
  installDependencies,
  registerScript,
  resolveAppTitle,
  saveI18nsheetConfig,
} from "../lib/user-project";
import { createI18nsheet } from "../lib/i18n-sheet-generator";
import { shareFileWithEmail } from "../lib/drive";
import { generateScript } from "../lib/script-generator";
import { fileExists } from "../lib/file-helpers";
import { Command } from "./index";
import { isI18nsheetCompliantSpreadsheet } from "../lib/i18n-sheet-validator";

const GOOGLE_ACCOUNT_SETUP_TUTORIAL_URL =
  "https://github.com/sundarshahi/i18n-sheet#-prerequisites";

const readLineAsync = () => {
  const rl = readline.createInterface({
    input: process.stdin,
  });

  return new Promise((resolve) => {
    rl.prompt();
    rl.on("line", (line) => {
      rl.close();
      resolve(line);
    });
  });
};

export const initCommand: Command = {
  name: "init",
  description: "Initializes i18n-sheet in current working directory",
  handler,
};

async function handler() {
  const i18nsheetConfigState = await getI18nsheetInitState();

  if (i18nsheetConfigState.init) {
    throw new Error("i18n-sheet has been already set up in this project.");
  }

  if (!(await hasPackageJson())) {
    const { confirmPackageJsonCreation } = await inquirer.prompt([
      {
        name: "confirmPackageJsonCreation",
        type: "confirm",
        message:
          '⚠️ There is no "package.json" in the current working directory. Would you like to initialize one?',
      },
    ]);

    if (!confirmPackageJsonCreation) {
      throw new Error(
        'i18n-sheet cannot continue the initialization without "package.json" file.'
      );
    }

    await initPackageJson();

    console.log('Minimalistic "package.json" file has been created.');
  }

  const appTitle = await resolveAppTitle();
  const defaultSpreadsheetTitle = appTitle
    ? `${appTitle} Translations`
    : "Translations";

  const { difficultyChoice }: { difficultyChoice: string } =
    await inquirer.prompt([
      {
        name: "difficultyChoice",
        type: "rawlist",
        message: "Choose set of questions:",
        choices: [
          "🐣 Simple - only essential questions, less customization in favor of reasonable defaults",
          "💪 Advanced - customize everything as you like",
        ],
      },
    ]);
  const simpleMode = difficultyChoice.includes("Simple");

  const { existingSpreadsheet }: { existingSpreadsheet: string } =
    await inquirer.prompt(
      [
        {
          name: "existingSpreadsheet",
          type: "input",
          message:
            "🔗 Paste existing i18n-sheet-compatible spreadsheet url or id. If you want to initialize a new one, just leave this blank and press enter.",
          default: "",
          validate(input: string) {
            if (!input) {
              return true;
            }

            try {
              const parsedURL = new URL(input);

              if (
                parsedURL.origin !== "https://docs.google.com" ||
                !parsedURL.pathname.startsWith("/spreadsheets/d/")
              ) {
                return "Invalid Spreadsheet URL";
              }
            } catch (error) {
              if (!/^[-_0-9A-Za-z]{44}$/.test(input)) {
                return "Invalid Spreadsheet ID";
              }
            }

            return true;
          },
        },
      ],
      simpleMode ? { existingSpreadsheet: "" } : {}
    );

  const answers: {
    credentials: string;
    title: string;
    includeManual: boolean;
    maxLevels: number;
    languages: string;
    outDir: string;
    email: string;
    scriptTemplate: string;
    scriptPath: string;
    scriptName: string;
    example: boolean;
  } = await inquirer.prompt(
    [
      {
        name: "credentials",
        type: "input",
        message:
          "🔑 Which file stores your Google Service Account credentials?",
        validate(input: string) {
          return parseCredentialsFile(input)
            .then(() => true)
            .catch((error) =>
              error.code === "ENOENT"
                ? `Provided file does not exist. Perhaps Google Service account set up tutorial may help you to create one?: ${GOOGLE_ACCOUNT_SETUP_TUTORIAL_URL}`
                : error.message
            );
        },
        default: ".credentials.json",
      },
      {
        name: "title",
        type: "input",
        message: "🏷 Choose a title for your translations spreadsheet file:",
        default: defaultSpreadsheetTitle,
      },
      {
        name: "includeManual",
        type: "confirm",
        message:
          "📖 Do you want to create tall header with user manual for non-technical people?",
        default: true,
      },
      {
        name: "maxLevels",
        type: "number",
        message:
          "🪜 How deep (maximally) in terms of levels your translations will be?",
        validate(input: number) {
          if (input < 1) {
            return "Translation keys should be at least one level deep";
          }

          return true;
        },
        default: 5,
      },
      {
        name: "languages",
        type: "input",
        message: "🌎 Pick codes of languages to be supported:",
        validate(input: string) {
          return input
            .split(/[ ,]/g)
            .filter((entry) => entry.trim().length > 0)
            .every((languageCode) => /^[a-z]{2}$/.test(languageCode.trim()));
        },
        default: "en, pl",
      },
      {
        name: "example",
        type: "confirm",
        message:
          "📝 Do you want to include some exemplary translation key entries in the spreadsheet?",
        default: true,
      },
      {
        name: "email",
        type: "input",
        message:
          "📧 Enter your GMail address so I can share the spreadsheet with you",
        validate(input: string) {
          return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input);
        },
      },
      {
        name: "scriptTemplate",
        type: "rawlist",
        message: "📜 Select desired format of translations output",
        choices: scriptTemplates.map(({ title }) => title),
      },
      {
        name: "outDir",
        type: "input",
        message: "🎯 Where translation files should be stored?",
        default: "./i18n/",
      },
      {
        name: "scriptPath",
        type: "input",
        message: "📄 Where should I put translation script?",
        default: "./scripts/fetch-translations.ts",
      },
      {
        name: "scriptName",
        type: "input",
        message:
          '⌨️ Which "npm run" command you would like to type to run translation fetching',
        default: "translations",
      },
    ],
    {
      ...(simpleMode && {
        ...((await fileExists(".credentials.json"))
          ? { credentials: ".credentials.json" }
          : {}),
        title: defaultSpreadsheetTitle,
        includeManual: true,
        maxLevels: 5,
        outDir: "./i18n/",
        scriptPath: "./scripts/fetch-translations.ts",
        scriptName: "translations",
        example: true,
      }),
      ...(existingSpreadsheet && {
        title: "",
        includeManual: false,
        maxLevels: 0,
        email: "",
        example: false,
        languages: "",
      }),
      ...i18nsheetConfigState.boilerplateConfig,
    }
  );

  console.log("Authorizing with Google API using provided credentials...");
  const credentials = await parseCredentialsFile(answers.credentials);
  const auth = await authorize(credentials, [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
  ]);

  console.log("Installing dev dependencies...");
  await installDependencies([
    { dev: true, packageName: "i18n-sheet-parser" },
    { dev: true, packageName: "i18n-json-writer" },
    { dev: true, packageName: "ts-node" },
    { dev: true, packageName: "rxjs" },
  ]);

  const languages = answers.languages
    .split(/[ ,]/g)
    .filter((entry) => entry.trim().length > 0)
    .map((languageCode) => languageCode.trim());

  let spreadsheetId: string;
  let spreadsheetUrl: string;

  if (!existingSpreadsheet) {
    const googleSpreadsheetResponse = await retryOnErrorLoop(
      async () => {
        console.log("Creating Google Spreadsheet...");
        return createI18nsheet({
          auth,
          languages,
          maxTranslationKeyLevel: answers.maxLevels,
          includeManual: answers.includeManual,
          includeExample: answers.example,
          exampleRows: i18nsheetConfigState?.boilerplateConfig?.exampleRows,
          title: answers.title,
        });
      },
      async (error) => {
        if (error.errors[0].reason === "accessNotConfigured") {
          console.log("⚠️ Google Sheets API needs to be enabled.");
          console.log(
            `Please go to: https://console.developers.google.com/apis/library/sheets.googleapis.com?project=${auth.projectId} and click "ENABLE" button.`
          );
          console.log(
            "Then, please go back to the CLI and press enter to continue."
          );

          await readLineAsync();

          return;
        }

        throw error;
      }
    );

    if (
      !googleSpreadsheetResponse.data.spreadsheetId ||
      !googleSpreadsheetResponse.data.spreadsheetUrl
    ) {
      throw new Error("Error while creating spreadsheet");
    }

    spreadsheetId = googleSpreadsheetResponse.data.spreadsheetId;
    spreadsheetUrl = googleSpreadsheetResponse.data.spreadsheetUrl;

    await retryOnErrorLoop(
      async () => {
        console.log(`Sharing Spreadsheet with ${answers.email}...`);
        await shareFileWithEmail({
          auth,
          role: "writer",
          email: answers.email,
          fileId: spreadsheetId,
          sendNotificationEmail: true,
        });
      },
      async (error) => {
        if (error.errors[0].reason === "accessNotConfigured") {
          console.log("⚠️ Drive API needs to be enabled.");
          console.log(
            `Please go to: https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=${auth.projectId} and click "ENABLE" button.`
          );
          console.log(
            "Then, please go back to the CLI and press enter to continue."
          );

          await readLineAsync();

          return;
        }

        throw error;
      }
    );
  } else {
    spreadsheetUrl =
      existingSpreadsheet.length === 44
        ? `https://docs.google.com/spreadsheets/d/${existingSpreadsheet}`
        : existingSpreadsheet;

    // eslint-disable-next-line prefer-destructuring
    spreadsheetId = spreadsheetUrl.split("/")[5];

    console.log(`Validating ${spreadsheetUrl} spreadsheet structure...`);

    if (
      !(await isI18nsheetCompliantSpreadsheet({ spreadsheetId, credentials }))
    ) {
      throw new Error(
        `Spreadsheet "${spreadsheetUrl}" does not seem to have i18n-sheet-compliant format`
      );
    }
  }

  await saveI18nsheetConfig({
    // eslint-disable-next-line global-require
    cliVersion: require("../../package.json").version,
    credentialsFile: answers.credentials,
    spreadsheetId,
    userInput: answers,
  });

  const scriptTemplateFileName = scriptTemplates.find(
    ({ title }) => title === answers.scriptTemplate
  )!.fileName;

  console.log("Generating and registering translation script...");
  await generateScript(scriptTemplateFileName, answers.scriptPath, {
    "{{OUT_DIR_PATH}}": answers.outDir.endsWith("/")
      ? answers.outDir
      : `${answers.outDir}/`,
  });

  await registerScript(
    answers.scriptName,
    `node --loader ts-node/esm ${answers.scriptPath}`
  );

  console.log("\n🎉 i18n-sheet has been successfully initialized! 🎉\n");
  console.log(
    `📝 Translation spreadsheet is available here: ${spreadsheetUrl}`
  );
  console.log(
    `💻 To fetch the translations type: "npm run ${answers.scriptName}"`
  );
}

async function retryOnErrorLoop<T>( //
  task: () => Promise<T>,
  // eslint-disable-next-line no-unused-vars
  errorHandler: (error: any) => Promise<void>
) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await task();
    } catch (error: any) {
      // eslint-disable-next-line no-await-in-loop
      await errorHandler(error);
    }
  }
}
