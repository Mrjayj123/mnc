import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8000";

// ─── UTILITIES ───────────────────────────────────────────────────────────────

const fmt = (n) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 2 }).format(n ?? 0);

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const statusBadge = (status) => {
  const map = {
    active:  "bg-blue-100 text-blue-700",
    closed:  "bg-emerald-100 text-emerald-700",
    paid:    "bg-emerald-100 text-emerald-700",
    pending: "bg-slate-100 text-slate-600",
    overdue: "bg-red-100 text-red-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${map[status] ?? "bg-gray-100 text-gray-500"}`}>
      {status}
    </span>
  );
};

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Request failed");
  }
  return res.json();
}

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, accent }) {
  const colors = {
    blue:    "from-blue-600 to-blue-500",
    emerald: "from-emerald-600 to-emerald-500",
    amber:   "from-amber-500 to-amber-400",
    red:     "from-red-600 to-red-500",
    slate:   "from-slate-600 to-slate-500",
  };
  return (
    <div className={`bg-gradient-to-br ${colors[accent]} rounded-2xl p-5 text-white shadow-md`}>
      <p className="text-xs font-medium uppercase tracking-widest opacity-80 mb-1">{label}</p>
      <p className="text-2xl font-bold leading-tight">{value}</p>
      {sub && <p className="text-xs opacity-70 mt-1">{sub}</p>}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 text-lg">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">✕</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        {...props}
      />
    </div>
  );
}

