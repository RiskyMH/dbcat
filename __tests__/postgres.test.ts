import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { $ } from "bun";
import {
  createConnection,
  getAllTables,
  getTableData,
  getDatabaseName,
  runQuery,
} from "../src/index.ts";

async function isDockerAvailable(): Promise<boolean> {
  try {
    await $`docker ps`.quiet();
    return true;
  } catch {
    return false;
  }
}

function getAvailablePort(): number {
  const server = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = server.port!;
  server.stop();
  return port;
}

interface Container {
  name: string;
  port: number;
  stop(): Promise<void>;
}

async function startPostgres(): Promise<Container> {
  const name = `dbcli-test-pg-${Date.now()}`;
  const port = getAvailablePort();

  await $`docker run -d --name ${name} \
    -e POSTGRES_PASSWORD=testpass \
    -e POSTGRES_DB=testdb \
    -p ${port}:5432 \
    postgres:16-alpine`.quiet();

  // Wait for ready
  const start = Date.now();
  while (Date.now() - start < 30000) {
    try {
      const logs = await $`docker logs ${name} 2>&1`.text();
      if (logs.includes("database system is ready to accept connections")) {
        await Bun.sleep(1000);
        break;
      }
    } catch {}
    await Bun.sleep(500);
  }

  return {
    name,
    port,
    async stop() {
      await $`docker rm -f ${name}`.quiet();
    },
  };
}

describe.skipIf(!(await isDockerAvailable()))("PostgreSQL", () => {
  let container: Container;
  let sql: ReturnType<typeof createConnection>;
  let connectionUrl: string;

  beforeAll(async () => {
    container = await startPostgres();
    connectionUrl = `postgres://postgres:testpass@localhost:${container.port}/testdb`;

    const setupSql = new Bun.SQL(connectionUrl);
    await setupSql`CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT, email TEXT)`;
    await setupSql`CREATE TABLE posts (id SERIAL PRIMARY KEY, title TEXT)`;
    await setupSql`INSERT INTO users (name, email) VALUES ('Alice', 'alice@test.com')`;
    await setupSql`INSERT INTO posts (title) VALUES ('Hello')`;
    await setupSql.close();

    sql = createConnection(connectionUrl);
  }, 60000);

  afterAll(async () => {
    if (sql) await sql.close();
    if (container) await container.stop();
  });

  test("creates connection with correct adapter", () => {
    expect(sql.options.adapter).toBe("postgres");
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
]
`);
  });

  test("runQuery executes custom SQL", async () => {
    const rows = await runQuery(sql, "SELECT name FROM users");
    expect(rows).toMatchInlineSnapshot(`
[
  {
    "name": "Alice",
  },
]
`);
  });

  test("getDatabaseName returns database name", async () => {
    const name = await getDatabaseName(sql);
    expect(name).toBe("testdb");
  });

  test("CLI shows tables", async () => {
    const proc = Bun.spawn(["bun", "src/index.ts", connectionUrl], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    // Strip ANSI codes for snapshot
    const clean = Bun.stripANSI(stdout);
    expect(clean).toMatchInlineSnapshot(`
"Connected to testdb

╭─ posts ────╮
│ id │ title │
├────┼───────┤
│  1 │ Hello │
╰────┴───────╯

╭─ users ────┬────────────────╮
│ id │ name  │ email          │
├────┼───────┼────────────────┤
│  1 │ Alice │ alice@test.com │
╰────┴───────┴────────────────╯
"
`);
  });

  test("CLI runs piped query", async () => {
    const proc = Bun.spawn(["bun", "src/index.ts", connectionUrl], {
      cwd: import.meta.dir + "/..",
      stdin: new Blob(["SELECT name, email FROM users"]),
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
╰───────┴────────────────╯
"
`);
  });
});
