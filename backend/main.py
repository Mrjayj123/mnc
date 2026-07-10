from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import hashlib
import secrets
import re
import os
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from dotenv import load_dotenv
load_dotenv()

# ── Africa's Talking SMS SDK ──────────────────────────────────────────────────
try:
    import africastalking
    AT_USERNAME = os.environ.get("AT_USERNAME", "sandbox")
    AT_API_KEY  = os.environ.get("AT_API_KEY",  "007415aba2a81be22631ee1aa3182845e60ef555374d23c62be005afaa68c3b1eea1465a")
    africastalking.initialize(AT_USERNAME, AT_API_KEY)
    sms = africastalking.SMS
    AT_ENABLED = True
except ImportError:
    AT_ENABLED = False
    sms = None

app = Flask(__name__)
CORS(app)

DB_PATH = "loans.db"

# ── Admin credentials (change before deploying) ───────────────────────────────
ADMIN_ID_NUMBER = os.environ.get("ADMIN_ID_NUMBER", "00000000")
ADMIN_PASSWORD  = os.environ.get("ADMIN_PASSWORD",  "Admin@MnC1")
ADMIN_NAME      = "MnC Admin"

# ─── DB INIT ──────────────────────────────────────────────────────────────────

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

        CREATE TABLE IF NOT EXISTS sms_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            phone       TEXT NOT NULL,
            message     TEXT NOT NULL,
            status      TEXT DEFAULT 'sent',
            sent_at     TEXT DEFAULT (datetime('now')),
            borrower_id INTEGER,
            loan_id     INTEGER
        );
    """)
    conn.commit()
    conn.close()

init_db()

# ─── AUTH HELPERS ─────────────────────────────────────────────────────────────

def hash_password(password, salt):
    return hashlib.sha256((salt + password).encode()).hexdigest()

def validate_password(password):
    if len(password) < 8 or len(password) > 16:
        return False, "Password must be 8-16 characters long."
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter."
    if not re.search(r"[0-9]", password):
        return False, "Password must contain at least one number."
    if not re.search(r"[!@#$%^&*()\-_=+\[\]{};':\"\\|,.<>/?]", password):
        return False, "Password must contain at least one special character."
    return True, ""

def validate_id_number(id_number):
    return re.fullmatch(r"\d{8}", id_number) is not None

# ─── SMS HELPER ───────────────────────────────────────────────────────────────

def normalize_phone(phone):
    """Convert 07xx -> +2547xx for Africa's Talking."""
    phone = re.sub(r"\s+", "", str(phone))
    if phone.startswith("07") or phone.startswith("01"):
        return "+254" + phone[1:]
    if phone.startswith("254"):
        return "+" + phone
    if phone.startswith("+254"):
        return phone
    return phone

def send_sms(phone, message, borrower_id=None, loan_id=None):
    """Send SMS via Africa's Talking. Logs every attempt to sms_log."""
    normalized = normalize_phone(phone)
    status = "queued"

    if AT_ENABLED and sms:
        try:
            response   = sms.send(message, [normalized])
            recipients = response.get("SMSMessageData", {}).get("Recipients", [])
            status     = recipients[0].get("status", "sent") if recipients else "sent"
        except Exception as e:
            status = f"error: {str(e)[:120]}"
    else:
        status = "simulated"
        print(f"[SMS SIMULATION] To: {normalized}\n{message}\n")

    conn = get_db()
    c    = conn.cursor()
    c.execute(
        "INSERT INTO sms_log (phone, message, status, borrower_id, loan_id) VALUES (?,?,?,?,?)",
        (normalized, message, status, borrower_id, loan_id)
    )
    conn.commit()
    conn.close()
    return status

def build_reminder_sms(borrower_name, installment_no, amount, due_date, loan_id):
    return (
        f"Dear {borrower_name}, this is a reminder from MnC Finance. "
        f"Your loan installment #{installment_no} of KES {amount:,.2f} "
        f"for Loan #{loan_id} is due on {due_date}. "
        f"Please ensure payment is made on time to avoid penalties. Thank you."
    )

# ─── AUTH ROUTES ──────────────────────────────────────────────────────────────

