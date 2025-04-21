import open from "open";
import path from "path";
import { isi18nsheetInitialized } from "../lib/user-project";
import { Command } from "./index";

export const editCommand: Command = {
  name: "edit",
  description: "Opens translations Spreadsheet",
  handler,
};

async function handler() {
  if (!(await isi18nsheetInitialized())) {
    throw new Error("i18n-sheet hasn't been initialized for this project.");
  }

  // eslint-disable-next-line global-require,import/no-dynamic-require
  const { spreadsheetId } = require(path.join(
    process.cwd(),
    "i18n-sheet.json"
  ));

  await open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
}
