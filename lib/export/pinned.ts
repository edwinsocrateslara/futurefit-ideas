import type { PinnedItem } from "@/lib/data/dashboard";
import { krDisplayLabel } from "@/lib/synthesis/kr-identifiers";

const HEADERS = [
  "Rank",
  "Project Name",
  "Status",
  "Tier",
  "TPM",
  "Impact",
  "Eng Sprints",
  "Data Sprints",
  "Why?",
  "Committed Scope",
  "Customers & Prospects",
  "Hard Deadline / Notes",
  "KRs",
] as const;

// Column widths in character units (ExcelJS `width` property).
const COL_WIDTHS: Record<(typeof HEADERS)[number], number> = {
  "Rank":                    6,
  "Project Name":           42,
  "Status":                 22,
  "Tier":                   10,
  "TPM":                    12,
  "Impact":                  9,
  "Eng Sprints":            12,
  "Data Sprints":           12,
  "Why?":                   40,
  "Committed Scope":        36,
  "Customers & Prospects":  36,
  "Hard Deadline / Notes":  30,
  "KRs":                    22,
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function str(v: string | null | undefined): string {
  return v ?? "";
}

export async function exportPinnedItems(items: PinnedItem[]): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Coming Up");

  // Column definitions with widths
  sheet.columns = HEADERS.map((h) => ({
    header: h,
    key: h,
    width: COL_WIDTHS[h],
  }));

  // Style header row: bold, light fill, frozen
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, size: 11 };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEFEFEF" },
  };
  headerRow.alignment = { vertical: "middle" };
  headerRow.commit();

  // Freeze header row
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  // Data rows
  items.forEach((item, index) => {
    const isQuickWin = item.pinned_from === "quick_win";

    const committedScope = !isQuickWin && item.committed_scope?.length
      ? item.committed_scope.join("\n")
      : "";

    const krs = !isQuickWin && item.linked_krs?.length
      ? item.linked_krs.map(krDisplayLabel).join(", ")
      : "";

    const rowData: Record<string, string | number> = {
      "Rank":                    index + 1,
      "Project Name":            str(item.title),
      "Status":                  isQuickWin ? "" : str(item.status),
      "Tier":                    "",
      "TPM":                     "",
      "Impact":                  isQuickWin || item.impact_rating == null || item.confidence_rating == null ? "" : item.impact_rating * item.confidence_rating,
      "Eng Sprints":             "",
      "Data Sprints":            "",
      "Why?":                    str(item.why_callout),
      "Committed Scope":         committedScope,
      "Customers & Prospects":   str(item.customers_prospects_callout),
      "Hard Deadline / Notes":   str(item.hard_deadline_notes_callout),
      "KRs":                     krs,
    };

    const row = sheet.addRow(rowData);

    // Wrap text + top-align every cell; the Committed Scope column especially needs it
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: "top", wrapText: true };
    });

    row.commit();
  });

  // Generate buffer and trigger browser download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `pinned-items-export-${today()}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
