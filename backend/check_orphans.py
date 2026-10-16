"""
Diagnostic: find rows in the local SQLite dev database (loans.db) that
reference a parent row which doesn't exist — i.e. foreign-key orphans.
SQLite doesn't enforce FKs by default, so these can build up silently
over time (e.g. a loan deleted directly in a DB browser without its
installments, or a leftover row from early dev/testing) and only
surface once you migrate to a database that DOES enforce them, like
Postgres.

This script only reads and reports. It changes nothing by default.
Pass --delete to actually remove the orphaned rows it finds (asks for
a typed confirmation first).

Usage:
    python check_orphans.py            # just report what's orphaned
    python check_orphans.py --delete   # report, then offer to delete
"""

import sqlite3
import sys
from pathlib import Path

SQLITE_PATH = Path(__file__).with_name("loans.db")

# (child table, child FK column, parent table, parent PK column)
CHECKS = [
    ("borrowers",    "user_id",    "users",  "id"),
    ("loans",        "borrower_id", "borrowers", "id"),
    ("installments", "loan_id",    "loans",  "id"),
    ("sms_log",       "borrower_id", "borrowers", "id"),
    ("sms_log",       "loan_id",    "loans",  "id"),
]


def table_exists(conn, table):
    return conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone() is not None


def main():
    if not SQLITE_PATH.exists():
        raise SystemExit(f"SQLite database not found: {SQLITE_PATH}")

    do_delete = "--delete" in sys.argv
    print(
        f"Checking SQLite database: {SQLITE_PATH}\n"
        f"Mode: {'delete (confirmation required)' if do_delete else 'report only'}",
        flush=True,
    )

    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row

    any_orphans = False
    to_delete = []  # (child_table, list_of_ids)

    for child, fk_col, parent, pk_col in CHECKS:
        if not table_exists(conn, child) or not table_exists(conn, parent):
            continue

        rows = conn.execute(
            f'SELECT id, "{fk_col}" FROM "{child}" '
            f'WHERE "{fk_col}" IS NOT NULL '
            f'AND "{fk_col}" NOT IN (SELECT "{pk_col}" FROM "{parent}")'
        ).fetchall()

        if rows:
            any_orphans = True
            ids = [r["id"] for r in rows]
            print(f'{child}: {len(rows)} row(s) with no matching "{parent}" row')
            for r in rows:
                print(f'    {child}.id={r["id"]}  {fk_col}={r[fk_col]}  (missing in {parent})')
            to_delete.append((child, ids))

    if not any_orphans:
        print("No orphaned rows found. The ForeignKeyViolation may have another cause —")
        print("paste this script's output back so it can be looked into further.")
        conn.close()
        return

    if not do_delete:
        print("\nRun with --delete to remove these rows (asks for confirmation first).")
        conn.close()
        return

    if not sys.stdin.isatty():
        conn.close()
        raise SystemExit(
            "Cannot prompt for confirmation because standard input is not an "
            "interactive terminal. Run --delete from the VS Code integrated Terminal."
        )

    print(
        "\nThis will permanently delete the orphaned rows listed above "
        "from your LOCAL loans.db."
    )
    try:
        answer = input("Type 'delete' to continue: ")
    except EOFError:
        conn.close()
        raise SystemExit("No confirmation was received; nothing was deleted.") from None
    if answer.strip().lower() != "delete":
        print("Aborted. Nothing was deleted.")
        conn.close()
        return

    with conn:
        for table, ids in to_delete:
            placeholders = ",".join("?" for _ in ids)
            conn.execute(f'DELETE FROM "{table}" WHERE id IN ({placeholders})', ids)

    print("Done. Orphaned rows removed from loans.db.")
    print("You can now re-run: python migrate_sqlite_to_postgres.py")
    conn.close()


if __name__ == "__main__":
    main()