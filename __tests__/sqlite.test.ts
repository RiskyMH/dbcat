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
├───────┼────────────────┤
│ Bob   │ bob@test.com   │
╰───────┴────────────────╯
"
`);
  });

  test("CLI runs piped (update) query", async () => {
    const proc = Bun.spawn(["bun", "src/index.ts", testDbPath], {
      cwd: import.meta.dir + "/..",
      stdin: new Blob(["INSERT INTO users (name, email) VALUES (\"john\", \"no@email.co\") RETURNING *"]),
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    const clean = Bun.stripANSI(stdout);
    expect(clean).toMatchInlineSnapshot(`
      "╭─ Result ──┬─────────────╮
      │ id │ name │ email       │
      ├────┼──────┼─────────────┤
      │  3 │ john │ no@email.co │
      ╰────┴──────┴─────────────╯
      "
    `);

    const sql = createConnection(testDbPath, { readonly: false });
    const users = await sql`SELECT * FROM users WHERE email = ${"no@email.co"}`;
    expect(users.length).toBe(1);
    expect(users[0].name).toBe("john");
    expect(users[0].email).toBe("no@email.co");
  });

  test("CLI downloads and opens remote SQLite file", async () => {
    const remoteUrl =
      "https://github.com/lerocha/chinook-database/raw/master/ChinookDatabase/DataSources/Chinook_Sqlite.sqlite";

    const proc = Bun.spawn(
      ["bun", "src/index.ts", remoteUrl, "--json"],
      {
        cwd: import.meta.dir + "/..",
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    const stderr = await new Response(proc.stderr).text();
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(stderr).toBeEmpty()
    expect(exitCode).toBe(0);

    const data = JSON.parse(stdout);
    expect(data).toHaveProperty("Album");
    expect(data).toHaveProperty("Artist");
    expect(data).toHaveProperty("Track");
    expect(data.Artist.length).toBeGreaterThan(0);
    expect(data.Artist[0]).toHaveProperty("Name");
  });

  test("CLI fails gracefully on invalid remote URL", async () => {
    const proc = Bun.spawn(
      ["bun", "src/index.ts", "https://riskymh.dev/404/nonexistent.db"],
      {
        cwd: import.meta.dir + "/..",
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Failed to download");
  });
});






// PROB USELESS TESTS BELOW:
describe("SQLite (readonly)", () => {
  const testDbPath = `/tmp/dbcli-sqlite-readonly-${Date.now()}.db`;
  let sql: ReturnType<typeof createConnection>;

  beforeAll(() => {
    const db = new Database(testDbPath);
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
    db.run("INSERT INTO users VALUES (1, 'Alice')");
    db.close();

    sql = createConnection(testDbPath, { readonly: true });
  });

  afterAll(async () => {
    await sql.close();
    await Bun.file(testDbPath).delete();
  });

  test("SELECT query works", async () => {
    const rows = await runQuery(sql, "SELECT name FROM users WHERE id = 1");
    expect(rows).toEqual([{ name: "Alice" }]);
  });

  test("INSERT query fails", async () => {
    let thrownError: any;
    try {
      await runQuery(sql, "INSERT INTO users VALUES (2, 'Bob')");
    } catch (e) {
      thrownError = e;
    }
    expect(thrownError).toBeDefined();
    expect(thrownError.message).toContain("attempt to write a readonly database");
  });

  test("CREATE TABLE query fails", async () => {
    let thrownError: any;
    try {
      await runQuery(sql, "CREATE TABLE posts (id INTEGER)");
    } catch (e) {
      thrownError = e;
    }
    expect(thrownError).toBeDefined();
    expect(thrownError.message).toContain("attempt to write a readonly database");
  });

  test("UPDATE query fails", async () => {
    let thrownError: any;
    try {
      await runQuery(sql, "UPDATE users SET name = 'Alicia' WHERE id = 1");
    } catch (e) {
      thrownError = e;
    }
    expect(thrownError).toBeDefined();
    expect(thrownError.message).toContain("attempt to write a readonly database");
  });

  test("DELETE query fails", async () => {
    let thrownError: any;
    try {
      await runQuery(sql, "DELETE FROM users WHERE id = 1");
    } catch (e) {
      thrownError = e;
    }
    expect(thrownError).toBeDefined();
    expect(thrownError.message).toContain("attempt to write a readonly database");
  });
});

describe("createConnection readonly enforcement", () => {
  const testDbPath = `/tmp/dbcli-sqlite-variants-${Date.now()}.db`;

  beforeAll(() => {
    const db = new Database(testDbPath);
    db.run("CREATE TABLE users (id INTEGER, name TEXT)");
    db.close();
  });

  afterAll(async () => {
    await Bun.file(testDbPath).delete();
  });

  test("createConnection() creates a readonly in-memory db", async () => {
    const sql = createConnection();
    let thrownError: any;
    try {
      await runQuery(sql, "CREATE TABLE test (id INTEGER)");
    } catch (e) {
      thrownError = e;
    }
    expect(thrownError).toBeDefined();
    expect(thrownError.message).toContain("Connection closed");
    await sql.close();
  });

  test("createConnection(':memory:') creates a readonly in-memory db", async () => {
    const sql = createConnection(":memory:");
    let thrownError: any;
    try {
      await runQuery(sql, "CREATE TABLE test (id INTEGER)");
    } catch (e) {
      thrownError = e;
    }
    expect(thrownError).toBeDefined();
    expect(thrownError.message).toContain("Cannot open an anonymous database in read-only mode.");
    await sql.close();
  });

  test("createConnection('filename.db') creates a readonly connection", async () => {
    const sql = createConnection(testDbPath);
    let thrownError: any;
    try {
      await runQuery(sql, "INSERT INTO users (id, name) VALUES (1, 'A')");
    } catch (e) {
      thrownError = e;
    }
    expect(thrownError).toBeDefined();
    expect(thrownError.message).toContain("attempt to write a readonly database");
    await sql.close();
  });

  test("createConnection('sqlite://filename.db') creates a readonly connection", async () => {
    const sql = createConnection(`sqlite://${testDbPath}`);
    let thrownError: any;
    try {
      await runQuery(sql, "INSERT INTO users (id, name) VALUES (2, 'B')");
    } catch (e) {
      thrownError = e;
    }
    expect(thrownError).toBeDefined();
    expect(thrownError.message).toContain("attempt to write a readonly database");
    await sql.close();
  });

  test("createConnection('filename.db', { readonly: false }) creates a writable connection", async () => {
    const writableTestDbPath = `/tmp/dbcli-sqlite-writable-${Date.now()}.db`;
    const sql = createConnection(writableTestDbPath, { readonly: false });

    await runQuery(sql, "CREATE TABLE temp_users (id INTEGER PRIMARY KEY, name TEXT)");
    await runQuery(sql, "INSERT INTO temp_users (id, name) VALUES (1, 'Charlie')");

    const rows = await runQuery(sql, "SELECT name FROM temp_users WHERE id = 1");
    expect(rows).toEqual([{ name: "Charlie" }]);

    await sql.close();
    await Bun.file(writableTestDbPath).delete();
  });

});
