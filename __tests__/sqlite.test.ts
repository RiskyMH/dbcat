import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import {
  createConnection,
  getAllTables,
  getTableData,
  getDatabaseName,
  runQuery,
} from "../src/index.ts";

describe("SQLite", () => {
  const testDbPath = `/tmp/dbcli-sqlite-${Date.now()}.db`;
  let sql: ReturnType<typeof createConnection>;

  beforeAll(() => {
    const db = new Database(testDbPath);
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)");
    db.run("CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT, user_id INTEGER)");
    db.run("INSERT INTO users VALUES (1, 'Alice', 'alice@test.com')");
    db.run("INSERT INTO users VALUES (2, 'Bob', 'bob@test.com')");
    db.run("INSERT INTO posts VALUES (1, 'Hello World', 1)");
    db.close();

    sql = createConnection(testDbPath);
  });

  afterAll(async () => {
    await sql.close();
    await Bun.file(testDbPath).delete();
  });

  test("creates connection with correct adapter", () => {
    expect(sql.options.adapter).toBe("sqlite");
  });

  test("getAllTables returns table names", async () => {
    const tables = await getAllTables(sql);
    expect(tables).toMatchInlineSnapshot(`
[
  {
    "name": "posts",
  },
  {
    "name": "users",
  },
]
`);
  });

  test("getTableData returns rows", async () => {
    const rows = await getTableData(sql, "users");
    expect(rows).toMatchInlineSnapshot(`
[
  {
    "email": "alice@test.com",
    "id": 1,
    "name": "Alice",
  },
  {
    "email": "bob@test.com",
    "id": 2,
    "name": "Bob",
  },
]
`);
  });

  test("getTableData handles table with special characters", async () => {
    const db = new Database(testDbPath);
    db.run('CREATE TABLE IF NOT EXISTS "my-table" (id INTEGER)');
    db.run('INSERT OR IGNORE INTO "my-table" VALUES (1)');
    db.close();

    const rows = await getTableData(sql, "my-table");
    expect(rows).toMatchInlineSnapshot(`
[
  {
    "id": 1,
  },
]
`);
  });

  test("runQuery executes custom SQL", async () => {
    const rows = await runQuery(sql, "SELECT name FROM users WHERE id = 1");
    expect(rows).toMatchInlineSnapshot(`
[
  {
    "name": "Alice",
  },
]
`);
  });

  test("runQuery handles JOINs", async () => {
    const rows = await runQuery(
      sql,
      "SELECT u.name, p.title FROM users u JOIN posts p ON u.id = p.user_id"
    );
    expect(rows).toMatchInlineSnapshot(`
[
  {
    "name": "Alice",
    "title": "Hello World",
  },
]
`);
  });

  test("works with sqlite:// protocol", () => {
    const s = createConnection(`sqlite://${testDbPath}`);
    expect(s.options.adapter).toBe("sqlite");
    s.close();
  });

  test("works with :memory:", () => {
    const s = createConnection(":memory:");
    expect(s.options.adapter).toBe("sqlite");
    s.close();
  });

  test("getDatabaseName returns filename", async () => {
    const name = await getDatabaseName(sql);
    expect(name).toMatch(/dbcli-sqlite-.*\.db$/);
  });

  test("getDatabaseName returns null for :memory:", async () => {
    const s = createConnection(":memory:");
    const name = await getDatabaseName(s);
    expect(name).toBeNull();
    s.close();
  });

  test("CLI shows tables", async () => {
    const proc = Bun.spawn(["bun", "src/index.ts", testDbPath], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    // Strip ANSI codes for snapshot
    const clean = Bun.stripANSI(stdout);
    expect(clean).toContain("posts");
    expect(clean).toContain("users");
    expect(clean).toContain("Alice");
    expect(clean).toContain("Hello World");
  });

  test("CLI runs piped query", async () => {
    const proc = Bun.spawn(["bun", "src/index.ts", testDbPath], {
      cwd: import.meta.dir + "/..",
      stdin: new Blob(["SELECT name, email FROM users ORDER BY id"]),
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    const clean = Bun.stripANSI(stdout);
    expect(clean).toMatchInlineSnapshot(`
"╭─ Result ───────────────╮
│ name  │ email          │
├───────┼────────────────┤
│ Alice │ alice@test.com │
│ Bob   │ bob@test.com   │
╰───────┴────────────────╯
"
`);
  });
});
