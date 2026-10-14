import os
import sqlite3
from pathlib import Path

import psycopg2
from psycopg2 import sql


TABLES = ("users", "borrowers", "loans", "installments", "sms_log")
SQLITE_PATH = Path(__file__).with_name("loans.db")


def main():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("Set DATABASE_URL to the Render PostgreSQL external URL first.")

    if not SQLITE_PATH.exists():
        raise SystemExit(f"SQLite database not found: {SQLITE_PATH}")

    source = sqlite3.connect(f"file:{SQLITE_PATH}?mode=ro", uri=True)
    destination = psycopg2.connect(database_url)

    try:
        with destination:
            with destination.cursor() as target:
                target_counts = {}
                for table in TABLES:
                    target.execute(sql.SQL("SELECT COUNT(*) FROM {}").format(sql.Identifier(table)))
                    target_counts[table] = target.fetchone()[0]

                if any(target_counts.values()):
                    raise SystemExit(
                        "PostgreSQL is not empty; refusing to import to avoid overwriting or mixing data: "
                        f"{target_counts}"
                    )

                for table in TABLES:
                    source_cursor = source.execute(f'SELECT * FROM "{table}" ORDER BY id')
                    columns = [column[0] for column in source_cursor.description]
                    rows = source_cursor.fetchall()
                    if not rows:
                        continue

                    insert = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                        sql.Identifier(table),
                        sql.SQL(", ").join(map(sql.Identifier, columns)),
                        sql.SQL(", ").join(sql.Placeholder() for _ in columns),
                    )
                    target.executemany(insert.as_string(destination), rows)

                for table in TABLES:
                    target.execute(
                        sql.SQL(
                            "SELECT setval(pg_get_serial_sequence(%s, 'id'), "
                            "COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM {}"
                        ).format(sql.Identifier(table)),
                        (table,),
                    )

        print("Migration complete:")
        for table in TABLES:
            count = source.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
            print(f"  {table}: {count}")
    finally:
        source.close()
        destination.close()


if __name__ == "__main__":
    main()