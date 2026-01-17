const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

const BOX = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
  headerLeft: "├",
  headerRight: "┤",
  headerCross: "┼",
  topCross: "┬",
  bottomCross: "┴",
};

function getTerminalWidth(): number {
  return process.stdout.columns || process.stderr.columns || 120;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    const dim = Bun.enableANSIColors ? DIM : "";
    const reset = Bun.enableANSIColors ? RESET : "";
    return `${dim}NULL${reset}`;
  }
  if (typeof value === "string") {
    return value;
  }
  return Bun.inspect(value, { colors: Bun.enableANSIColors, depth: 2 });
}

function truncate(str: string, maxWidth: number): string {
  const width = Bun.stringWidth(str);
  if (width <= maxWidth) {
    return str;
  }

  let low = 0;
  let high = str.length;

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (Bun.stringWidth(str.slice(0, mid)) + 1 <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const truncated = str.slice(0, low) + "…";
  return Bun.enableANSIColors ? truncated + RESET : truncated;
}

function padRight(str: string, width: number): string {
  const strWidth = Bun.stringWidth(str);
  if (strWidth >= width) {
    return str;
  }
  return str + " ".repeat(width - strWidth);
}

function padLeft(str: string, width: number): string {
  const strWidth = Bun.stringWidth(str);
  if (strWidth >= width) {
    return str;
  }
  return " ".repeat(width - strWidth) + str;
}

export interface TableOptions {
  maxRows?: number;
  title?: string;
  totalRows?: number;
  fullContent?: boolean;
}

function wrapLines(str: string, maxWidth: number): string[] {
  // Split input into logical words, wrap to fit maxWidth
  const raw = str.split(/\n/g).join(" ");
  if (raw === "") return [""];

  let lines: string[] = [];
  let current = "";

  const tokens = raw.split(/([ ]+)/);
  for (const token of tokens) {
    let fragment = token;
    while (fragment.length > 0) {
      const width = Bun.stringWidth(current + fragment);
      if (width > maxWidth) {
        if (current.length > 0) {
          lines.push(current);
          current = "";
        } else {
          let cutPoint = 1;
          while (cutPoint < fragment.length && Bun.stringWidth(fragment.slice(0, cutPoint)) < maxWidth) {
            cutPoint++;
          }
          lines.push(fragment.slice(0, cutPoint));
          fragment = fragment.slice(cutPoint);
        }
      } else {
        current += fragment;
        fragment = "";
      }
    }
    if (Bun.stringWidth(current) >= maxWidth) {
      lines.push(current);
      current = "";
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }

  return lines;
}

export function printTable(
  rows: Record<string, unknown>[],
  options: TableOptions = {},
): void {
  const { maxRows = 100, title, totalRows } = options;
  const dim = Bun.enableANSIColors ? DIM : "";
  const reset = Bun.enableANSIColors ? RESET : "";
  const bold = Bun.enableANSIColors ? BOLD : "";

  if (rows.length === 0) {
    if (title) {
      const emptyText = "(empty)";
      const contentWidth = Math.max(
        Bun.stringWidth(emptyText),
        Bun.stringWidth(title),
      );
      const titleDisplay = ` ${title} `;
      const titleWidth = Bun.stringWidth(titleDisplay);
      const innerWidth = contentWidth + 2;
      const remainingWidth = innerWidth - titleWidth - 1;
      console.log(
        `${dim}${BOX.topLeft}${BOX.horizontal}${reset}${bold}${titleDisplay}${reset}${dim}${BOX.horizontal.repeat(
          Math.max(0, remainingWidth),
        )}${BOX.topRight}${reset}`,
      );
      console.log(
        `${dim}${BOX.vertical}${reset} ${padRight(
          emptyText,
          contentWidth,
        )} ${dim}${BOX.vertical}${reset}`,
      );
      console.log(
        `${dim}${BOX.bottomLeft}${BOX.horizontal.repeat(innerWidth)}${
          BOX.bottomRight
        }${reset}`,
      );
    } else {
      console.log("(empty)");
    }
    return;
  }

  const rowCount = rows.length;
  const displayRows = maxRows === Infinity ? rows : rows.slice(0, maxRows);
  const allColumns = Object.keys(displayRows[0]!);
  const termWidth = getTerminalWidth();

  const isNumericCol: boolean[] = allColumns.map((col) => {
    return displayRows.every((row) => {
      const val = row[col];
      return (
        val === null ||
        val === undefined ||
        typeof val === "number" ||
        typeof val === "bigint"
      );
    });
  });

  const colWidths: number[] = allColumns.map((col) => Bun.stringWidth(col));
  const formattedRows: string[][] = displayRows.map((row) =>
    allColumns.map((col, i) => {
      const formatted = formatValue(row[col]).replace(/\n/g, "\\n");
      colWidths[i] = Math.max(colWidths[i]!, Bun.stringWidth(formatted));
      return formatted;
    }),
  );

  const minColWidth = 3;
  const borderOverhead = 4 + (allColumns.length - 1) * 3;
  let availableForColumns = termWidth - borderOverhead;

  let columns = allColumns;
  let hiddenCols = 0;

  while (
    columns.length * minColWidth > availableForColumns &&
    columns.length > 1
  ) {
    columns = columns.slice(0, -1);
    hiddenCols++;
    availableForColumns = termWidth - (4 + (columns.length - 1) * 3);
  }

  const visibleColWidths = colWidths.slice(0, columns.length);
  const visibleFormattedRows = formattedRows.map((row) =>
    row.slice(0, columns.length),
  );
  const visibleIsNumeric = isNumericCol.slice(0, columns.length);

  let totalWidth = visibleColWidths.reduce((a, b) => a + b, 0);

  if (totalWidth > availableForColumns) {
    const headerWidths = columns.map((col) =>
      Math.max(minColWidth, Bun.stringWidth(col)),
    );
    const sqrtWidths = visibleColWidths.map((w) => Math.sqrt(w));
    const sqrtTotal = sqrtWidths.reduce((a, b) => a + b, 0);

    for (let i = 0; i < visibleColWidths.length; i++) {
      const fair = Math.floor(
        (sqrtWidths[i]! / sqrtTotal) * availableForColumns,
      );
      visibleColWidths[i] = Math.max(headerWidths[i]!, fair);
    }

    totalWidth = visibleColWidths.reduce((a, b) => a + b, 0);
    while (
      totalWidth > availableForColumns &&
      visibleColWidths.some((w) => w > minColWidth)
    ) {
      let maxIdx = 0;
      for (let i = 1; i < visibleColWidths.length; i++) {
        if (visibleColWidths[i]! > visibleColWidths[maxIdx]!) maxIdx = i;
      }
      visibleColWidths[maxIdx]!--;
      totalWidth--;
    }
  }

  const actualTotal = totalRows ?? rowCount;
  const truncatedRows =
    actualTotal > displayRows.length ? actualTotal - displayRows.length : 0;
  let infoText = "";
  if (truncatedRows > 0 || hiddenCols > 0) {
    const parts: string[] = [];
    if (truncatedRows > 0)
      parts.push(`${truncatedRows} more row${truncatedRows > 1 ? "s" : ""}`);
    if (hiddenCols > 0)
      parts.push(`${hiddenCols} more column${hiddenCols > 1 ? "s" : ""}`);
    infoText = `... ${parts.join(", ")}`;
  }

  const contentWidth =
    visibleColWidths.reduce((a, b) => a + b, 0) + (columns.length - 1) * 3;

  const titleWidth = title ? Bun.stringWidth(title) + 4 : 0;
  const maxInnerWidth = termWidth - 4;
  const innerWidth = Math.min(
    Math.max(contentWidth, titleWidth),
    maxInnerWidth,
  );

  const totalInnerWidth = innerWidth + 2;

  if (innerWidth > contentWidth && visibleColWidths.length > 0) {
    visibleColWidths[visibleColWidths.length - 1]! += innerWidth - contentWidth;
  }

  const topBorder = visibleColWidths
    .map((w) => BOX.horizontal.repeat(w))
    .join(`${BOX.horizontal}${BOX.topCross}${BOX.horizontal}`);
  const fullTopBorder = `${BOX.topLeft}${BOX.horizontal}${topBorder}${BOX.horizontal}${BOX.topRight}`;
  if (title) {
    const titleDisplay = ` ${title} `;
    const titleDisplayWidth = Bun.stringWidth(titleDisplay);

    const beforeTitle = fullTopBorder.slice(0, 2);
    const afterTitle = fullTopBorder.slice(2 + titleDisplayWidth);
    console.log(
      `${dim}${beforeTitle}${reset}${bold}${titleDisplay}${reset}${dim}${afterTitle}${reset}`,
    );
  } else {
    console.log(`${dim}${fullTopBorder}${reset}`);
  }

  const header = columns
    .map((col, i) => {
      const truncated = truncate(col, visibleColWidths[i]!);
      return visibleIsNumeric[i]
        ? padLeft(truncated, visibleColWidths[i]!)
        : padRight(truncated, visibleColWidths[i]!);
    })
    .join(` ${dim}${BOX.vertical}${reset} `);
  console.log(
    `${dim}${BOX.vertical}${reset} ${header} ${dim}${BOX.vertical}${reset}`,
  );

  const headerSep = visibleColWidths
    .map((w) => BOX.horizontal.repeat(w))
    .join(`${BOX.horizontal}${BOX.headerCross}${BOX.horizontal}`);
  console.log(
    `${dim}${BOX.headerLeft}${BOX.horizontal}${headerSep}${BOX.horizontal}${BOX.headerRight}${reset}`,
  );

  if (options.fullContent) {
    for (let rowIdx = 0; rowIdx < visibleFormattedRows.length; rowIdx++) {
      const row = visibleFormattedRows[rowIdx] ?? [];
      const wrapped = row.map((val, i) => wrapLines(val, visibleColWidths[i]!));
      const rowHeight = Math.max(...wrapped.map(x => x.length));
      for (let lineIdx = 0; lineIdx < rowHeight; lineIdx++) {
        const pieces = wrapped.map((cellLines, i) => {
          const part: string = typeof cellLines[lineIdx] === "string" ? cellLines[lineIdx]! : "";
          return visibleIsNumeric[i]
            ? padLeft(truncate(part, visibleColWidths[i]!), visibleColWidths[i]!)
            : padRight(truncate(part, visibleColWidths[i]!), visibleColWidths[i]!);
        });
        const line = pieces.join(` ${dim}${BOX.vertical}${reset} `);
        console.log(`${dim}${BOX.vertical}${reset} ${line} ${dim}${BOX.vertical}${reset}`);
      }
      if (rowIdx < visibleFormattedRows.length - 1) {
        const rowSep = visibleColWidths
          .map((w) => BOX.horizontal.repeat(w))
          .join(`${BOX.horizontal}${BOX.headerCross}${BOX.horizontal}`);
        console.log(`${dim}${BOX.headerLeft}${BOX.horizontal}${rowSep}${BOX.horizontal}${BOX.headerRight}${reset}`);
      }
    }
  } else {
    for (const row of visibleFormattedRows) {
      const line = row
        .map((val, i) => {
          const truncated = truncate(val, visibleColWidths[i]!);
          return visibleIsNumeric[i]
            ? padLeft(truncated, visibleColWidths[i]!)
            : padRight(truncated, visibleColWidths[i]!);
        })
        .join(` ${dim}${BOX.vertical}${reset} `);
      console.log(
        `${dim}${BOX.vertical}${reset} ${line} ${dim}${BOX.vertical}${reset}`,
      );
    }
  }

  if (infoText) {
    const truncatedInfo = truncate(infoText, innerWidth);
    const infoLine = padRight(truncatedInfo, innerWidth);
    console.log(`${dim}${BOX.vertical} ${infoLine} ${BOX.vertical}${reset}`);

    console.log(
      `${dim}${BOX.bottomLeft}${BOX.horizontal.repeat(totalInnerWidth)}${
        BOX.bottomRight
      }${reset}`,
    );
  } else {
    const bottomBorder = visibleColWidths
      .map((w) => BOX.horizontal.repeat(w))
      .join(`${BOX.horizontal}${BOX.bottomCross}${BOX.horizontal}`);
    console.log(
      `${dim}${BOX.bottomLeft}${BOX.horizontal}${bottomBorder}${BOX.horizontal}${BOX.bottomRight}${reset}`,
    );
  }
}
