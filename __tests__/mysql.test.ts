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

interface DbConfig {
  name: string;
  image: string;
  protocol: string;
  adapter: "mysql" | "mariadb";
}

const databases: DbConfig[] = [
  { name: "MySQL", image: "mysql:8", protocol: "mysql", adapter: "mysql" },
  { name: "MariaDB", image: "mariadb:11", protocol: "mariadb", adapter: "mariadb" },
];

async function startContainer(config: DbConfig): Promise<Container> {
  const name = `dbcli-test-${config.protocol}-${Date.now()}`;
  const port = getAvailablePort();

  await $`docker run -d --name ${name} \
    -e MYSQL_ROOT_PASSWORD=testpass \
    -e MYSQL_DATABASE=testdb \
    -p ${port}:3306 \
    ${config.image}`.quiet();

  // Wait for ready
  const start = Date.now();
  while (Date.now() - start < 60000) {
    try {
      const logs = await $`docker logs ${name} 2>&1`.text();
      if (logs.includes("port: 3306") && logs.includes("ready for connections")) {
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

describe.skipIf(!(await isDockerAvailable())).each(databases)("$name", (config) => {
  let container: Container;
  let sql: ReturnType<typeof createConnection>;
  let connectionUrl: string;

  beforeAll(async () => {
    container = await startContainer(config);
    connectionUrl = `${config.protocol}://root:testpass@localhost:${container.port}/testdb`;

    const { SQL } = await import("bun");
    const setupSql = new SQL(connectionUrl);
    await setupSql`CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255))`;
    await setupSql`CREATE TABLE posts (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255))`;
    await setupSql`INSERT INTO users (name) VALUES ('Alice')`;
    await setupSql`INSERT INTO posts (title) VALUES ('Hello')`;
    await setupSql.close();

    sql = createConnection(connectionUrl);
  }, 90000);

  afterAll(async () => {
    if (sql) await sql.close();
    if (container) await container.stop();
  });

  test("creates connection with correct adapter", () => {
    expect(sql.options.adapter).toBe(config.adapter);
  });

  test("getAllTables returns table names", async () => {
    const tables = await getAllTables(sql);
    expect(tables).toEqual([{ name: "posts" }, { name: "users" }]);
  });

  test("getTableData returns rows", async () => {
    const rows = await getTableData(sql, "users");
    expect(rows).toEqual([{ id: 1, name: "Alice" }]);
  });

  test("runQuery executes custom SQL", async () => {
    const rows = await runQuery(sql, "SELECT name FROM users");
    expect(rows).toEqual([{ name: "Alice" }]);
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

    const clean = Bun.stripANSI(stdout);
    expect(clean).toContain("Connected to testdb");
    expect(clean).toContain("posts");
    expect(clean).toContain("users");
    expect(clean).toContain("Alice");
    expect(clean).toContain("Hello");
  });

  test("CLI runs piped query", async () => {
    const proc = Bun.spawn(["bun", "src/index.ts", connectionUrl], {
      cwd: import.meta.dir + "/..",
      stdin: new Blob(["SELECT name FROM users"]),
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    const clean = Bun.stripANSI(stdout);
    expect(clean).toContain("Result");
    expect(clean).toContain("Alice");
  });
});
