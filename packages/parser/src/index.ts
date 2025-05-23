import { from, scan, defer, map, filter, Observable, takeWhile } from "rxjs";
import { mergeMap, mergeAll } from "rxjs/operators";
import { csvRowsIterator } from "./csv-rows-iterator";
import { ParseSheetConfig } from "./types";
import {
  CellValue,
  Row,
  spreadsheetRowsIterator,
} from "./spreadsheet-rows-iterator";

export type TranslationEntry = {
  path: string[];
  language: string;
  value: string;
  tag: string;
};

const END_AFTER_EMPTY_ROWS_COUNT = 10;

export { ParseSheetConfig };

// eslint-disable-next-line operator-linebreak
export const parseSheet = //
  (config: ParseSheetConfig): Observable<TranslationEntry> =>
    defer(async () => {
      const { isUsingCsvExport, ...commonConfig } = config;
      const rowsIterator = isUsingCsvExport
        ? csvRowsIterator(commonConfig)
        : spreadsheetRowsIterator(commonConfig);

      // Header row parsing
      let headerRow: Row;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { value } = await rowsIterator.next();

        if (!value) {
          throw new Error("No header row found");
        }

        if (value[0] === "###") {
          headerRow = value;
          break;
        }
      }

      const pathMaxLength = headerRow.filter(
        (cellValue) => cellValue === ">>>"
      ).length;
      const languages = headerRow
        .slice(pathMaxLength + 1)
        .filter((cellValue) => cellValue !== null)
        .map(String);

      // Data rows parsing
      return from(rowsIterator).pipe(
        map((row) => row.map(cellValueToString)),
        scan(
          ({ path, emptyRowsCount }, row) => ({
            path: mergePaths(path, row.slice(1, pathMaxLength + 1)),
            translations: row.slice(pathMaxLength + 1),
            tag: row[0],
            emptyRowsCount: row.every((cellValue) => cellValue === "")
              ? emptyRowsCount + 1
              : emptyRowsCount,
          }),
          {
            path: [] as string[],
            translations: [] as string[],
            tag: "",
            emptyRowsCount: 0,
          }
        ),
        takeWhile(
          ({ emptyRowsCount }) => emptyRowsCount < END_AFTER_EMPTY_ROWS_COUNT
        ),
        filter(({ translations }) =>
          translations.some((translation) => translation !== "")
        ),
        mergeMap(({ path, translations, tag }) =>
          languages.map(
            (language, languageIndex): TranslationEntry => ({
              language,
              path,
              value: translations[languageIndex],
              tag,
            })
          )
        )
      );
    }).pipe(
      // Flatten the promise:
      // Promise<Observable<TranslationEntry>> -> Observable<TranslationEntry>
      mergeAll()
    );

const cellValueToString = (value: CellValue) =>
  value === null ? "" : String(value);

const mergePaths = (previousPath: string[], path: string[]) => {
  const firstNodeIndex = path.findIndex((node) => node !== "");
  if (firstNodeIndex === -1) {
    return previousPath;
  }

  return [
    ...previousPath.slice(0, firstNodeIndex),
    ...path.slice(firstNodeIndex),
  ].filter((pathNode) => pathNode !== "");
};
