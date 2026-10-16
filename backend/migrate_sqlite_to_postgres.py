"""
One-off migration: copy data from the local SQLite dev database (loans.db)
into a fresh Render PostgreSQL database, before switching main.py over to
Postgres-only operation.

Usage:
    DATABASE_URL="postgresql://mnc_db_user:2SLyd8fSKZnAsXfM186fjCzY23RCvwIH@dpg-das6kdojo6nc73aea94g-a.oregon-postgres.render.com/mnc_db"

Safe to re-run: it refuses to touch a Postgres database that already has
rows in any of the target tables, so you can't accidentally double-import
or clobber live data.
"""

import os
import sqlite3
from pathlib import Path

import psycopg2
from psycopg2 import sql
from dotenv import load_dotenv

# Dependency order matters: each table must be inserted after the tables
# it has a foreign key into (borrowers -> users, loans -> borrowers,
# installments -> loans). sms_log has no FK constraints, so its position
# doesn't matter, but it's kept last for readability.
TABLES = ("users", "borrowers", "loans", "installments", "sms_log")

SQLITE_PATH = Path(__file__).with_name("loans.db")
load_dotenv(Path(__file__).with_name(".env"))

# The same CREATE TABLE statements main.py's init_db() uses. Defined here
# too so this script is self-contained and doesn't require you to have
# already deployed/run the Flask app against the new DATABASE_URL just to
# get the schema in place.
CREATE_TABLES = [
    """
    CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        name          TEXT NOT NULL,
        email         TEXT NOT NULL UNIQUE,
        phone         TEXT NOT NULL,
        id_number     TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        salt          TEXT NOT NULL,
        role          TEXT DEFAULT 'borrower',
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS borrowers (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER UNIQUE,
        name       TEXT NOT NULL,
        email      TEXT,
        phone      TEXT,
        id_number  TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS loans (
        id                SERIAL PRIMARY KEY,
        borrower_id       INTEGER NOT NULL,
        principal         DOUBLE PRECISION NOT NULL,
        reducing_rate     DOUBLE PRECISION NOT NULL,
        tenure_months     INTEGER NOT NULL,
        disbursement_date TEXT NOT NULL,
        status            TEXT DEFAULT 'active',
        created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (borrower_id) REFERENCES borrowers(id) ON DELETE CASCADE
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS installments (
        id                SERIAL PRIMARY KEY,
        loan_id           INTEGER NOT NULL,
        installment_no    INTEGER NOT NULL,
        due_date          TEXT NOT NULL,
        amount            DOUBLE PRECISION NOT NULL,
        principal_portion DOUBLE PRECISION NOT NULL,
        interest_portion  DOUBLE PRECISION NOT NULL,
        paid_date         TEXT,
        status            TEXT DEFAULT 'pending',
        FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS sms_log (
        id          SERIAL PRIMARY KEY,
        phone       TEXT NOT NULL,
        message     TEXT NOT NULL,
        status      TEXT DEFAULT 'sent',
        sent_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        borrower_id INTEGER,
        loan_id     INTEGER
    );
    """,
]

# Old SQLite databases that predate the flat_rate -> reducing_rate rename
# (see init_db() in main.py) still have a column called "flat_rate" on
# loans. Map it to the current name so the INSERT targets a real column.
COLUMN_RENAMES = {
    "loans": {"flat_rate": "reducing_rate"},
}


def normalize_database_url(url: str) -> str:
    # Render (and some other hosts) hand out "postgres://" URLs; some
    # libpq/psycopg2 builds only accept "postgresql://".
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


def ensure_schema(destination):
    with destination.cursor() as c:
        for statement in CREATE_TABLES:
            c.execute(statement)
    destination.commit()


def table_exists_in_sqlite(source, table: str) -> bool:
    row = source.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None


def main():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("Set DATABASE_URL to the Render PostgreSQL external URL first.")
    database_url = normalize_database_url(database_url)

    if not SQLITE_PATH.exists():
        raise SystemExit(
            f"SQLite database not found: {SQLITE_PATH}\n"
            "If your dev database has a different filename, edit SQLITE_PATH above."
        )

    source = sqlite3.connect(f"file:{SQLITE_PATH}?mode=ro", uri=True)
    destination = psycopg2.connect(database_url)

    try:
        # Make sure the target tables exist before we touch them, so this
        # script works against a brand-new Postgres database with nothing
        # set up yet.
        ensure_schema(destination)

        with destination:
            with destination.cursor() as target:
                target_counts = {}
                for table in TABLES:
                    target.execute(
                        sql.SQL("SELECT COUNT(*) FROM {}").format(sql.Identifier(table))
                    )
                    target_counts[table] = target.fetchone()[0]

                if any(target_counts.values()):
                    raise SystemExit(
                        "PostgreSQL is not empty; refusing to import to avoid overwriting or mixing data: "
                        f"{target_counts}"
                    )

                for table in TABLES:
                    if not table_exists_in_sqlite(source, table):
                        print(f"  {table}: not present in SQLite source, skipping")
                        continue

                    source_cursor = source.execute(f'SELECT * FROM "{table}" ORDER BY id')
                    columns = [column[0] for column in source_cursor.description]

                    renames = COLUMN_RENAMES.get(table, {})
                    columns = [renames.get(col, col) for col in columns]

                    rows = source_cursor.fetchall()
                    if not rows:
                        print(f"  {table}: 0 rows, nothing to copy")
                        continue

                    insert = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                        sql.Identifier(table),
                        sql.SQL(", ").join(map(sql.Identifier, columns)),
                        sql.SQL(", ").join(sql.Placeholder() for _ in columns),
                    )
                    target.executemany(insert.as_string(destination), rows)
                    print(f"  {table}: copied {len(rows)} row(s)")

                for table in TABLES:
                    target.execute(
                        sql.SQL(
                            "SELECT setval(pg_get_serial_sequence(%s, 'id'), "
                            "COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM {}"
                        ).format(sql.Identifier(table)),
                        (table,),
                    )

        print("\nMigration complete. Row counts copied:")
        for table in TABLES:
            if table_exists_in_sqlite(source, table):
                count = source.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
            else:
                count = 0
            print(f"  {table}: {count}")
    finally:
        source.close()
        destination.close()


if __name__ == "__main__":
    main()