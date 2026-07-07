from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import hashlib
import secrets
import re
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta

app = Flask(__name__)
CORS(app)

DB_PATH = "loans.db"

# ─── ADMIN CREDENTIALS (hardcoded — change before deploying) ─────────────────
ADMIN_ID_NUMBER = "22238204"
ADMIN_PASSWORD  = "@Crownsandroses1"   # meets all password rules
ADMIN_NAME      = "MnC Admin"

# ─── DB INIT ─────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT NOT NULL,
            email         TEXT NOT NULL UNIQUE,
            phone         TEXT NOT NULL,
            id_number     TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            salt          TEXT NOT NULL,
            role          TEXT DEFAULT 'borrower',
            created_at    TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS borrowers (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER UNIQUE,
            name       TEXT NOT NULL,
            email      TEXT,
            phone      TEXT,
            id_number  TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS loans (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            borrower_id       INTEGER NOT NULL,
            principal         REAL NOT NULL,
            flat_rate         REAL NOT NULL,
            tenure_months     INTEGER NOT NULL,
            disbursement_date TEXT NOT NULL,
            status            TEXT DEFAULT 'active',
            created_at        TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (borrower_id) REFERENCES borrowers(id)
        );

        CREATE TABLE IF NOT EXISTS installments (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            loan_id           INTEGER NOT NULL,
            installment_no    INTEGER NOT NULL,
            due_date          TEXT NOT NULL,
            amount            REAL NOT NULL,
            principal_portion REAL NOT NULL,
            interest_portion  REAL NOT NULL,
            paid_date         TEXT,
            status            TEXT DEFAULT 'pending',
            FOREIGN KEY (loan_id) REFERENCES loans(id)
        );
    """)
    conn.commit()
    conn.close()

init_db()

# ─── AUTH HELPERS ─────────────────────────────────────────────────────────────

def hash_password(password, salt):
    return hashlib.sha256((salt + password).encode()).hexdigest()

def validate_password(password):
    """Returns (ok: bool, message: str)"""
    if len(password) < 8 or len(password) > 16:
        return False, "Password must be 8–16 characters long."
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter."
    if not re.search(r"[0-9]", password):
        return False, "Password must contain at least one number."
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?]", password):
        return False, "Password must contain at least one special character."
    return True, ""

def validate_id_number(id_number):
    return re.fullmatch(r"\d{8}", id_number) is not None

# ─── AUTH ROUTES ──────────────────────────────────────────────────────────────

@app.route("/auth/register", methods=["POST"])
def register():
    data = request.get_json()
    required = ["name", "email", "phone", "id_number", "password"]
    if not data or not all(k in data for k in required):
        return jsonify({"detail": "All fields are required."}), 400

    name      = data["name"].strip()
    email     = data["email"].strip().lower()
    phone     = data["phone"].strip()
    id_number = data["id_number"].strip()
    password  = data["password"]

    if not name:
        return jsonify({"detail": "Name is required."}), 400
    if not re.match(r"[^@]+@[^@]+\.[^@]+", email):
        return jsonify({"detail": "Invalid email address."}), 400
    if not validate_id_number(id_number):
        return jsonify({"detail": "ID number must be exactly 8 digits."}), 400

    ok, msg = validate_password(password)
    if not ok:
        return jsonify({"detail": msg}), 400

    salt          = secrets.token_hex(16)
    password_hash = hash_password(password, salt)

    conn = get_db()
    c    = conn.cursor()

    existing_email = c.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
    if existing_email:
        conn.close()
        return jsonify({"detail": "An account with this email already exists."}), 409

    existing_id = c.execute("SELECT id FROM users WHERE id_number=?", (id_number,)).fetchone()
    if existing_id:
        conn.close()
        return jsonify({"detail": "An account with this ID number already exists."}), 409

    c.execute("""
        INSERT INTO users (name, email, phone, id_number, password_hash, salt, role)
        VALUES (?,?,?,?,?,?,'borrower')
    """, (name, email, phone, id_number, password_hash, salt))
    conn.commit()
    user_id = c.lastrowid

    # Auto-create matching borrower record
    c.execute("""
        INSERT INTO borrowers (user_id, name, email, phone, id_number)
        VALUES (?,?,?,?,?)
    """, (user_id, name, email, phone, id_number))
    conn.commit()
    conn.close()

    return jsonify({
        "message": "Account created successfully.",
        "user": { "id": user_id, "name": name, "email": email, "role": "borrower" }
    }), 201


@app.route("/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    if not data:
        return jsonify({"detail": "Missing request body."}), 400

    id_number = data.get("id_number", "").strip()
    password  = data.get("password", "")

    # ── Admin shortcut ──────────────────────────────────────────────────────
    if id_number == ADMIN_ID_NUMBER and password == ADMIN_PASSWORD:
        return jsonify({
            "user": {
                "id":        0,
                "name":      ADMIN_NAME,
                "id_number": ADMIN_ID_NUMBER,
                "role":      "admin",
                "email":     "admin@mnc.com"
            }
        })

    # ── Regular user ────────────────────────────────────────────────────────
    if not id_number or not password:
        return jsonify({"detail": "ID number and password are required."}), 400

    conn = get_db()
    c    = conn.cursor()
    user = c.execute("SELECT * FROM users WHERE id_number=?", (id_number,)).fetchone()
    conn.close()

    if not user:
        return jsonify({"detail": "Invalid ID number or password."}), 401

    expected = hash_password(password, user["salt"])
    if expected != user["password_hash"]:
        return jsonify({"detail": "Invalid ID number or password."}), 401

    return jsonify({
        "user": {
            "id":        user["id"],
            "name":      user["name"],
            "email":     user["email"],
            "phone":     user["phone"],
            "id_number": user["id_number"],
            "role":      user["role"]
        }
    })


# ─── REMINDERS ───────────────────────────────────────────────────────────────

@app.route("/reminders/<int:user_id>", methods=["GET"])
def get_reminders(user_id):
    """Return unpaid installments due tomorrow for this user's loans."""
    conn = get_db()
    c    = conn.cursor()

    borrower = c.execute("SELECT id FROM borrowers WHERE user_id=?", (user_id,)).fetchone()
    if not borrower:
        conn.close()
        return jsonify([])

    tomorrow = (date.today() + timedelta(days=1)).isoformat()

    rows = c.execute("""
        SELECT i.id, i.installment_no, i.due_date, i.amount,
               l.id as loan_id, l.principal, b.name as borrower_name
        FROM installments i
        JOIN loans l ON i.loan_id = l.id
        JOIN borrowers b ON l.borrower_id = b.id
        WHERE b.id = ? AND i.due_date = ? AND i.status != 'paid'
    """, (borrower["id"], tomorrow)).fetchall()
    conn.close()

    return jsonify([dict(r) for r in rows])


@app.route("/reminders/admin", methods=["GET"])
def get_all_reminders():
    """Admin: all installments due tomorrow across all borrowers."""
    conn = get_db()
    c    = conn.cursor()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()

    rows = c.execute("""
        SELECT i.id, i.installment_no, i.due_date, i.amount,
               l.id as loan_id, b.name as borrower_name,
               b.phone, b.email
        FROM installments i
        JOIN loans l ON i.loan_id = l.id
        JOIN borrowers b ON l.borrower_id = b.id
        WHERE i.due_date = ? AND i.status != 'paid'
        ORDER BY b.name
    """, (tomorrow,)).fetchall()
    conn.close()

    return jsonify([dict(r) for r in rows])


# ─── USERS (admin only) ──────────────────────────────────────────────────────

@app.route("/users", methods=["GET"])
def list_users():
    conn = get_db()
    c    = conn.cursor()
    rows = c.execute("""
        SELECT u.id, u.name, u.email, u.phone, u.id_number, u.role, u.created_at,
               COUNT(l.id) as loan_count,
               COALESCE(SUM(l.principal),0) as total_borrowed
        FROM users u
        LEFT JOIN borrowers b ON b.user_id = u.id
        LEFT JOIN loans l ON l.borrower_id = b.id
        GROUP BY u.id
        ORDER BY u.created_at DESC
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


# ─── BORROWERS ───────────────────────────────────────────────────────────────

@app.route("/borrowers", methods=["GET"])
def list_borrowers():
    conn = get_db()
    c    = conn.cursor()
    rows = c.execute("SELECT * FROM borrowers ORDER BY created_at DESC").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/borrowers", methods=["POST"])
def create_borrower():
    data = request.get_json()
    if not data or not data.get("name", "").strip():
        return jsonify({"detail": "Name is required"}), 400
    conn = get_db()
    c    = conn.cursor()
    c.execute(
        "INSERT INTO borrowers (name, email, phone, id_number) VALUES (?,?,?,?)",
        (data["name"], data.get("email"), data.get("phone"), data.get("id_number"))
    )
    conn.commit()
    bid = c.lastrowid
    row = c.execute("SELECT * FROM borrowers WHERE id=?", (bid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201

@app.route("/borrowers/<int:borrower_id>", methods=["GET"])
def get_borrower(borrower_id):
    conn = get_db()
    c    = conn.cursor()
    row  = c.execute("SELECT * FROM borrowers WHERE id=?", (borrower_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"detail": "Borrower not found"}), 404
    return jsonify(dict(row))

@app.route("/borrowers/by-user/<int:user_id>", methods=["GET"])
def get_borrower_by_user(user_id):
    conn = get_db()
    c    = conn.cursor()
    row  = c.execute("SELECT * FROM borrowers WHERE user_id=?", (user_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"detail": "Borrower not found"}), 404
    return jsonify(dict(row))

@app.route("/borrowers/<int:borrower_id>", methods=["PATCH"])
def update_borrower(borrower_id):
    data = request.get_json()
    if not data or not data.get("name", "").strip():
        return jsonify({"detail": "Name is required"}), 400
    conn = get_db()
    c    = conn.cursor()
    row  = c.execute("SELECT id FROM borrowers WHERE id=?", (borrower_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"detail": "Borrower not found"}), 404
    c.execute("""
        UPDATE borrowers SET name=?, email=?, phone=?, id_number=? WHERE id=?
    """, (data["name"], data.get("email"), data.get("phone"), data.get("id_number"), borrower_id))
    conn.commit()
    updated = c.execute("SELECT * FROM borrowers WHERE id=?", (borrower_id,)).fetchone()
    conn.close()
    return jsonify(dict(updated))

@app.route("/borrowers/<int:borrower_id>", methods=["DELETE"])
def delete_borrower(borrower_id):
    conn = get_db()
    c    = conn.cursor()
    c.execute("DELETE FROM installments WHERE loan_id IN (SELECT id FROM loans WHERE borrower_id=?)", (borrower_id,))
    c.execute("DELETE FROM loans WHERE borrower_id=?", (borrower_id,))
    c.execute("DELETE FROM borrowers WHERE id=?", (borrower_id,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": borrower_id})


# ─── LOANS ───────────────────────────────────────────────────────────────────

def generate_installments(loan_id, principal, flat_rate, tenure_months, disbursement_date):
    total_interest     = principal * (flat_rate / 100) * (tenure_months / 12)
    total_payable      = principal + total_interest
    monthly_installment = round(total_payable / tenure_months, 2)
    monthly_interest   = round(total_interest / tenure_months, 2)
    monthly_principal  = round(principal / tenure_months, 2)

    start = date.fromisoformat(disbursement_date)
    conn  = get_db()
    c     = conn.cursor()
    for i in range(1, tenure_months + 1):
        due = start + relativedelta(months=i)
        amt = monthly_installment
        if i == tenure_months:
            amt = round(total_payable - monthly_installment * (tenure_months - 1), 2)
        c.execute("""
            INSERT INTO installments
            (loan_id, installment_no, due_date, amount, principal_portion, interest_portion)
            VALUES (?,?,?,?,?,?)
        """, (loan_id, i, due.isoformat(), amt, monthly_principal, monthly_interest))
    conn.commit()
    conn.close()

def flag_overdue(c):
    today = date.today().isoformat()
    c.execute("""
        UPDATE installments SET status='overdue'
        WHERE status='pending' AND due_date < ?
    """, (today,))

@app.route("/loans", methods=["GET"])
def list_loans():
    conn = get_db()
    c    = conn.cursor()
    flag_overdue(c)
    conn.commit()
    rows = c.execute("""
        SELECT l.*, b.name as borrower_name
        FROM loans l JOIN borrowers b ON l.borrower_id = b.id
        ORDER BY l.created_at DESC
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/loans/by-borrower/<int:borrower_id>", methods=["GET"])
def loans_by_borrower(borrower_id):
    conn = get_db()
    c    = conn.cursor()
    flag_overdue(c)
    conn.commit()
    rows = c.execute("""
        SELECT l.*, b.name as borrower_name
        FROM loans l JOIN borrowers b ON l.borrower_id = b.id
        WHERE l.borrower_id = ?
        ORDER BY l.created_at DESC
    """, (borrower_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/loans", methods=["POST"])
def create_loan():
    data     = request.get_json()
    required = ["borrower_id", "principal", "flat_rate", "tenure_months", "disbursement_date"]
    if not data or not all(k in data for k in required):
        return jsonify({"detail": "Missing required fields"}), 400

    conn     = get_db()
    c        = conn.cursor()
    borrower = c.execute("SELECT id FROM borrowers WHERE id=?", (data["borrower_id"],)).fetchone()
    if not borrower:
        conn.close()
        return jsonify({"detail": "Borrower not found"}), 404

    c.execute("""
        INSERT INTO loans (borrower_id, principal, flat_rate, tenure_months, disbursement_date)
        VALUES (?,?,?,?,?)
    """, (data["borrower_id"], data["principal"], data["flat_rate"],
          data["tenure_months"], data["disbursement_date"]))
    conn.commit()
    loan_id = c.lastrowid
    conn.close()

    generate_installments(loan_id, data["principal"], data["flat_rate"],
                          data["tenure_months"], data["disbursement_date"])

    conn2 = get_db()
    c2    = conn2.cursor()
    row   = c2.execute("""
        SELECT l.*, b.name as borrower_name
        FROM loans l JOIN borrowers b ON l.borrower_id = b.id
        WHERE l.id=?
    """, (loan_id,)).fetchone()
    conn2.close()
    return jsonify(dict(row)), 201

@app.route("/loans/<int:loan_id>", methods=["GET"])
def get_loan(loan_id):
    conn = get_db()
    c    = conn.cursor()
    flag_overdue(c)
    conn.commit()
    row = c.execute("""
        SELECT l.*, b.name as borrower_name
        FROM loans l JOIN borrowers b ON l.borrower_id = b.id
        WHERE l.id=?
    """, (loan_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"detail": "Loan not found"}), 404
    return jsonify(dict(row))

@app.route("/loans/<int:loan_id>", methods=["DELETE"])
def delete_loan(loan_id):
    conn = get_db()
    c    = conn.cursor()
    c.execute("DELETE FROM installments WHERE loan_id=?", (loan_id,))
    c.execute("DELETE FROM loans WHERE id=?", (loan_id,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": loan_id})


# ─── INSTALLMENTS ─────────────────────────────────────────────────────────────

@app.route("/loans/<int:loan_id>/installments", methods=["GET"])
def get_installments(loan_id):
    conn = get_db()
    c    = conn.cursor()
    flag_overdue(c)
    conn.commit()
    rows = c.execute("""
        SELECT * FROM installments WHERE loan_id=? ORDER BY installment_no
    """, (loan_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/installments/<int:installment_id>/pay", methods=["PATCH"])
def mark_paid(installment_id):
    data  = request.get_json() or {}
    conn  = get_db()
    c     = conn.cursor()
    inst  = c.execute("SELECT * FROM installments WHERE id=?", (installment_id,)).fetchone()
    if not inst:
        conn.close()
        return jsonify({"detail": "Installment not found"}), 404

    paid_date = data.get("paid_date") or date.today().isoformat()
    c.execute("UPDATE installments SET status='paid', paid_date=? WHERE id=?",
              (paid_date, installment_id))

    loan_id = inst["loan_id"]
    pending = c.execute("""
        SELECT COUNT(*) as cnt FROM installments
        WHERE loan_id=? AND status != 'paid'
    """, (loan_id,)).fetchone()["cnt"]
    if pending == 0:
        c.execute("UPDATE loans SET status='closed' WHERE id=?", (loan_id,))

    conn.commit()
    row = c.execute("SELECT * FROM installments WHERE id=?", (installment_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))

@app.route("/installments/<int:installment_id>/unpay", methods=["PATCH"])
def mark_unpaid(installment_id):
    conn  = get_db()
    c     = conn.cursor()
    inst  = c.execute("SELECT * FROM installments WHERE id=?", (installment_id,)).fetchone()
    if not inst:
        conn.close()
        return jsonify({"detail": "Installment not found"}), 404

    today      = date.today().isoformat()
    new_status = "overdue" if inst["due_date"] < today else "pending"
    c.execute("UPDATE installments SET status=?, paid_date=NULL WHERE id=?",
              (new_status, installment_id))
    c.execute("UPDATE loans SET status='active' WHERE id=?", (inst["loan_id"],))
    conn.commit()
    row = c.execute("SELECT * FROM installments WHERE id=?", (installment_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))


# ─── DASHBOARD ────────────────────────────────────────────────────────────────

@app.route("/dashboard", methods=["GET"])
def dashboard():
    conn = get_db()
    c    = conn.cursor()
    flag_overdue(c)
    conn.commit()

    total_loans     = c.execute("SELECT COUNT(*) as n FROM loans").fetchone()["n"]
    active_loans    = c.execute("SELECT COUNT(*) as n FROM loans WHERE status='active'").fetchone()["n"]
    closed_loans    = c.execute("SELECT COUNT(*) as n FROM loans WHERE status='closed'").fetchone()["n"]
    total_disbursed = c.execute("SELECT COALESCE(SUM(principal),0) as s FROM loans").fetchone()["s"]
    total_repaid    = c.execute("SELECT COALESCE(SUM(amount),0) as s FROM installments WHERE status='paid'").fetchone()["s"]
    arrears_count   = c.execute("SELECT COUNT(*) as n FROM installments WHERE status='overdue'").fetchone()["n"]
    arrears_amount  = c.execute("SELECT COALESCE(SUM(amount),0) as s FROM installments WHERE status='overdue'").fetchone()["s"]
    total_borrowers = c.execute("SELECT COUNT(*) as n FROM borrowers").fetchone()["n"]
    total_users     = c.execute("SELECT COUNT(*) as n FROM users").fetchone()["n"]

    recent_loans = c.execute("""
        SELECT l.id, l.principal, l.status, l.disbursement_date, b.name as borrower_name
        FROM loans l JOIN borrowers b ON l.borrower_id = b.id
        ORDER BY l.created_at DESC LIMIT 5
    """).fetchall()

    overdue_loans = c.execute("""
        SELECT l.id, l.principal, b.name as borrower_name,
               COUNT(i.id) as overdue_count, SUM(i.amount) as overdue_amount
        FROM installments i
        JOIN loans l ON i.loan_id = l.id
        JOIN borrowers b ON l.borrower_id = b.id
        WHERE i.status='overdue'
        GROUP BY l.id
        ORDER BY overdue_amount DESC LIMIT 5
    """).fetchall()

    conn.close()
    return jsonify({
        "total_loans":      total_loans,
        "active_loans":     active_loans,
        "closed_loans":     closed_loans,
        "total_disbursed":  total_disbursed,
        "total_repaid":     total_repaid,
        "arrears_count":    arrears_count,
        "arrears_amount":   arrears_amount,
        "total_borrowers":  total_borrowers,
        "total_users":      total_users,
        "recent_loans":     [dict(r) for r in recent_loans],
        "overdue_loans":    [dict(r) for r in overdue_loans],
    })

# ─── RUN ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app.run(debug=True, port=8000)