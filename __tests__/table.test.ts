import { describe, test, expect } from "bun:test";
import { printTable } from "../src/table.ts";

// Capture console.log output
function captureOutput(fn: () => void): string {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(" "));
  try {
    fn();
  } finally {
    console.log = originalLog;
  }
  return logs.join("\n");
}

// Strip ANSI codes for easier testing
function stripAnsi(str: string): string {
  return Bun.stripANSI(str);
}

describe("printTable", () => {
  test("single column", () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const output = stripAnsi(captureOutput(() => printTable(rows, { title: "single" })));
    expect(output).toMatchInlineSnapshot(`
"╭─ single ───╮
│         id │
├────────────┤
│          1 │
│          2 │
╰────────────╯"
`);
  });

  test("single row", () => {
    const rows = [{ a: 1, b: 2 }];
    const output = stripAnsi(captureOutput(() => printTable(rows)));
    expect(output).toMatchInlineSnapshot(`
"╭───┬───╮
│ a │ b │
├───┼───┤
│ 1 │ 2 │
╰───┴───╯"
`);
  });

  test("multiple rows and columns", () => {
    const rows = [
      { id: 1, name: "Alice", email: "alice@example.com" },
      { id: 2, name: "Bob", email: "bob@test.com" },
    ];
    const output = stripAnsi(captureOutput(() => printTable(rows, { title: "users" })));
    expect(output).toMatchInlineSnapshot(`
"╭─ users ────┬───────────────────╮
│ id │ name  │ email             │
├────┼───────┼───────────────────┤
│  1 │ Alice │ alice@example.com │
│  2 │ Bob   │ bob@test.com      │
╰────┴───────┴───────────────────╯"
`);
  });

  test("empty table with title", () => {
    const output = stripAnsi(captureOutput(() => printTable([], { title: "empty" })));
    expect(output).toMatchInlineSnapshot(`
"╭─ empty ──╮
│ (empty) │
╰─────────╯"
`);
  });

  test("empty table without title", () => {
    const output = stripAnsi(captureOutput(() => printTable([])));
    expect(output).toMatchInlineSnapshot(`"(empty)"`);
  });

  test("null and undefined values", () => {
    const rows = [{ id: 1, nullable: null, missing: undefined }];
    const output = stripAnsi(captureOutput(() => printTable(rows)));
    expect(output).toMatchInlineSnapshot(`
"╭────┬──────────┬─────────╮
│ id │ nullable │ missing │
├────┼──────────┼─────────┤
│  1 │     NULL │    NULL │
╰────┴──────────┴─────────╯"
`);
  });

  test("empty string values", () => {
    const rows = [{ id: 1, name: "", value: "test" }];
    const output = stripAnsi(captureOutput(() => printTable(rows)));
    expect(output).toMatchInlineSnapshot(`
"╭────┬──────┬───────╮
│ id │ name │ value │
├────┼──────┼───────┤
│  1 │      │ test  │
╰────┴──────┴───────╯"
`);
  });

  test("numeric values", () => {
    const rows = [{ int: 42, float: 3.14, big: 1000000 }];
    const output = stripAnsi(captureOutput(() => printTable(rows)));
    expect(output).toMatchInlineSnapshot(`
"╭─────┬───────┬─────────╮
│ int │ float │     big │
├─────┼───────┼─────────┤
│  42 │  3.14 │ 1000000 │
╰─────┴───────┴─────────╯"
`);
  });

  test("unicode characters", () => {
    const rows = [
      { name: "日本語", emoji: "🎉" },
      { name: "中文", emoji: "🚀" },
    ];
    const output = stripAnsi(captureOutput(() => printTable(rows)));
    expect(output).toMatchInlineSnapshot(`
"╭────────┬───────╮
│ name   │ emoji │
├────────┼───────┤
│ 日本語 │ 🎉    │
│ 中文   │ 🚀    │
╰────────┴───────╯"
`);
  });

  test("respects maxRows option", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: i }));
    const output = stripAnsi(captureOutput(() => printTable(rows, { maxRows: 3 })));
    expect(output).toMatchInlineSnapshot(`
"╭────╮
│ id │
├────┤
│  0 │
│  1 │
│  2 │
│ .… │
╰────╯"
`);
  });

  test("long value gets truncated", () => {
    const rows = [
      { id: 1, description: "This is a very long description that should be truncated" },
    ];
    // Simulate 50 char terminal
    const originalColumns = process.stdout.columns;
    Object.defineProperty(process.stdout, "columns", { value: 50, configurable: true });
    try {
      const output = stripAnsi(captureOutput(() => printTable(rows)));
      expect(output).toMatchInlineSnapshot(`
"╭────────┬──────────────────────────────────────╮
│     id │ description                          │
├────────┼──────────────────────────────────────┤
│      1 │ This is a very long description tha… │
╰────────┴──────────────────────────────────────╯"
`);
    } finally {
      Object.defineProperty(process.stdout, "columns", { value: originalColumns, configurable: true });
    }
  });

  test("many columns get hidden when terminal is narrow", () => {
    const rows = [{ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 }];
    const originalColumns = process.stdout.columns;
    Object.defineProperty(process.stdout, "columns", { value: 30, configurable: true });
    try {
      const output = stripAnsi(captureOutput(() => printTable(rows)));
      expect(output).toMatchInlineSnapshot(`
"╭───┬───┬───┬───╮
│ a │ b │ c │ d │
├───┼───┼───┼───┤
│ 1 │ 2 │ 3 │ 4 │
│ ... 4 more c… │
╰───────────────╯"
`);
    } finally {
      Object.defineProperty(process.stdout, "columns", { value: originalColumns, configurable: true });
    }
  });

  test("both rows and columns truncated", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ a: i, b: i, c: i, d: i, e: i, f: i }));
    const originalColumns = process.stdout.columns;
    Object.defineProperty(process.stdout, "columns", { value: 25, configurable: true });
    try {
      const output = stripAnsi(captureOutput(() => printTable(rows, { maxRows: 3 })));
      expect(output).toMatchInlineSnapshot(`
"╭───┬───┬───┬───╮
│ a │ b │ c │ d │
├───┼───┼───┼───┤
│ 0 │ 0 │ 0 │ 0 │
│ 1 │ 1 │ 1 │ 1 │
│ 2 │ 2 │ 2 │ 2 │
│ ... 7 more r… │
╰───────────────╯"
`);
    } finally {
      Object.defineProperty(process.stdout, "columns", { value: originalColumns, configurable: true });
    }
  });

  test("right-aligns numeric columns", () => {
    const rows = [
      { id: 1, name: "Alice", amount: 1234.56 },
      { id: 22, name: "Bob", amount: 99.99 },
      { id: 333, name: "Charlie", amount: 5 },
    ];
    const output = stripAnsi(captureOutput(() => printTable(rows)));
    expect(output).toMatchInlineSnapshot(`
"╭─────┬─────────┬─────────╮
│  id │ name    │  amount │
├─────┼─────────┼─────────┤
│   1 │ Alice   │ 1234.56 │
│  22 │ Bob     │   99.99 │
│ 333 │ Charlie │       5 │
╰─────┴─────────┴─────────╯"
`);
  });

  test("mixed numeric and string columns stay left-aligned if any string", () => {
    const rows = [
      { code: 123 },
      { code: "ABC" },
    ];
    const output = stripAnsi(captureOutput(() => printTable(rows)));
    expect(output).toMatchInlineSnapshot(`
"╭──────╮
│ code │
├──────┤
│ 123  │
│ ABC  │
╰──────╯"
`);
  });

  test("totalRows shows actual count from database", () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const output = stripAnsi(captureOutput(() => printTable(rows, { maxRows: 3, totalRows: 1000 })));
    expect(output).toMatchInlineSnapshot(`
"╭────╮
│ id │
├────┤
│  1 │
│  2 │
│  3 │
│ .… │
╰────╯"
`);
  });

  test("title expands table width", () => {
    const rows = [{ a: 1 }];
    const output = stripAnsi(captureOutput(() => printTable(rows, { title: "this is a very long title" })));
    expect(output).toMatchInlineSnapshot(`
"╭─ this is a very long title ───╮
│                             a │
├───────────────────────────────┤
│                             1 │
╰───────────────────────────────╯"
`);
  });

  test("handles bigint values", () => {
    const rows = [{ big: BigInt("9007199254740993") }];
    const output = stripAnsi(captureOutput(() => printTable(rows)));
    expect(output).toMatchInlineSnapshot(`
"╭───────────────────╮
│               big │
├───────────────────┤
│ 9007199254740993n │
╰───────────────────╯"
`);
  });

  test("handles very long table names", () => {
    const rows = [{ x: 1 }];
    const originalColumns = process.stdout.columns;
    Object.defineProperty(process.stdout, "columns", { value: 30, configurable: true });
    try {
      const output = stripAnsi(captureOutput(() => printTable(rows, { title: "this_is_a_very_long_table_name_that_exceeds_terminal" })));
      // Table expands for long title (title is not truncated)
      expect(output).toContain("this_is_a_very_long_table_name_that_exceeds_terminal");
    } finally {
      Object.defineProperty(process.stdout, "columns", { value: originalColumns, configurable: true });
    }
  });
});
