import { describe, test, expect } from "bun:test";
import { formatTableOutput, formatQueryResult } from "../src/index.ts";

describe("formatTableOutput", () => {
  test("formats empty table", () => {
    expect(formatTableOutput("users", [])).toMatchInlineSnapshot(`
"\n=== users ===
(empty table)"
`);
  });

  test("formats table with single row", () => {
    const rows = [{ id: 1, name: "Alice" }];
    expect(formatTableOutput("users", rows)).toMatchInlineSnapshot(`
"\n=== users ===
id | name
---------
1 | Alice"
`);
  });

  test("formats table with multiple rows", () => {
    const rows = [
      { id: 1, name: "Alice", email: "alice@test.com" },
      { id: 2, name: "Bob", email: "bob@test.com" },
    ];
    expect(formatTableOutput("users", rows)).toMatchInlineSnapshot(`
"\n=== users ===
id | name | email
-----------------
1 | Alice | alice@test.com
2 | Bob | bob@test.com"
`);
  });

  test("handles NULL values", () => {
    const rows = [{ id: 1, name: null }];
    expect(formatTableOutput("items", rows)).toMatchInlineSnapshot(`
"\n=== items ===
id | name
---------
1 | NULL"
`);
  });
});

describe("formatQueryResult", () => {
  test("formats empty result", () => {
    expect(formatQueryResult([])).toMatchInlineSnapshot(`"(no results)"`);
  });

  test("formats single row", () => {
    const rows = [{ count: 42 }];
    expect(formatQueryResult(rows)).toMatchInlineSnapshot(`
"count
-----
42

1 row(s)"
`);
  });

  test("formats multiple rows", () => {
    const rows = [
      { id: 1, value: "foo" },
      { id: 2, value: "bar" },
    ];
    expect(formatQueryResult(rows)).toMatchInlineSnapshot(`
"id | value
----------
1 | foo
2 | bar

2 row(s)"
`);
  });
});
