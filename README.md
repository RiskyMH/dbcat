# `dbcat`

A simple CLI to view database tables. Supports PostgreSQL, MySQL, and SQLite.

```sh
bunx dbcat ./data.db
```

## Usage

Connect to a database to browse all tables:

```sh
# SQLite file
bunx dbcat ./database.sqlite

# PostgreSQL
bunx dbcat postgres://user:pass@localhost:5432/mydb

# MySQL
bunx dbcat mysql://user:pass@localhost:3306/mydb

# No argument - uses DATABASE_URL environment variable
bunx dbcat
```

Run a query by piping SQL:

```sh
echo "SELECT * FROM users WHERE active = true" | bunx dbcat ./data.db
```

### Options

| Flag | Description |
|------|-------------|
| `--full`, `-f` | Show all rows when browsing tables (default: 100) |
| `--json` | Output as JSON (indented if TTY) |
| `--json=color` | Output as normal object console.log |

Piped queries always return all rows.

## Example

```sh
$ bunx dbcat ./demo.sqlite
Connected to demo.sqlite

╭─ users ────────────┬───────────────────┬─────────────────────╮
│ id │ name          │ email             │ created_at          │
├────┼───────────────┼───────────────────┼─────────────────────┤
│  1 │ Alice Johnson │ alice@example.com │ 2025-12-08 05:25:21 │
│  2 │ Bob Smith     │ bob@example.com   │ 2025-12-08 05:25:21 │
│  3 │ Carol White   │ carol@example.com │ 2025-12-08 05:25:21 │
│ ... 47 more rows                                             │
╰──────────────────────────────────────────────────────────────╯
```

### Scrollable Output

Pipe to `less -R` for scrollable output with colors:

```sh
bunx dbcat ./data.db --full | less -R
```

## Requirements

[Bun](https://bun.sh) v1.3+
