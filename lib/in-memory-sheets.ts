// In-memory реализация SheetsTransport для тестов и локальной проверки exporter'а.
// Не используется в production path.

import type { SheetsTransport } from "./google-sheets.ts";
import type { SheetCell } from "./sheets-schema.ts";

export type InMemorySheets = {
  transport: SheetsTransport;
  tabs: Map<string, SheetCell[][]>;
  /** Сломать транспорт: следующие вызовы будут падать с этой ошибкой. */
  failWith(error: Error | null): void;
};

export function createInMemorySheets(): InMemorySheets {
  const tabs = new Map<string, SheetCell[][]>();
  let failure: Error | null = null;

  const check = () => {
    if (failure) throw failure;
  };

  return {
    tabs,
    failWith(error) {
      failure = error;
    },
    transport: {
      async ensureHeader(tab, header) {
        check();
        if (!tabs.has(tab) || tabs.get(tab)!.length === 0) {
          tabs.set(tab, [[...header]]);
        }
      },
      async readFirstColumn(tab) {
        check();
        return (tabs.get(tab) ?? []).slice(1).map((row) => String(row[0] ?? ""));
      },
      async appendRows(tab, rows) {
        check();
        const existing = tabs.get(tab) ?? [];
        tabs.set(tab, [...existing, ...rows]);
      },
      async rewriteTab(tab, header, rows) {
        check();
        tabs.set(tab, [[...header], ...rows]);
      },
    },
  };
}
