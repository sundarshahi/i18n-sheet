import { firstValueFrom } from "rxjs";
import { parseSheet } from "i18n-sheet-parser";
import type { JWTInput } from "google-auth-library";

export type BabelsheetValidatorInput = {
  credentials: Required<JWTInput>;
  spreadsheetId: string;
};

export const isI18nsheetCompliantSpreadsheet = ({
  credentials,
  spreadsheetId,
}: BabelsheetValidatorInput) =>
  firstValueFrom(
    parseSheet({
      credentials,
      spreadsheetId,
    }),
    { defaultValue: {} }
  ).then(
    () => true,
    (error) => {
      if (error?.response?.status === 403) {
        throw new Error(
          `Provided credentials are not allowed to access this spreadsheet. Please share this document with "${credentials.client_email}" e-mail.`
        );
      }

      return false;
    }
  );
