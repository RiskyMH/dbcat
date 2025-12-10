import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function runCli(
  args: string[],
  stdin?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", "src/index.ts", ...args], {
    cwd: import.meta.dir + "/..",
    stdin: stdin ? new Blob([stdin]) : undefined,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  return { stdout, stderr, exitCode: await proc.exited };
}

describe("CLI", () => {
  const testDbPath = join(tmpdir(), `dbcli-cli-${Date.now()}.db`);
  const largeDbPath = join(tmpdir(), `dbcli-large-${Date.now()}.db`);

  beforeAll(() => {
    // Small test db
    const db = new Database(testDbPath);
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
    db.run("INSERT INTO users VALUES (1, 'TestUser')");
    db.close();

    // Large test db for --full flag testing
    const largeDb = new Database(largeDbPath);
    largeDb.run("CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)");
    for (let i = 1; i <= 150; i++) {
      largeDb.run(`INSERT INTO items VALUES (${i}, 'item${i}')`);
    }
    largeDb.close();
  });

  afterAll(async () => {
    await Promise.all([
      Bun.file(testDbPath).delete(),
      Bun.file(largeDbPath).delete(),
    ]);
  });

  test("shows tables when run without stdin", async () => {
    const { stdout, exitCode } = await runCli([testDbPath]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Connected to");
    expect(stdout).toContain("users"); // Table name in border
    expect(stdout).toContain("TestUser");
  });

  test("executes piped query", async () => {
    const { stdout, exitCode } = await runCli([testDbPath], "SELECT * FROM users");

    expect(exitCode).toBe(0);
    expect(stdout).toContain("TestUser");
    expect(stdout).toContain("Result"); // Table title
  });

  test("shows no results for empty query", async () => {
    const { stdout, exitCode } = await runCli(
      [testDbPath],
      "SELECT * FROM users WHERE id = 999"
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("(empty)");
  });

  test("handles invalid SQL gracefully", async () => {
    const { stderr, exitCode } = await runCli([testDbPath], "INVALID SQL QUERY");

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Error");
  });

  test("handles nonexistent database", async () => {
    const { exitCode } = await runCli(["/nonexistent/path.db"]);

    expect(exitCode).toBe(1);
  });

  test("--full flag shows all rows without truncation", async () => {
    const { stdout, exitCode } = await runCli([largeDbPath, "--full"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("item1");
    expect(stdout).toContain("item150");
    // Should NOT contain truncation message
    expect(stdout).not.toContain("more rows");
  });

  test("-f shorthand works same as --full", async () => {
    const { stdout, exitCode } = await runCli([largeDbPath, "-f"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("item150");
    expect(stdout).not.toContain("more rows");
  });

  test("without --full truncates large tables", async () => {
    const { stdout, exitCode } = await runCli([largeDbPath]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("item1");
    expect(stdout).toContain("item100");
    // Should show truncation indicator (may be truncated in narrow terminals)
    expect(stdout).toMatch(/\.\.\. 50 more/);
    // Should NOT contain item150 since we only show 100
    expect(stdout).not.toContain("item150");
  });

  test("shows database filename for sqlite", async () => {
    const { stdout, exitCode } = await runCli([testDbPath]);

    expect(exitCode).toBe(0);
    // Should show filename, not just "sqlite database"
    expect(stdout).toMatch(/Connected to.*\.db/);
  });
});
