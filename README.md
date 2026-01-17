# `dbcat`

A simple CLI to view database tables. Supports PostgreSQL, MySQL, and SQLite.

```sh
bunx dbcat ./data.db
```

## Usage

Connect to a database to browse all tables:

```sh
# No argument - uses DATABASE_URL environment variable
bunx dbcat

# SQLite
bunx dbcat ./database.sqlite
bunx dbcat https://example.com/data.db

# PostgreSQL
bunx dbcat postgres://user:pass@localhost:5432/mydb

# MySQL
bunx dbcat mysql://user:pass@localhost:3306/mydb
```

Run a query by piping SQL:

```sh
echo "SELECT * FROM users" | bunx dbcat ./data.db
```

### Options

| Flag           | Description                                                   |
|----------------|---------------------------------------------------------------|
| `--full`, `-f` | Show all rows & data when browsing tables (default: 100 rows) |
| `--json`       | Output as JSON (indented if TTY)                              |
| `--json=color` | Output as normal object console.log                           |

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

### Git diffable

Do these things to make git use `dbcat` to diff your sqlite databases:

```sh
# .gitattributes
*.sqlite binary diff=dbcat
*.db binary diff=dbcat
```

```sh
git config diff.lockb.textconv "bunx dbcat --full"
git config diff.lockb.binary true
```

And now you should be able to use

```sh
git diff ./data.db
```


## Requirements

[Bun](https://bun.sh) v1.3+