function Select({ label, children, ...props }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <select
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

// ─── VIEWS ───────────────────────────────────────────────────────────────────

function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/dashboard").then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-10 text-slate-400">Loading dashboard…</div>;
  if (!data) return null;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-800">Overview</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Total Disbursed" value={fmt(data.total_disbursed)} sub={`${data.total_loans} loans`} accent="blue" />
        <KPICard label="Repaid" value={fmt(data.total_repaid)} sub={`${data.closed_loans} closed`} accent="emerald" />
        <KPICard label="Arrears" value={fmt(data.arrears_amount)} sub={`${data.arrears_count} installment(s)`} accent="red" />
        <KPICard label="Borrowers" value={data.total_borrowers} sub={`${data.active_loans} active loans`} accent="slate" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-semibold text-slate-700 mb-4 text-sm uppercase tracking-wider">Recent Loans</h3>
          {data.recent_loans.length === 0 ? (
            <p className="text-slate-400 text-sm">No loans yet. Issue your first loan.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs uppercase border-b border-slate-50">
                  <th className="pb-2 text-left font-medium">Borrower</th>
                  <th className="pb-2 text-right font-medium">Principal</th>
                  <th className="pb-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_loans.map((l) => (
                  <tr key={l.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 text-slate-700 font-medium">{l.borrower_name}</td>
                    <td className="py-2 text-right text-slate-600">{fmt(l.principal)}</td>
                    <td className="py-2 text-right">{statusBadge(l.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-semibold text-red-600 mb-4 text-sm uppercase tracking-wider">⚠ Overdue Loans</h3>
          {data.overdue_loans.length === 0 ? (
            <p className="text-slate-400 text-sm">No overdue installments. All clear.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs uppercase border-b border-slate-50">
                  <th className="pb-2 text-left font-medium">Borrower</th>
                  <th className="pb-2 text-right font-medium">Missed</th>
                  <th className="pb-2 text-right font-medium">Amount Due</th>
                </tr>
              </thead>
              <tbody>
                {data.overdue_loans.map((l) => (
                  <tr key={l.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 text-slate-700 font-medium">{l.borrower_name}</td>
                    <td className="py-2 text-right text-slate-500">{l.overdue_count} inst.</td>
                    <td className="py-2 text-right font-semibold text-red-600">{fmt(l.overdue_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Borrowers() {
  const [borrowers, setBorrowers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", id_number: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    apiFetch("/borrowers").then(setBorrowers).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.name.trim()) { setError("Name is required."); return; }
    setError("");
    await apiFetch("/borrowers", { method: "POST", body: JSON.stringify(form) });
    setShowModal(false);
    setForm({ name: "", email: "", phone: "", id_number: "" });
    load();
  };

  const remove = async (id) => {
    if (!confirm("Delete this borrower? Their loans will also be removed.")) return;
    await apiFetch(`/borrowers/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Borrowers</h1>
        <button onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">
          + Add Borrower
        </button>
      </div>

      {loading ? <p className="text-slate-400">Loading…</p> : borrowers.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-4xl mb-3">👤</p>
          <p className="font-medium">No borrowers yet.</p>
          <p className="text-sm">Add your first borrower to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-slate-500 text-xs uppercase">
                <th className="py-3 px-4 text-left font-semibold">Name</th>
                <th className="py-3 px-4 text-left font-semibold">Email</th>
                <th className="py-3 px-4 text-left font-semibold">Phone</th>
                <th className="py-3 px-4 text-left font-semibold">ID No.</th>
                <th className="py-3 px-4 text-left font-semibold">Joined</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {borrowers.map((b) => (
                <tr key={b.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-semibold text-slate-700">{b.name}</td>
                  <td className="py-3 px-4 text-slate-500">{b.email || "—"}</td>
                  <td className="py-3 px-4 text-slate-500">{b.phone || "—"}</td>
                  <td className="py-3 px-4 text-slate-500">{b.id_number || "—"}</td>
                  <td className="py-3 px-4 text-slate-400">{fmtDate(b.created_at)}</td>
                  <td className="py-3 px-4 text-right">
                    <button onClick={() => remove(b.id)}
                      className="text-red-400 hover:text-red-600 text-xs font-medium">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title="New Borrower" onClose={() => { setShowModal(false); setError(""); }}>
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          <Input label="Full Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          <Input label="ID / National No." value={form.id_number} onChange={e => setForm({ ...form, id_number: e.target.value })} />
          <div className="flex gap-3 pt-2">
            <button onClick={submit} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-xl transition">
              Save Borrower
            </button>
            <button onClick={() => { setShowModal(false); setError(""); }}
              className="flex-1 border border-slate-200 text-slate-600 font-semibold py-2 rounded-xl hover:bg-slate-50 transition">
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function LoanScheduleModal({ loan, onClose }) {
  const [installments, setInstallments] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    apiFetch(`/loans/${loan.id}/installments`).then(setInstallments).finally(() => setLoading(false));
  }, [loan.id]);

  useEffect(() => { load(); }, [load]);

  const togglePay = async (inst) => {
    if (inst.status === "paid") {
      await apiFetch(`/installments/${inst.id}/unpay`, { method: "PATCH", body: JSON.stringify({}) });
    } else {
      await apiFetch(`/installments/${inst.id}/pay`, { method: "PATCH", body: JSON.stringify({}) });
    }
    load();
  };

  const totalPaid = installments.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const totalDue = installments.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800 text-lg">{loan.borrower_name}</h2>
            <p className="text-sm text-slate-500">Loan #{loan.id} · {fmt(loan.principal)} · {loan.flat_rate}% flat · {loan.tenure_months} months</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
        </div>

        <div className="px-6 py-4 bg-slate-50 flex gap-6 text-sm border-b border-slate-100">
          <div><span className="text-slate-400">Total Payable:</span> <span className="font-bold text-slate-700">{fmt(totalDue)}</span></div>
          <div><span className="text-slate-400">Repaid:</span> <span className="font-bold text-emerald-600">{fmt(totalPaid)}</span></div>
          <div><span className="text-slate-400">Outstanding:</span> <span className="font-bold text-blue-600">{fmt(totalDue - totalPaid)}</span></div>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <p className="p-6 text-slate-400">Loading schedule…</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b border-slate-100">
                <tr className="text-slate-400 text-xs uppercase">
                  <th className="py-3 px-4 text-left font-semibold">#</th>
                  <th className="py-3 px-4 text-left font-semibold">Due Date</th>
                  <th className="py-3 px-4 text-right font-semibold">Principal</th>
                  <th className="py-3 px-4 text-right font-semibold">Interest</th>
                  <th className="py-3 px-4 text-right font-semibold">Total</th>
                  <th className="py-3 px-4 text-left font-semibold">Status</th>
                  <th className="py-3 px-4 text-left font-semibold">Paid On</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {installments.map((inst) => (
                  <tr key={inst.id}
                    className={`border-t border-slate-50 ${inst.status === "overdue" ? "bg-red-50/40" : inst.status === "paid" ? "bg-emerald-50/20" : ""}`}>
                    <td className="py-2.5 px-4 text-slate-500">{inst.installment_no}</td>
                    <td className="py-2.5 px-4 text-slate-700">{fmtDate(inst.due_date)}</td>
                    <td className="py-2.5 px-4 text-right text-slate-600">{fmt(inst.principal_portion)}</td>
                    <td className="py-2.5 px-4 text-right text-slate-600">{fmt(inst.interest_portion)}</td>
                    <td className="py-2.5 px-4 text-right font-semibold text-slate-700">{fmt(inst.amount)}</td>
                    <td className="py-2.5 px-4">{statusBadge(inst.status)}</td>
                    <td className="py-2.5 px-4 text-slate-400">{fmtDate(inst.paid_date)}</td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={() => togglePay(inst)}
                        className={`text-xs font-semibold px-3 py-1 rounded-lg transition ${
                          inst.status === "paid"
                            ? "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        }`}>
                        {inst.status === "paid" ? "Undo" : "Mark Paid"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Loans({ borrowers }) {
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    borrower_id: "",
    principal: "",
    flat_rate: "",
    tenure_months: "",
    disbursement_date: new Date().toISOString().split("T")[0],
  });

  const load = useCallback(() => {
    apiFetch("/loans").then(setLoans).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.borrower_id || !form.principal || !form.flat_rate || !form.tenure_months) {
      setError("All fields are required."); return;
    }
    setError("");
    await apiFetch("/loans", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        borrower_id: parseInt(form.borrower_id),
        principal: parseFloat(form.principal),
        flat_rate: parseFloat(form.flat_rate),
        tenure_months: parseInt(form.tenure_months),
      }),
    });
    setShowModal(false);
    setForm({ borrower_id: "", principal: "", flat_rate: "", tenure_months: "", disbursement_date: new Date().toISOString().split("T")[0] });
    load();
  };

  const remove = async (id) => {
    if (!confirm("Delete this loan and all its installments?")) return;
    await apiFetch(`/loans/${id}`, { method: "DELETE" });
    load();
  };

  // Preview calculation
  const preview = (() => {
    const p = parseFloat(form.principal);
    const r = parseFloat(form.flat_rate);
    const t = parseInt(form.tenure_months);
    if (!p || !r || !t) return null;
    const totalInterest = p * (r / 100) * (t / 12);
    const totalPayable = p + totalInterest;
    return { totalInterest, totalPayable, monthly: totalPayable / t };
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Loans</h1>
        <button onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">
          + Issue Loan
        </button>
      </div>

      {loading ? <p className="text-slate-400">Loading…</p> : loans.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-medium">No loans issued yet.</p>
          <p className="text-sm">Issue your first loan to begin tracking.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-slate-500 text-xs uppercase">
                <th className="py-3 px-4 text-left font-semibold">Borrower</th>
                <th className="py-3 px-4 text-right font-semibold">Principal</th>
                <th className="py-3 px-4 text-right font-semibold">Rate</th>
                <th className="py-3 px-4 text-right font-semibold">Tenure</th>
                <th className="py-3 px-4 text-left font-semibold">Disbursed</th>
                <th className="py-3 px-4 text-left font-semibold">Status</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {loans.map((l) => (
                <tr key={l.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-semibold text-slate-700">{l.borrower_name}</td>
                  <td className="py-3 px-4 text-right text-slate-700">{fmt(l.principal)}</td>
                  <td className="py-3 px-4 text-right text-slate-500">{l.flat_rate}%</td>
                  <td className="py-3 px-4 text-right text-slate-500">{l.tenure_months}mo</td>
                  <td className="py-3 px-4 text-slate-500">{fmtDate(l.disbursement_date)}</td>
                  <td className="py-3 px-4">{statusBadge(l.status)}</td>
                  <td className="py-3 px-4 text-right flex gap-2 justify-end">
                    <button onClick={() => setSelectedLoan(l)}
                      className="text-blue-500 hover:text-blue-700 text-xs font-semibold">Schedule</button>
                    <button onClick={() => remove(l.id)}
                      className="text-red-400 hover:text-red-600 text-xs font-medium">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title="Issue New Loan" onClose={() => { setShowModal(false); setError(""); }}>
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          <Select label="Borrower *" value={form.borrower_id} onChange={e => setForm({ ...form, borrower_id: e.target.value })}>
            <option value="">Select a borrower…</option>
            {borrowers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Input label="Principal (KES) *" type="number" min="0" value={form.principal}
            onChange={e => setForm({ ...form, principal: e.target.value })} placeholder="e.g. 50000" />
          <Input label="Annual Flat Rate (%) *" type="number" min="0" step="0.1" value={form.flat_rate}
            onChange={e => setForm({ ...form, flat_rate: e.target.value })} placeholder="e.g. 12" />
          <Input label="Tenure (months) *" type="number" min="1" value={form.tenure_months}
            onChange={e => setForm({ ...form, tenure_months: e.target.value })} placeholder="e.g. 12" />
          <Input label="Disbursement Date *" type="date" value={form.disbursement_date}
            onChange={e => setForm({ ...form, disbursement_date: e.target.value })} />

          {preview && (
            <div className="bg-blue-50 rounded-xl p-4 mb-4 text-sm space-y-1">
              <p className="font-semibold text-blue-700 mb-2">Loan Preview</p>
              <div className="flex justify-between text-slate-600"><span>Total Interest</span><span className="font-medium">{fmt(preview.totalInterest)}</span></div>
              <div className="flex justify-between text-slate-600"><span>Total Payable</span><span className="font-medium">{fmt(preview.totalPayable)}</span></div>
              <div className="flex justify-between text-blue-700 font-semibold border-t border-blue-100 pt-1 mt-1"><span>Monthly Installment</span><span>{fmt(preview.monthly)}</span></div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={submit} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-xl transition">
              Issue Loan
            </button>
            <button onClick={() => { setShowModal(false); setError(""); }}
              className="flex-1 border border-slate-200 text-slate-600 font-semibold py-2 rounded-xl hover:bg-slate-50 transition">
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {selectedLoan && <LoanScheduleModal loan={selectedLoan} onClose={() => { setSelectedLoan(null); load(); }} />}
    </div>
  );
}

function Arrears() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loans, setLoans] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [installments, setInstallments] = useState({});

  useEffect(() => {
    apiFetch("/dashboard").then(setData);
    apiFetch("/loans").then(setLoans).finally(() => setLoading(false));
  }, []);

  const loadInstallments = async (loanId) => {
    if (installments[loanId]) {
      setExpanded(expanded === loanId ? null : loanId);
      return;
    }
    const data = await apiFetch(`/loans/${loanId}/installments`);
    setInstallments(prev => ({ ...prev, [loanId]: data }));
    setExpanded(loanId);
  };

  const markPaid = async (instId, loanId) => {
    await apiFetch(`/installments/${instId}/pay`, { method: "PATCH", body: JSON.stringify({}) });
    const updated = await apiFetch(`/loans/${loanId}/installments`);
    setInstallments(prev => ({ ...prev, [loanId]: updated }));
    const newLoans = await apiFetch("/loans");
    setLoans(newLoans);
    apiFetch("/dashboard").then(setData);
  };

  const overdueLoans = loans.filter(l => {
    const insts = installments[l.id];
    if (!insts) return true;
    return insts.some(i => i.status === "overdue");
  }).filter(l => l.status === "active");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Arrears & Overdue</h1>

      {data && (
        <div className="grid grid-cols-2 gap-4">
          <KPICard label="Overdue Installments" value={data.arrears_count} accent="red" />
          <KPICard label="Total Arrears Amount" value={fmt(data.arrears_amount)} accent="amber" />
        </div>
      )}

      {loading ? <p className="text-slate-400">Loading…</p> : overdueLoans.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-4xl mb-3">✅</p>
          <p className="font-medium">No overdue loans.</p>
          <p className="text-sm">All installments are up to date.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {overdueLoans.map(loan => {
            const insts = installments[loan.id] || [];
            const overdue = insts.filter(i => i.status === "overdue");
            return (
              <div key={loan.id} className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
                <button onClick={() => loadInstallments(loan.id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-red-50/30 transition">
                  <div className="text-left">
                    <p className="font-semibold text-slate-800">{loan.borrower_name}</p>
                    <p className="text-sm text-slate-500">Loan #{loan.id} · {fmt(loan.principal)} principal</p>
                  </div>
                  <div className="text-right">
                    {overdue.length > 0 && (
                      <p className="text-sm font-bold text-red-600">{fmt(overdue.reduce((s, i) => s + i.amount, 0))} overdue</p>
                    )}
                    <p className="text-xs text-slate-400">{expanded === loan.id ? "▲ collapse" : "▼ view installments"}</p>
                  </div>
                </button>
                {expanded === loan.id && insts.length > 0 && (
                  <div className="border-t border-slate-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr className="text-slate-400 text-xs uppercase">
                          <th className="py-2 px-4 text-left">#</th>
                          <th className="py-2 px-4 text-left">Due</th>
                          <th className="py-2 px-4 text-right">Amount</th>
                          <th className="py-2 px-4 text-left">Status</th>
                          <th className="py-2 px-4"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {insts.map(inst => (
                          <tr key={inst.id} className={`border-t border-slate-50 ${inst.status === "overdue" ? "bg-red-50/40" : ""}`}>
                            <td className="py-2 px-4 text-slate-500">{inst.installment_no}</td>
                            <td className="py-2 px-4 text-slate-700">{fmtDate(inst.due_date)}</td>
                            <td className="py-2 px-4 text-right font-semibold text-slate-700">{fmt(inst.amount)}</td>
                            <td className="py-2 px-4">{statusBadge(inst.status)}</td>
                            <td className="py-2 px-4 text-right">
                              {inst.status !== "paid" && (
                                <button onClick={() => markPaid(inst.id, loan.id)}
                                  className="text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-semibold px-3 py-1 rounded-lg transition">
                                  Mark Paid
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── APP SHELL ───────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "borrowers", label: "Borrowers", icon: "👤" },
  { id: "loans",     label: "Loans",     icon: "💼" },
  { id: "arrears",   label: "Arrears",   icon: "⚠️" },
];

export default function App() {
  const [view, setView] = useState("dashboard");
  const [borrowers, setBorrowers] = useState([]);

  useEffect(() => {
    apiFetch("/borrowers").then(setBorrowers);
  }, [view]);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-slate-100 flex flex-col shadow-sm">
        <div className="px-5 py-6 border-b border-slate-100">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Finance</p>
          <h1 className="text-xl font-bold text-slate-800 mt-0.5">LoanTrack</h1>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                view === item.id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}>
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-slate-100">
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} LoanTrack</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8 overflow-y-auto">
        {view === "dashboard" && <Dashboard />}
        {view === "borrowers" && <Borrowers />}
        {view === "loans" && <Loans borrowers={borrowers} />}
        {view === "arrears" && <Arrears />}
      </main>
    </div>
  );
}
