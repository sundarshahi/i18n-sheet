import path from "path";
import inquirer from "inquirer";
import { promises as fs } from "fs";
import {
  isi18nsheetInitialized,
  listDependencies,
  removeDependencies,
  unregisterScript,
} from "../lib/user-project";
import { Command } from "./index";
import { deleteDriveFile } from "../lib/drive";
import { authorize, parseCredentialsFile } from "../lib/auth";
import { fileExists } from "../lib/file-helpers";

export const uninstallCommand: Command = {
  name: "uninstall",
  description: "Uninstall i18n-sheet from your project",
  handler,
};

async function handler() {
  if (!(await isi18nsheetInitialized())) {
    throw new Error("i18n-sheet hasn't been initialized for this project.");
  }

  const prodDependencies = await listDependencies();

  // eslint-disable-next-line global-require,import/no-dynamic-require
  const i18nsheetConfig = require(path.join(process.cwd(), "i18n-sheet.json"));

  const credentials = await parseCredentialsFile(i18nsheetConfig.credentials);
  const auth = await authorize(credentials, [
    "https://www.googleapis.com/auth/drive",
  ]);
  const { spreadsheetId } = i18nsheetConfig;
  const { outDir, scriptPath, scriptName } = i18nsheetConfig.userInput;
  const outDirExists = await fileExists(outDir);

  const {
    removeSpreadsheet,
    removeOutDir,
    removeCredentials,
    removeRxJs = false,
    removeTsNode = false,
  }: Record<string, boolean> = await inquirer.prompt([
    {
      name: "removeSpreadsheet",
      type: "confirm",
      message: "Remove Spreadsheet?",
    },
    {
      name: "removeCredentials",
      type: "confirm",
      message: `Remove "${i18nsheetConfig.credentials}" file?`,
    },
    ...(outDirExists
      ? [
          {
            name: "removeOutDir",
            type: "confirm",
            message: `Remove translations output directory ("${outDir}")?`,
          },
        ]
      : []),
    ...(!prodDependencies.includes("rxjs")
      ? [
          {
            name: "removeRxJs",
            type: "confirm",
            message: 'Remove "rxjs" dependency?',
          },
        ]
      : []),
    ...(!prodDependencies.includes("ts-node")
      ? [
          {
            name: "removeTsNode",
            type: "confirm",
            message: 'Remove "ts-node" dependency?',
          },
        ]
      : []),
  ]);

  if (removeSpreadsheet) {
    process.stdout.write(`Removing Spreadsheet ${spreadsheetId}... `);
    await deleteDriveFile({
      auth,
      fileId: spreadsheetId,
    });
    process.stdout.write("✅ Done \n");
  }

  if (removeOutDir) {
    process.stdout.write(
      `Removing translations output directory "${outDir}"... `
    );
    await fs.rm(outDir, { recursive: true });
    process.stdout.write("✅ Done \n");
  }

  if (removeCredentials) {
    process.stdout.write(`Removing "${i18nsheetConfig.credentials}" file... `);
    await fs.rm(i18nsheetConfig.credentials);
    process.stdout.write("✅ Done \n");
  }

  process.stdout.write("Removing translation fetch script... ");
  await fs.rm(scriptPath);
  await unregisterScript(scriptName);
  process.stdout.write("✅ Done \n");

  process.stdout.write("Removing i18n-sheet dependencies... ");
  const i18nsheetDeps = await listDependencies({ devDependencies: true }).then(
    (deps) => deps.filter((dep) => dep.startsWith("i18n-sheet"))
  );
  if (removeTsNode) {
    i18nsheetDeps.push("ts-node");
  }
  if (removeRxJs) {
    i18nsheetDeps.push("rxjs");
  }
  await removeDependencies(i18nsheetDeps);
  process.stdout.write("✅ Done \n");

  process.stdout.write('Removing "i18n-sheet.json" file... ');
  await fs.rm("i18n-sheet.json");
  process.stdout.write("✅ Done \n");
}
