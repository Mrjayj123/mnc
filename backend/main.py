from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
from datetime import date
from dateutil.relativedelta import relativedelta

app = Flask(__name__)
CORS(app)

DB_PATH = "loans.db"

# ─── DB INIT ────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.executescript("""
        CREATE TABLE IF NOT EXISTS borrowers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            id_number TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS loans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            borrower_id INTEGER NOT NULL,
            principal REAL NOT NULL,
            flat_rate REAL NOT NULL,
            tenure_months INTEGER NOT NULL,
            disbursement_date TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (borrower_id) REFERENCES borrowers(id)
        );

        CREATE TABLE IF NOT EXISTS installments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            loan_id INTEGER NOT NULL,
            installment_no INTEGER NOT NULL,
            due_date TEXT NOT NULL,
            amount REAL NOT NULL,
            principal_portion REAL NOT NULL,
            interest_portion REAL NOT NULL,
            paid_date TEXT,
            status TEXT DEFAULT 'pending',
            FOREIGN KEY (loan_id) REFERENCES loans(id)
        );
    """)
    conn.commit()
    conn.close()

init_db()

# ─── HELPERS ────────────────────────────────────────────────────────────────

def generate_installments(loan_id, principal, flat_rate, tenure_months, disbursement_date):
    total_interest = principal * (flat_rate / 100) * (tenure_months / 12)
    total_payable = principal + total_interest
    monthly_installment = round(total_payable / tenure_months, 2)
    monthly_interest = round(total_interest / tenure_months, 2)
    monthly_principal = round(principal / tenure_months, 2)

    start = date.fromisoformat(disbursement_date)
    conn = get_db()
    c = conn.cursor()
    for i in range(1, tenure_months + 1):
        due = start + relativedelta(months=i)
        amt = monthly_installment
        if i == tenure_months:
            paid_so_far = monthly_installment * (tenure_months - 1)
            amt = round(total_payable - paid_so_far, 2)
        c.execute("""
            INSERT INTO installments
            (loan_id, installment_no, due_date, amount, principal_portion, interest_portion)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (loan_id, i, due.isoformat(), amt, monthly_principal, monthly_interest))
    conn.commit()
    conn.close()

def flag_overdue(c):
    today = date.today().isoformat()
    c.execute("""
        UPDATE installments SET status='overdue'
        WHERE status='pending' AND due_date < ?
    """, (today,))

# ─── BORROWERS ──────────────────────────────────────────────────────────────

@app.route("/borrowers", methods=["GET"])
def list_borrowers():
    conn = get_db()
    c = conn.cursor()
    rows = c.execute("SELECT * FROM borrowers ORDER BY created_at DESC").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/borrowers", methods=["POST"])
def create_borrower():
    data = request.get_json()
    if not data or not data.get("name", "").strip():
        return jsonify({"detail": "Name is required"}), 400
    conn = get_db()
    c = conn.cursor()
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
    c = conn.cursor()
    row = c.execute("SELECT * FROM borrowers WHERE id=?", (borrower_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"detail": "Borrower not found"}), 404
    return jsonify(dict(row))

@app.route("/borrowers/<int:borrower_id>", methods=["DELETE"])
def delete_borrower(borrower_id):
    conn = get_db()
    c = conn.cursor()
    
    # Check if borrower exists
    borrower = c.execute("SELECT id FROM borrowers WHERE id=?", (borrower_id,)).fetchone()
    if not borrower:
        conn.close()
        return jsonify({"detail": "Borrower not found"}), 404
        
    # Check if they have any ongoing active loans
    active_loans = c.execute("""
        SELECT COUNT(*) as cnt FROM loans WHERE borrower_id = ? AND status = 'active'
    """, (borrower_id,)).fetchone()["cnt"]
    
    if active_loans > 0:
        conn.close()
        return jsonify({
            "detail": f"Cannot delete borrower. They still have {active_loans} active loan(s)."
        }), 400

    # If cleared or no loans, remove everything cleanly using their loan IDs
    borrower_loans = c.execute("SELECT id FROM loans WHERE borrower_id = ?", (borrower_id,)).fetchall()
    loan_ids = [l["id"] for l in borrower_loans]
    
    if loan_ids:
        # Delete all installments belonging to this borrower's loans
        placeholders = ",".join("?" for _ in loan_ids)
        c.execute(f"DELETE FROM installments WHERE loan_id IN ({placeholders})", tuple(loan_ids))
        # Delete the loans
        c.execute("DELETE FROM loans WHERE borrower_id = ?", (borrower_id,))
        
    # Finally, delete the profile
    c.execute("DELETE FROM borrowers WHERE id = ?", (borrower_id,))
    
    conn.commit()
    conn.close()
    return jsonify({"deleted_borrower_id": borrower_id, "message": "Borrower and entire paid-off history wiped successfully."})

