"""
One-off cleanup: empty out the test data currently sitting in the Render
PostgreSQL database, so migrate_sqlite_to_postgres.py can import the real
SQLite data without hitting the "database is not empty" safety check.

This TRUNCATEs the app's tables (not the whole database) and resets their
SERIAL id sequences back to 1, so the next real insert starts clean.

Usage:
    python wipe_postgres_data.py

It will print the row counts it's about to delete and ask for a typed
confirmation before doing anything irreversible.
"""

import os
import sys
from pathlib import Path

import psycopg2
from psycopg2 import sql
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

TABLES = ("users", "borrowers", "loans", "installments", "sms_log")


def normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


def main():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("Set DATABASE_URL (in your .env) first.")
    if not sys.stdin.isatty():
        raise SystemExit(
            "This command needs an interactive terminal for its wipe confirmation. "
            "Run it from the VS Code integrated Terminal, not the Output panel."
        )
    database_url = normalize_database_url(database_url)

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as c:
            counts = {}
            for table in TABLES:
                c.execute(sql.SQL("SELECT COUNT(*) FROM {}").format(sql.Identifier(table)))
                counts[table] = c.fetchone()[0]

        print("Current row counts in PostgreSQL:")
        for table, n in counts.items():
            print(f"  {table}: {n}")

        if not any(counts.values()):
            print("\nAll target tables are already empty — nothing to do.")
            return

        try:
            answer = input(
                "\nThis will PERMANENTLY DELETE all rows above from the live "
                "PostgreSQL database. Type 'wipe' to continue: "
            )
        except EOFError:
            raise SystemExit(
                "No interactive input was available; nothing was deleted. "
                "Run this command from an interactive terminal."
            ) from None
        if answer.strip().lower() != "wipe":
            print("Aborted. Nothing was deleted.")
            return

        with conn:
            with conn.cursor() as c:
                # RESTART IDENTITY resets each table's SERIAL id sequence
                # back to 1. CASCADE handles the FK relationships between
                # these tables so order doesn't matter here.
                c.execute(
                    sql.SQL("TRUNCATE TABLE {} RESTART IDENTITY CASCADE").format(
                        sql.SQL(", ").join(sql.Identifier(t) for t in TABLES)
                    )
                )

        print("\nDone. All target tables are now empty and id sequences reset.")
        print("You can now run: python migrate_sqlite_to_postgres.py")
    finally:
        conn.close()


if __name__ == "__main__":
    main()