@app.route("/auth/register", methods=["POST"])
def register():
    data = request.get_json()
    if not data or not all(k in data for k in ["name","email","phone","id_number","password"]):
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
    if not phone:
        return jsonify({"detail": "Phone number is required."}), 400
    if not validate_id_number(id_number):
        return jsonify({"detail": "ID number must be exactly 8 digits."}), 400

    ok, msg = validate_password(password)
    if not ok:
        return jsonify({"detail": msg}), 400

    salt          = secrets.token_hex(16)
    password_hash = hash_password(password, salt)

    conn = get_db()
    c    = conn.cursor()
    if c.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone():
        conn.close()
        return jsonify({"detail": "An account with this email already exists."}), 409
    if c.execute("SELECT id FROM users WHERE id_number=?", (id_number,)).fetchone():
        conn.close()
        return jsonify({"detail": "An account with this ID number already exists."}), 409

    c.execute(
        "INSERT INTO users (name, email, phone, id_number, password_hash, salt, role) VALUES (?,?,?,?,?,?,'borrower')",
        (name, email, phone, id_number, password_hash, salt)
    )
    conn.commit()
    user_id = c.lastrowid

    c.execute(
        "INSERT INTO borrowers (user_id, name, email, phone, id_number) VALUES (?,?,?,?,?)",
        (user_id, name, email, phone, id_number)
    )
    conn.commit()
    conn.close()

    # Welcome SMS
    send_sms(phone,
        f"Welcome to MnC Finance, {name}! Your account has been created. "
        f"Log in with your ID number to track your loans. - MnC Finance"
    )

    return jsonify({"message": "Account created successfully.",
                    "user": {"id": user_id, "name": name, "email": email, "role": "borrower"}}), 201


