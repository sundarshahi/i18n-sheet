import { promises as fs } from "fs";
import path from "path";
import util from "util";
import { fileExists } from "./file-helpers";

const exec = util.promisify(require("child_process").exec);

const I18N_SHEET_CONFIG_FILE_NAME = "i18n-sheet.json";

type I18NSheetConfig = {
  cliVersion: string;
  spreadsheetId: string;
  credentialsFile: string;
  userInput: Record<string, unknown>;
  boilerplate?: boolean;
  exampleRows?: [string, string][];
};

type DependencyToInstall = {
  dev: boolean;
  packageName: string;
  version?: string;
};

export type I18nsheetInitState =
  | { init: true }
  | { init: false; boilerplateConfig?: Partial<I18NSheetConfig> };

const resolvePackageJsonPath = () => path.join(process.cwd(), "package.json");

export async function hasPackageJson() {
  return fileExists(resolvePackageJsonPath());
}

export async function resolveAppTitle() {
  if (!(await hasPackageJson())) {
    return undefined;
  }

  const packageJsonBuffer = await fs.readFile(resolvePackageJsonPath());

  try {
    const parsedPackageJson = JSON.parse(packageJsonBuffer.toString());

    if (typeof parsedPackageJson.name !== "string") {
      return undefined;
    }

    return (parsedPackageJson as any).name as string;
  } catch {
    return undefined;
  }
}

const getI18nsheetConfigFilePath = () =>
  path.join(process.cwd(), I18N_SHEET_CONFIG_FILE_NAME);

export async function isi18nsheetInitialized() {
  const initState = await getI18nsheetInitState();

  return initState.init;
}

export async function getI18nsheetInitState(): Promise<I18nsheetInitState> {
  const i18nsheetConfigFilePath = getI18nsheetConfigFilePath();

  if (!(await fileExists(i18nsheetConfigFilePath))) {
    return { init: false };
  }

  try {
    const i18nsheetConfig = await loadI18nsheetConfig();

    if (i18nsheetConfig.boilerplate) {
      return {
        init: false,
        boilerplateConfig: i18nsheetConfig.userInput,
      };
    }
    // eslint-disable-next-line no-empty
  } catch (error) {}

  return {
    init: true,
  };
}

export async function loadI18nsheetConfig(): Promise<Partial<I18NSheetConfig>> {
  const i18nsheetConfigFilePath = getI18nsheetConfigFilePath();
  const babelsheetConfigRaw = await fs.readFile(i18nsheetConfigFilePath);

  return JSON.parse(babelsheetConfigRaw.toString());
}

export async function saveI18nsheetConfig({
  spreadsheetId,
  credentialsFile,
  userInput,
  cliVersion,
}: I18NSheetConfig) {
  await fs.writeFile(
    I18N_SHEET_CONFIG_FILE_NAME,
    JSON.stringify(
      {
        cliVersion,
        spreadsheetId,
        credentials: credentialsFile,
        userInput,
      },
      null,
      2
    )
  );
}

export async function initPackageJson() {
  if (await hasPackageJson()) {
    return;
  }

  const proposedPackageName = path.basename(process.cwd());

  await fs.writeFile(
    resolvePackageJsonPath(),
    JSON.stringify(
      {
        name: proposedPackageName,
        description: "",
        version: "1.0.0",
        dependencies: {},
        devDependencies: {},
      },
      null,
      2
    )
  );
}

export async function listDependencies({
  devDependencies = false,
}: { devDependencies?: boolean } = {}) {
  if (!(await hasPackageJson())) {
    return [];
  }

  const packageJsonBuffer = await fs.readFile(resolvePackageJsonPath());

  try {
    const parsedPackageJson = JSON.parse(packageJsonBuffer.toString());

    return Object.keys(
      parsedPackageJson[devDependencies ? "devDependencies" : "dependencies"]
    );
  } catch {
    return [];
  }
}

export async function removeDependencies(dependencies: string[]) {
  await exec(`npm remove ${dependencies.join(" ")}`);
}

export async function installDependencies(dependencies: DependencyToInstall[]) {
  const existingDeps = await listDependencies();
  const missingDependencies = dependencies.filter(
    ({ packageName }) => !existingDeps.includes(packageName)
  );
  const dependencyToString = ({
    packageName,
    version,
  }: DependencyToInstall): string =>
    version ? `${packageName}@${version}` : packageName;

  const deps = missingDependencies
    .filter(({ dev }) => !dev)
    .map(dependencyToString);
  const devDeps = missingDependencies
    .filter(({ dev }) => dev)
    .map(dependencyToString);

  if (deps) {
    await exec(`npm i ${deps.join(" ")}`);
  }

  if (devDeps) {
    await exec(`npm i -D ${devDeps.join(" ")}`);
  }
}

export async function registerScript(name: string, command: string) {
  if (!(await hasPackageJson())) {
    throw new Error("package.json does not exist");
  }

  const packageJsonPath = resolvePackageJsonPath();
  const packageJsonContent = await fs
    .readFile(packageJsonPath)
    .then((content) => JSON.parse(content.toString()));

  if (!packageJsonContent.scripts) {
    packageJsonContent.scripts = {};
  }

  packageJsonContent.scripts[name] = command;

  await fs.writeFile(
    packageJsonPath,
    JSON.stringify(packageJsonContent, null, 2)
  );
}

export async function unregisterScript(name: string) {
  if (!(await hasPackageJson())) {
    throw new Error("package.json does not exist");
  }

  const packageJsonPath = resolvePackageJsonPath();
  const packageJsonContent = await fs
    .readFile(packageJsonPath)
    .then((content) => JSON.parse(content.toString()));

  if (!packageJsonContent.scripts?.[name]) {
    return;
  }

  delete packageJsonContent.scripts[name];

  await fs.writeFile(
    packageJsonPath,
    JSON.stringify(packageJsonContent, null, 2)
  );
}
