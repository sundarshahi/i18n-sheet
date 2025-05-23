#!/usr/bin/env node

import { commands } from "./command";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log("Type: i18n-sheet <command>\n");
  console.log("Available commands:");
  commands.forEach((command) =>
    console.log(`${command.name} - ${command.description}`)
  );

  process.exit(0);
}

const inputCommand = args[0];
const command = commands.find(({ name }) => name === inputCommand);

if (!command) {
  console.error(`Unknown command: ${inputCommand}`);
  process.exit(1);
}

command.handler().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
