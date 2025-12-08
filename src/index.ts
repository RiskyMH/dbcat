#!/usr/bin/env bun

if (typeof Bun !== "object") throw new Error("Please install & use bun!");

import { printTable } from "./table.ts";

export function createConnection(input?: string): InstanceType<typeof Bun.SQL> {
  if (!input) {
    return new Bun.SQL();
  }

  if (
    !input.includes("://") &&
    (input.endsWith(".db") ||
      input.endsWith(".sqlite") ||
      input.endsWith(".sqlite3"))
  ) {
    return new Bun.SQL(`sqlite://${input}`);
  }

  return new Bun.SQL(input);
}

export async function getDatabaseName(
  sql: InstanceType<typeof Bun.SQL>
): Promise<string | null> {
  const adapter = sql.options.adapter;

  switch (adapter) {
    case "postgres": {
      const result = await sql`SELECT current_database() as name`;
      return result[0]?.name ?? null;
    }
    case "mysql":
    case "mariadb": {
      const result = await sql`SELECT DATABASE() as name`;
      return result[0]?.name ?? null;
    }
    case "sqlite": {
      const filename = sql.options.filename;
      if (!filename || filename === ":memory:") return null;

      return filename.toString().split("/").at(-1) ?? null;
    }
    default:
      return null;
  }
}

export function getAllTables(sql: InstanceType<typeof Bun.SQL>) {
  const adapter = sql.options.adapter;

  switch (adapter) {
    case "postgres":
      return sql`
        SELECT CASE 
          WHEN table_schema = 'public' THEN table_name 
          ELSE table_schema || '.' || table_name 
        END as name
        FROM information_schema.tables 
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name
      ` as Promise<{ name: string }[]>;
    case "mysql":
    case "mariadb":
      return sql`
        SELECT table_name as name 
        FROM information_schema.tables 
        WHERE table_schema = DATABASE()
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      ` as Promise<{ name: string }[]>;
    case "sqlite":
      return sql`
        SELECT name 
        FROM sqlite_master 
        WHERE type = 'table' 
        AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      ` as Promise<{ name: string }[]>;
    default:
      throw new Error(`Unsupported adapter: ${adapter}`);
  }
}

export async function getTableCount(
  sql: InstanceType<typeof Bun.SQL>,
  tableName: string
): Promise<number> {
  const result = await sql`SELECT COUNT(*) as count FROM ${sql(tableName)}`;
  return Number(result[0]?.count ?? 0);
}

export function getTableData(
  sql: InstanceType<typeof Bun.SQL>,
  tableName: string,
  limit?: number
): Promise<Record<string, unknown>[]> {
  if (limit === undefined) {
    return sql`SELECT * FROM ${sql(tableName)}`;
  }
  return sql`SELECT * FROM ${sql(tableName)} LIMIT ${limit}`;
}

export function runQuery(sql: InstanceType<typeof Bun.SQL>, query: string) {
  return sql.unsafe(query) as Promise<Record<string, unknown>[]>;
}

function displayTable(
  tableName: string,
  rows: Record<string, unknown>[],
  totalRows?: number,
  maxRows?: number
) {
  console.log();
  printTable(rows, { title: tableName, totalRows, maxRows });
}

function displayQueryResult(rows: Record<string, unknown>[]) {
  printTable(rows, { title: "Result", maxRows: Infinity });
}

async function readStdin(): Promise<string | null> {
  if (process.stdin.isTTY) {
    return null;
  }

  try {
    const text = await Bun.stdin.text();
    return text.trim() || null;
  } catch {
    return null;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  let input: string | undefined;
  let full = false;
  let json: false | "plain" | "color" = false;

  for (const arg of args) {
    if (arg === "--full" || arg === "-f") {
      full = true;
    } else if (arg === "--json") {
      json = "plain";
    } else if (arg === "--json=color") {
      json = "color";
    } else if (!arg.startsWith("-")) {
      input = arg;
    }
  }

  return { input, full, json };
}

const DEFAULT_LIMIT = 100;

function showUsageAndExit(): never {
  console.error("Usage: dbcat <database>");
  console.error("");
  console.error("Examples:");
  console.error("  dbcat ./data.db");
  console.error("  dbcat postgres://user:pass@localhost/mydb");
  console.error("  dbcat mysql://user:pass@localhost/mydb");
  console.error("");
  console.error("Or set DATABASE_URL environment variable.");
  process.exit(1);
}

function outputJson(data: unknown, color: boolean) {
  if (color) {
    console.log(Bun.inspect(data, { colors: true, depth: Infinity }));
  } else {
    const indent = process.stdout.isTTY ? 2 : undefined;
    console.log(JSON.stringify(data, null, indent));
  }
}

async function main() {
  const { input, full, json } = parseArgs();

  if (!input && !process.env.DATABASE_URL) {
    showUsageAndExit();
  }

  let sql: InstanceType<typeof Bun.SQL>;
  try {
    sql = createConnection(input);
  } catch (error) {
    console.error("Failed to connect:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const isTTY = process.stdout.isTTY;
  const dim = Bun.enableANSIColors ? "\x1b[2m" : "";
  const reset = Bun.enableANSIColors ? "\x1b[0m" : "";
  const bold = Bun.enableANSIColors ? "\x1b[1m" : "";
  const clearLine = Bun.enableANSIColors ? "\x1b[2K\r" : "";

  try {
    const stdinQuery = await readStdin();

    if (stdinQuery) {
      const results = await runQuery(sql, stdinQuery);
      if (json) {
        outputJson(results, json === "color");
      } else {
        displayQueryResult(results);
      }
    } else {
      if (Bun.enableANSIColors && isTTY && !json) {
        process.stdout.write(
          `${dim}Connecting to ${sql.options.adapter}...${reset}`
        );
      }

      const [dbName, tables] = await Promise.all([
        getDatabaseName(sql),
        getAllTables(sql),
      ]);

      if (json) {
        const result: Record<string, unknown[]> = {};
        for (const table of tables) {
          const data = full
            ? await getTableData(sql, table.name)
            : await getTableData(sql, table.name, DEFAULT_LIMIT);
          result[table.name] = data;
        }
        outputJson(result, json === "color");
      } else {
        if (Bun.enableANSIColors && isTTY) process.stdout.write(clearLine);
        const dbDisplay = dbName
          ? `${bold}${dbName}${reset}`
          : `${bold}${sql.options.adapter}${reset} ${dim}database${reset}`;
        console.log(`${dim}Connected to${reset} ${dbDisplay}`);

        if (tables.length === 0) {
          console.log(`${dim}No tables found.${reset}`);
        } else {
          for (const table of tables) {
            if (full) {
              const data = await getTableData(sql, table.name);
              displayTable(table.name, data, undefined, Infinity);
            } else {
              const [count, data] = await Promise.all([
                getTableCount(sql, table.name),
                getTableData(sql, table.name, DEFAULT_LIMIT),
              ]);
              displayTable(table.name, data, count, DEFAULT_LIMIT);
            }
          }
        }
      }
    }
  } catch (error) {
    if (Bun.enableANSIColors && isTTY && !json) {
      process.stdout.write(clearLine);
    }
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes("Connection") ||
      message.includes("connect") ||
      message.includes("ECONNREFUSED")
    ) {
      console.error(`Failed to connect to ${sql.options.adapter}:`);
    } else {
      console.error("Error:");
    }
    console.error(message);
    process.exit(1);
  } finally {
    await sql.close();
  }
}

if (import.meta.main) {
  main();
}
