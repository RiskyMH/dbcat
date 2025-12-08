import { describe, test, expect, afterAll } from "bun:test";
import { tmpdir } from "os";
import { createConnection } from "../src/index.ts";

const tempFiles: string[] = [];

afterAll(async () => {
  for (const file of tempFiles) {
    try {
      await Bun.file(file).delete();
    } catch {}
  }
});

describe("createConnection", () => {
  describe("postgres", () => {
    test("detects postgres:// protocol", () => {
      const sql = createConnection("postgres://localhost/db");
      expect(sql.options.adapter).toBe("postgres");
      sql.close();
    });

    test("detects postgresql:// protocol", () => {
      const sql = createConnection("postgresql://user:pass@localhost:5432/mydb");
      expect(sql.options.adapter).toBe("postgres");
      sql.close();
    });
  });

  describe("mysql", () => {
    test("detects mysql:// protocol", () => {
      const sql = createConnection("mysql://localhost/db");
      expect(sql.options.adapter).toBe("mysql");
      sql.close();
    });

    test("detects mysql2:// protocol", () => {
      const sql = createConnection("mysql2://user:pass@localhost:3306/mydb");
      expect(sql.options.adapter).toBe("mysql");
      sql.close();
    });
  });

  describe("sqlite", () => {
    test("detects sqlite:// protocol", () => {
      const sql = createConnection("sqlite://:memory:");
      expect(sql.options.adapter).toBe("sqlite");
      sql.close();
    });

    test("detects :memory:", () => {
      const sql = createConnection(":memory:");
      expect(sql.options.adapter).toBe("sqlite");
      sql.close();
    });

    test("detects .db extension", () => {
      const path = `${tmpdir()}/dbcli-test-${Date.now()}.db`;
      tempFiles.push(path);
      const sql = createConnection(path);
      expect(sql.options.adapter).toBe("sqlite");
      sql.close();
    });

    test("detects .sqlite extension", () => {
      const path = `${tmpdir()}/dbcli-test-${Date.now()}.sqlite`;
      tempFiles.push(path);
      const sql = createConnection(path);
      expect(sql.options.adapter).toBe("sqlite");
      sql.close();
    });

    test("detects .sqlite3 extension", () => {
      const path = `${tmpdir()}/dbcli-test-${Date.now()}.sqlite3`;
      tempFiles.push(path);
      const sql = createConnection(path);
      expect(sql.options.adapter).toBe("sqlite");
      sql.close();
    });
  });
});
