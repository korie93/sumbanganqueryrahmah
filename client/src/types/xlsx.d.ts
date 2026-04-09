declare module "xlsx" {
  export interface CellObject {
    t: string;
    v: unknown;
    z?: string;
    w?: string;
  }

  export interface WorkSheet {
    [key: string]: unknown;
    "!ref"?: string;
    "!cols"?: Array<{ wch?: number; wpx?: number }>;
    "!rows"?: Array<{ hpt?: number; hpx?: number }>;
    "!merges"?: Range[];
  }

  export interface WorkBook {
    SheetNames: string[];
    Sheets: { [sheet: string]: WorkSheet };
  }

  export interface Range {
    s: CellAddress;
    e: CellAddress;
  }

  export interface CellAddress {
    c: number;
    r: number;
  }

  export interface Sheet2JSONOpts {
    header?: number | string[];
    range?: unknown;
    raw?: boolean;
    defval?: unknown;
  }

  export interface JSON2SheetOpts {
    header?: string[];
    skipHeader?: boolean;
  }

  export interface AOA2SheetOpts {
    dateNF?: string;
    cellDates?: boolean;
  }

  export interface ParsingOptions {
    type?: string;
    raw?: boolean;
    cellDates?: boolean;
    cellFormula?: boolean;
    cellNF?: boolean;
    cellText?: boolean;
    sheetRows?: number;
  }

  export interface WritingOptions {
    type?: string;
    bookType?: string;
    bookSST?: boolean;
  }

  export const utils: {
    sheet_to_json<T = Record<string, unknown>>(worksheet: WorkSheet, opts?: Sheet2JSONOpts): T[];
    json_to_sheet(data: unknown[], opts?: JSON2SheetOpts): WorkSheet;
    aoa_to_sheet(data: unknown[][], opts?: AOA2SheetOpts): WorkSheet;
    book_new(): WorkBook;
    book_append_sheet(workbook: WorkBook, worksheet: WorkSheet, name?: string): void;
    decode_range(range: string): Range;
    encode_cell(cell: CellAddress): string;
    encode_range(range: Range): string;
    sheet_add_aoa(ws: WorkSheet, data: unknown[][], opts?: { origin?: string | CellAddress }): WorkSheet;
  };

  export function read(data: unknown, opts?: ParsingOptions): WorkBook;
  export function readFile(filename: string, opts?: ParsingOptions): WorkBook;
  export function write(workbook: WorkBook, opts?: WritingOptions): unknown;
  export function writeFile(workbook: WorkBook, filename: string, opts?: WritingOptions): void;
  export function writeFileXLSX(workbook: WorkBook, filename: string, opts?: WritingOptions): void;
}