# ─── LOANS ──────────────────────────────────────────────────────────────────

@app.route("/loans", methods=["GET"])
def list_loans():
    conn = get_db()
    c = conn.cursor()
    flag_overdue(c)
    conn.commit()
    rows = c.execute("""
        SELECT l.*, b.name as borrower_name
        FROM loans l JOIN borrowers b ON l.borrower_id = b.id
        ORDER BY l.created_at DESC
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/loans", methods=["POST"])
def create_loan():
    data = request.get_json()
    required = ["borrower_id", "principal", "flat_rate", "tenure_months", "disbursement_date"]
    if not data or not all(k in data for k in required):
        return jsonify({"detail": "Missing required fields"}), 400

    conn = get_db()
    c = conn.cursor()
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
    c2 = conn2.cursor()
    row = c2.execute("""
        SELECT l.*, b.name as borrower_name
        FROM loans l JOIN borrowers b ON l.borrower_id = b.id
        WHERE l.id=?
    """, (loan_id,)).fetchone()
    conn2.close()
    return jsonify(dict(row)), 201

@app.route("/loans/<int:loan_id>", methods=["GET"])
def get_loan(loan_id):
    conn = get_db()
    c = conn.cursor()
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
    c = conn.cursor()
    c.execute("DELETE FROM installments WHERE loan_id=?", (loan_id,))
    c.execute("DELETE FROM loans WHERE id=?", (loan_id,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": loan_id})

# ─── INSTALLMENTS ───────────────────────────────────────────────────────────

@app.route("/loans/<int:loan_id>/installments", methods=["GET"])
def get_installments(loan_id):
    conn = get_db()
    c = conn.cursor()
    flag_overdue(c)
    conn.commit()
    rows = c.execute("""
        SELECT * FROM installments WHERE loan_id=? ORDER BY installment_no
    """, (loan_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/installments/<int:installment_id>/pay", methods=["PATCH"])
def mark_paid(installment_id):
    data = request.get_json() or {}
    conn = get_db()
    c = conn.cursor()
    inst = c.execute("SELECT * FROM installments WHERE id=?", (installment_id,)).fetchone()
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
    conn = get_db()
    c = conn.cursor()
    inst = c.execute("SELECT * FROM installments WHERE id=?", (installment_id,)).fetchone()
    if not inst:
        conn.close()
        return jsonify({"detail": "Installment not found"}), 404

    today = date.today().isoformat()
    new_status = "overdue" if inst["due_date"] < today else "pending"
    c.execute("UPDATE installments SET status=?, paid_date=NULL WHERE id=?",
              (new_status, installment_id))

    loan_id = inst["loan_id"]
    c.execute("UPDATE loans SET status='active' WHERE id=?", (loan_id,))
    conn.commit()
    row = c.execute("SELECT * FROM installments WHERE id=?", (installment_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))

# ─── DASHBOARD ──────────────────────────────────────────────────────────────

@app.route("/dashboard", methods=["GET"])
def dashboard():
    conn = get_db()
    c = conn.cursor()
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
        "recent_loans":     [dict(r) for r in recent_loans],
        "overdue_loans":    [dict(r) for r in overdue_loans],
    })

# ─── RUN ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app.run(debug=True, port=8000)