@app.route("/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    if not data:
        return jsonify({"detail": "Missing request body."}), 400

    id_number = data.get("id_number", "").strip()
    password  = data.get("password", "")

    if id_number == ADMIN_ID_NUMBER and password == ADMIN_PASSWORD:
        return jsonify({"user": {"id": 0, "name": ADMIN_NAME, "id_number": ADMIN_ID_NUMBER,
                                  "role": "admin", "email": "admin@mnc.com"}})

    if not id_number or not password:
        return jsonify({"detail": "ID number and password are required."}), 400

    conn = get_db()
    c    = conn.cursor()
    user = c.execute("SELECT * FROM users WHERE id_number=?", (id_number,)).fetchone()
    conn.close()

    if not user or hash_password(password, user["salt"]) != user["password_hash"]:
        return jsonify({"detail": "Invalid ID number or password."}), 401

    return jsonify({"user": {"id": user["id"], "name": user["name"], "email": user["email"],
                              "phone": user["phone"], "id_number": user["id_number"], "role": user["role"]}})

# ─── REMINDERS ────────────────────────────────────────────────────────────────

@app.route("/reminders/<int:user_id>", methods=["GET"])
def get_reminders(user_id):
    conn     = get_db()
    c        = conn.cursor()
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
    conn     = get_db()
    c        = conn.cursor()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    rows = c.execute("""
        SELECT i.id, i.installment_no, i.due_date, i.amount,
               l.id as loan_id, b.name as borrower_name, b.phone, b.email
        FROM installments i
        JOIN loans l ON i.loan_id = l.id
        JOIN borrowers b ON l.borrower_id = b.id
        WHERE i.due_date = ? AND i.status != 'paid'
        ORDER BY b.name
    """, (tomorrow,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/reminders/send-all", methods=["POST"])
def send_all_reminders():
    """Send SMS reminders to all borrowers with installments due tomorrow."""
    conn     = get_db()
    c        = conn.cursor()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    rows = c.execute("""
        SELECT i.id, i.installment_no, i.due_date, i.amount,
               l.id as loan_id, b.id as borrower_id,
               b.name as borrower_name, b.phone
        FROM installments i
        JOIN loans l ON i.loan_id = l.id
        JOIN borrowers b ON l.borrower_id = b.id
        WHERE i.due_date = ? AND i.status != 'paid' AND b.phone IS NOT NULL
    """, (tomorrow,)).fetchall()
    conn.close()

    results = []
    for r in rows:
        msg    = build_reminder_sms(r["borrower_name"], r["installment_no"],
                                    r["amount"], r["due_date"], r["loan_id"])
        status = send_sms(r["phone"], msg, r["borrower_id"], r["loan_id"])
        results.append({"borrower": r["borrower_name"], "phone": r["phone"],
                         "amount": r["amount"], "sms_status": status})

    return jsonify({"sent": len(results), "results": results})


@app.route("/reminders/send/<int:borrower_id>", methods=["POST"])
def send_single_reminder(borrower_id):
    """Send reminder SMS to one specific borrower for tomorrow."""
    conn     = get_db()
    c        = conn.cursor()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    borrower = c.execute("SELECT * FROM borrowers WHERE id=?", (borrower_id,)).fetchone()
    if not borrower:
        conn.close()
        return jsonify({"detail": "Borrower not found"}), 404

    rows = c.execute("""
        SELECT i.installment_no, i.due_date, i.amount, l.id as loan_id
        FROM installments i JOIN loans l ON i.loan_id = l.id
        WHERE l.borrower_id = ? AND i.due_date = ? AND i.status != 'paid'
    """, (borrower_id, tomorrow)).fetchall()
    conn.close()

    if not rows:
        return jsonify({"detail": "No installments due tomorrow for this borrower."}), 404
    if not borrower["phone"]:
        return jsonify({"detail": "Borrower has no phone number on record."}), 400

    results = []
    for r in rows:
        msg    = build_reminder_sms(borrower["name"], r["installment_no"],
                                    r["amount"], r["due_date"], r["loan_id"])
        status = send_sms(borrower["phone"], msg, borrower_id, r["loan_id"])
        results.append({"installment_no": r["installment_no"], "sms_status": status})

    return jsonify({"sent": len(results), "results": results})


@app.route("/sms-log", methods=["GET"])
def get_sms_log():
    conn = get_db()
    c    = conn.cursor()
    rows = c.execute("""
        SELECT s.*, b.name as borrower_name
        FROM sms_log s
        LEFT JOIN borrowers b ON s.borrower_id = b.id
        ORDER BY s.sent_at DESC LIMIT 200
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

# ─── USERS ────────────────────────────────────────────────────────────────────

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
        GROUP BY u.id ORDER BY u.created_at DESC
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

# ─── BORROWERS ────────────────────────────────────────────────────────────────

@app.route("/borrowers", methods=["GET"])
def list_borrowers():
    conn = get_db()
    rows = conn.execute("SELECT * FROM borrowers ORDER BY created_at DESC").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/borrowers", methods=["POST"])
def create_borrower():
    data = request.get_json()
    if not data or not data.get("name","").strip():
        return jsonify({"detail": "Name is required"}), 400
    conn = get_db()
    c    = conn.cursor()
    c.execute("INSERT INTO borrowers (name, email, phone, id_number) VALUES (?,?,?,?)",
              (data["name"], data.get("email"), data.get("phone"), data.get("id_number")))
    conn.commit()
    row = c.execute("SELECT * FROM borrowers WHERE id=?", (c.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201

@app.route("/borrowers/<int:bid>", methods=["GET"])
def get_borrower(bid):
    conn = get_db()
    row  = conn.execute("SELECT * FROM borrowers WHERE id=?", (bid,)).fetchone()
    conn.close()
    return jsonify(dict(row)) if row else (jsonify({"detail":"Not found"}), 404)

@app.route("/borrowers/by-user/<int:user_id>", methods=["GET"])
def get_borrower_by_user(user_id):
    conn = get_db()
    row  = conn.execute("SELECT * FROM borrowers WHERE user_id=?", (user_id,)).fetchone()
    conn.close()
    return jsonify(dict(row)) if row else (jsonify({"detail":"Not found"}), 404)

@app.route("/borrowers/<int:bid>", methods=["PATCH"])
def update_borrower(bid):
    data = request.get_json()
    if not data or not data.get("name","").strip():
        return jsonify({"detail": "Name is required"}), 400
    conn = get_db()
    c    = conn.cursor()
    c.execute("UPDATE borrowers SET name=?,email=?,phone=?,id_number=? WHERE id=?",
              (data["name"], data.get("email"), data.get("phone"), data.get("id_number"), bid))
    conn.commit()
    row = c.execute("SELECT * FROM borrowers WHERE id=?", (bid,)).fetchone()
    conn.close()
    return jsonify(dict(row))

@app.route("/borrowers/<int:bid>", methods=["DELETE"])
def delete_borrower(bid):
    conn = get_db()
    c    = conn.cursor()
    c.execute("DELETE FROM installments WHERE loan_id IN (SELECT id FROM loans WHERE borrower_id=?)", (bid,))
    c.execute("DELETE FROM loans WHERE borrower_id=?", (bid,))
    c.execute("DELETE FROM borrowers WHERE id=?", (bid,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": bid})

# ─── LOANS ────────────────────────────────────────────────────────────────────

def generate_installments(loan_id, principal, flat_rate, tenure_months, disbursement_date):
    total_interest = principal * (flat_rate / 100) * (tenure_months / 12)
    total_payable  = principal + total_interest
    monthly        = round(total_payable / tenure_months, 2)
    m_interest     = round(total_interest / tenure_months, 2)
    m_principal    = round(principal / tenure_months, 2)
    start          = date.fromisoformat(disbursement_date)
    conn = get_db()
    c    = conn.cursor()
    for i in range(1, tenure_months + 1):
        due = start + relativedelta(months=i)
        amt = monthly if i < tenure_months else round(total_payable - monthly * (tenure_months - 1), 2)
        c.execute(
            "INSERT INTO installments (loan_id,installment_no,due_date,amount,principal_portion,interest_portion) VALUES (?,?,?,?,?,?)",
            (loan_id, i, due.isoformat(), amt, m_principal, m_interest)
        )
    conn.commit()
    conn.close()

def flag_overdue(c):
    c.execute("UPDATE installments SET status='overdue' WHERE status='pending' AND due_date < ?",
              (date.today().isoformat(),))

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
        WHERE l.borrower_id=? ORDER BY l.created_at DESC
    """, (borrower_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/loans", methods=["POST"])
def create_loan():
    data = request.get_json()
    if not data or not all(k in data for k in ["borrower_id","principal","flat_rate","tenure_months","disbursement_date"]):
        return jsonify({"detail": "Missing required fields"}), 400

    conn     = get_db()
    c        = conn.cursor()
    borrower = c.execute("SELECT * FROM borrowers WHERE id=?", (data["borrower_id"],)).fetchone()
    if not borrower:
        conn.close()
        return jsonify({"detail": "Borrower not found"}), 404

    c.execute("INSERT INTO loans (borrower_id,principal,flat_rate,tenure_months,disbursement_date) VALUES (?,?,?,?,?)",
              (data["borrower_id"], data["principal"], data["flat_rate"],
               data["tenure_months"], data["disbursement_date"]))
    conn.commit()
    loan_id = c.lastrowid
    conn.close()

    generate_installments(loan_id, data["principal"], data["flat_rate"],
                          data["tenure_months"], data["disbursement_date"])

    # Loan disbursement SMS
    if borrower["phone"]:
        ti      = data["principal"] * (data["flat_rate"] / 100) * (data["tenure_months"] / 12)
        monthly = round((data["principal"] + ti) / data["tenure_months"], 2)
        send_sms(borrower["phone"],
            f"Dear {borrower['name']}, your loan of KES {data['principal']:,.2f} at {data['flat_rate']}% "
            f"has been approved. Monthly installment: KES {monthly:,.2f} x {data['tenure_months']} months. - MnC Finance",
            borrower["id"], loan_id
        )

    conn2 = get_db()
    row   = conn2.execute("""
        SELECT l.*, b.name as borrower_name
        FROM loans l JOIN borrowers b ON l.borrower_id = b.id WHERE l.id=?
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
        FROM loans l JOIN borrowers b ON l.borrower_id = b.id WHERE l.id=?
    """, (loan_id,)).fetchone()
    conn.close()
    return jsonify(dict(row)) if row else (jsonify({"detail":"Not found"}), 404)

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
    rows = c.execute("SELECT * FROM installments WHERE loan_id=? ORDER BY installment_no", (loan_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/installments/<int:iid>/pay", methods=["PATCH"])
def mark_paid(iid):
    data = request.get_json() or {}
    conn = get_db()
    c    = conn.cursor()
    inst = c.execute("SELECT * FROM installments WHERE id=?", (iid,)).fetchone()
    if not inst:
        conn.close()
        return jsonify({"detail": "Not found"}), 404

    paid_date = data.get("paid_date") or date.today().isoformat()
    c.execute("UPDATE installments SET status='paid', paid_date=? WHERE id=?", (paid_date, iid))

    loan_id = inst["loan_id"]
    pending = c.execute("SELECT COUNT(*) as cnt FROM installments WHERE loan_id=? AND status!='paid'", (loan_id,)).fetchone()["cnt"]
    if pending == 0:
        c.execute("UPDATE loans SET status='closed' WHERE id=?", (loan_id,))
        borrower = c.execute("""
            SELECT b.* FROM borrowers b JOIN loans l ON l.borrower_id=b.id WHERE l.id=?
        """, (loan_id,)).fetchone()
        if borrower and borrower["phone"]:
            send_sms(borrower["phone"],
                f"Congratulations {borrower['name']}! Loan #{loan_id} is now fully repaid. "
                f"Thank you for your timely payments. - MnC Finance",
                borrower["id"], loan_id
            )

    conn.commit()
    row = c.execute("SELECT * FROM installments WHERE id=?", (iid,)).fetchone()
    conn.close()
    return jsonify(dict(row))

@app.route("/installments/<int:iid>/unpay", methods=["PATCH"])
def mark_unpaid(iid):
    conn = get_db()
    c    = conn.cursor()
    inst = c.execute("SELECT * FROM installments WHERE id=?", (iid,)).fetchone()
    if not inst:
        conn.close()
        return jsonify({"detail": "Not found"}), 404
    new_status = "overdue" if inst["due_date"] < date.today().isoformat() else "pending"
    c.execute("UPDATE installments SET status=?, paid_date=NULL WHERE id=?", (new_status, iid))
    c.execute("UPDATE loans SET status='active' WHERE id=?", (inst["loan_id"],))
    conn.commit()
    row = c.execute("SELECT * FROM installments WHERE id=?", (iid,)).fetchone()
    conn.close()
    return jsonify(dict(row))

# ─── DASHBOARD ────────────────────────────────────────────────────────────────

@app.route("/dashboard", methods=["GET"])
def dashboard():
    conn = get_db()
    c    = conn.cursor()
    flag_overdue(c)
    conn.commit()

    def q(sql, *args): return c.execute(sql, args).fetchone()

    total_loans     = q("SELECT COUNT(*) as n FROM loans")["n"]
    active_loans    = q("SELECT COUNT(*) as n FROM loans WHERE status='active'")["n"]
    closed_loans    = q("SELECT COUNT(*) as n FROM loans WHERE status='closed'")["n"]
    total_disbursed = q("SELECT COALESCE(SUM(principal),0) as s FROM loans")["s"]
    total_repaid    = q("SELECT COALESCE(SUM(amount),0) as s FROM installments WHERE status='paid'")["s"]
    arrears_count   = q("SELECT COUNT(*) as n FROM installments WHERE status='overdue'")["n"]
    arrears_amount  = q("SELECT COALESCE(SUM(amount),0) as s FROM installments WHERE status='overdue'")["s"]
    total_borrowers = q("SELECT COUNT(*) as n FROM borrowers")["n"]
    total_users     = q("SELECT COUNT(*) as n FROM users")["n"]
    sms_sent_today  = q("SELECT COUNT(*) as n FROM sms_log WHERE sent_at >= date('now')")["n"]

    recent_loans = c.execute("""
        SELECT l.id, l.principal, l.status, l.disbursement_date, b.name as borrower_name
        FROM loans l JOIN borrowers b ON l.borrower_id=b.id
        ORDER BY l.created_at DESC LIMIT 5
    """).fetchall()

    overdue_loans = c.execute("""
        SELECT l.id, l.principal, b.name as borrower_name,
               COUNT(i.id) as overdue_count, SUM(i.amount) as overdue_amount
        FROM installments i
        JOIN loans l ON i.loan_id=l.id
        JOIN borrowers b ON l.borrower_id=b.id
        WHERE i.status='overdue'
        GROUP BY l.id ORDER BY overdue_amount DESC LIMIT 5
    """).fetchall()

    conn.close()
    return jsonify({
        "total_loans": total_loans, "active_loans": active_loans,
        "closed_loans": closed_loans, "total_disbursed": total_disbursed,
        "total_repaid": total_repaid, "arrears_count": arrears_count,
        "arrears_amount": arrears_amount, "total_borrowers": total_borrowers,
        "total_users": total_users, "sms_sent_today": sms_sent_today,
        "recent_loans": [dict(r) for r in recent_loans],
        "overdue_loans": [dict(r) for r in overdue_loans],
    })

if __name__ == "__main__":
    app.run(debug=True, port=8000)