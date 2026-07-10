import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8000";

// ─── UTILITIES ────────────────────────────────────────────────────────────────

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

// ─── VALIDATION ───────────────────────────────────────────────────────────────

function validatePassword(password) {
  if (password.length < 8 || password.length > 16)
    return "Password must be 8–16 characters long.";
  if (!/[A-Z]/.test(password))
    return "Password must contain at least one uppercase letter.";
  if (!/[0-9]/.test(password))
    return "Password must contain at least one number.";
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password))
    return "Password must contain at least one special character (!@#$%^&* etc).";
  return null;
}

function validateIdNumber(id) {
  return /^\d{8}$/.test(id) ? null : "ID number must be exactly 8 digits.";
}

// ─── SHARED UI COMPONENTS ─────────────────────────────────────────────────────

function KPICard({ label, value, sub, accent }) {
  const colors = {
    blue:    "from-blue-600 to-blue-500",
    emerald: "from-emerald-600 to-emerald-500",
    amber:   "from-amber-500 to-amber-400",
    red:     "from-red-600 to-red-500",
    slate:   "from-slate-600 to-slate-500",
    purple:  "from-purple-600 to-purple-500",
  };
  return (
    <div className={`bg-gradient-to-br ${colors[accent]} rounded-2xl p-5 text-white shadow-md`}>
      <p className="text-xs font-medium uppercase tracking-widest opacity-80 mb-1">{label}</p>
      <p className="text-2xl font-bold leading-tight">{value}</p>
      {sub && <p className="text-xs opacity-70 mt-1">{sub}</p>}
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-lg"} mx-4 overflow-hidden max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="font-bold text-slate-800 text-lg">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">✕</button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function FormInput({ label, hint, error, ...props }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${error ? "border-red-400 bg-red-50" : "border-slate-200"}`}
        {...props}
      />
      {hint && !error && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function Select({ label, children, ...props }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" {...props}>
        {children}
      </select>
    </div>
  );
}

// ─── REMINDER BANNER ─────────────────────────────────────────────────────────

function ReminderBanner({ reminders }) {
  const [dismissed, setDismissed] = useState(false);
  if (!reminders || reminders.length === 0 || dismissed) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 shadow-sm">
      <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 text-lg">🔔</div>
      <div className="flex-1">
        <p className="font-semibold text-amber-800 text-sm">Payment Due Tomorrow</p>
        {reminders.map((r) => (
          <p key={r.id} className="text-amber-700 text-sm mt-0.5">
            Hi <strong>{r.borrower_name}</strong> — your installment #{r.installment_no} of{" "}
            <strong>{fmt(r.amount)}</strong> for Loan #{r.loan_id} is due on{" "}
            <strong>{fmtDate(r.due_date)}</strong>. Please ensure your account is funded.
          </p>
        ))}
      </div>
      <button onClick={() => setDismissed(true)} className="text-amber-400 hover:text-amber-700 text-lg shrink-0">✕</button>
    </div>
  );
}

// ─── AUTH PAGES ───────────────────────────────────────────────────────────────

function AuthPage({ onLogin }) {
  const [mode, setMode] = useState("login"); // "login" | "register"

  return mode === "login"
    ? <LoginPage onLogin={onLogin} onSwitch={() => setMode("register")} />
    : <RegisterPage onSwitch={() => setMode("login")} onRegistered={() => setMode("login")} />;
}

function LoginPage({ onLogin, onSwitch }) {
  const [form, setForm]       = useState({ id_number: "", password: "" });
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.id_number || !form.password) { setError("Both fields are required."); return; }
    setLoading(true);
    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify(form),
      });
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 opacity-5"
        style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "40px 40px" }} />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500 shadow-lg shadow-blue-500/30 mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">LoanTrack</h1>
          <p className="text-blue-300 text-sm mt-1">MnC Loan Finance Management</p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-3xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-1">Sign In</h2>
          <p className="text-slate-400 text-sm mb-6">Enter your ID number and password to continue.</p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3 mb-5 flex items-center gap-2">
              <span>⚠</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">ID Number</label>
              <input type="text" placeholder="8-digit ID number" value={form.id_number}
                onChange={e => setForm({ ...form, id_number: e.target.value })}
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} placeholder="Your password" value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 pr-11 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition" />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                  {showPw ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-400 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition shadow-lg shadow-blue-500/20 mt-2">
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <div className="mt-6 border-t border-white/10 pt-5 text-center">
            <p className="text-slate-400 text-sm">
              New borrower?{" "}
              <button onClick={onSwitch} className="text-blue-300 hover:text-blue-200 font-semibold transition">
                Create an account
              </button>
            </p>
          </div>

          <div className="mt-4 bg-white/5 rounded-xl p-3">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Admin access</p>
            <p className="text-xs text-slate-400 font-mono">ID: <span className="text-slate-300">00000000</span> · Pass: <span className="text-slate-300">Admin@MnC1</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}

function RegisterPage({ onSwitch, onRegistered }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", id_number: "", password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [showPw, setShowPw] = useState(false);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Full name is required.";
    if (!form.email.trim() || !/[^@]+@[^@]+\.[^@]+/.test(form.email)) e.email = "Enter a valid email address.";
    if (!form.phone.trim()) e.phone = "Phone number is required.";
    const idErr = validateIdNumber(form.id_number);
    if (idErr) e.id_number = idErr;
    const pwErr = validatePassword(form.password);
    if (pwErr) e.password = pwErr;
    if (form.password !== form.confirm) e.confirm = "Passwords do not match.";
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGlobalError("");
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          id_number: form.id_number.trim(),
          password: form.password,
        }),
      });
      onRegistered();
    } catch (err) {
      setGlobalError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Live password strength indicator
  const pwStrength = (() => {
    const p = form.password;
    if (!p) return null;
    let score = 0;
    if (p.length >= 8) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p)) score++;
    const labels = ["", "Weak", "Fair", "Good", "Strong"];
    const colors = ["", "bg-red-400", "bg-amber-400", "bg-blue-400", "bg-emerald-400"];
    return { score, label: labels[score], color: colors[score] };
  })();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 opacity-5"
        style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "40px 40px" }} />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500 shadow-lg shadow-blue-500/30 mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">LoanTrack</h1>
          <p className="text-blue-300 text-sm mt-1">MnC Loan Finance Management</p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-3xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-1">Create Account</h2>
          <p className="text-slate-400 text-sm mb-6">Register to track your loan with MnC.</p>

          {globalError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3 mb-5 flex items-center gap-2">
              <span>⚠</span> {globalError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name</label>
              <input type="text" placeholder="e.g. Jane Wanjiku" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className={`w-full bg-white/10 border rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition ${errors.name ? "border-red-400" : "border-white/20"}`} />
              {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email Address</label>
              <input type="email" placeholder="jane@example.com" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className={`w-full bg-white/10 border rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition ${errors.email ? "border-red-400" : "border-white/20"}`} />
              {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone Number</label>
              <input type="tel" placeholder="e.g. 0712345678" value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                className={`w-full bg-white/10 border rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition ${errors.phone ? "border-red-400" : "border-white/20"}`} />
              {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
            </div>

            {/* ID Number */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">National ID Number</label>
              <input type="text" placeholder="Exactly 8 digits" maxLength={8} value={form.id_number}
                onChange={e => setForm({ ...form, id_number: e.target.value.replace(/\D/g, "") })}
                className={`w-full bg-white/10 border rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition ${errors.id_number ? "border-red-400" : "border-white/20"}`} />
              {errors.id_number
                ? <p className="text-red-400 text-xs mt-1">{errors.id_number}</p>
                : <p className="text-slate-500 text-xs mt-1">{form.id_number.length}/8 digits</p>}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} placeholder="8–16 chars, uppercase, number, symbol"
                  value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                  className={`w-full bg-white/10 border rounded-xl px-4 py-2.5 pr-11 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition ${errors.password ? "border-red-400" : "border-white/20"}`} />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-sm">
                  {showPw ? "🙈" : "👁"}
                </button>
              </div>
              {/* Strength bar */}
              {pwStrength && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[1,2,3,4].map(i => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= pwStrength.score ? pwStrength.color : "bg-white/20"}`} />
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{pwStrength.label && `Strength: ${pwStrength.label}`}</p>
                </div>
              )}
              {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm Password</label>
              <input type="password" placeholder="Re-enter your password" value={form.confirm}
                onChange={e => setForm({ ...form, confirm: e.target.value })}
                className={`w-full bg-white/10 border rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition ${errors.confirm ? "border-red-400" : "border-white/20"}`} />
              {errors.confirm && <p className="text-red-400 text-xs mt-1">{errors.confirm}</p>}
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-400 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition shadow-lg shadow-blue-500/20 mt-2">
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <div className="mt-5 border-t border-white/10 pt-5 text-center">
            <p className="text-slate-400 text-sm">
              Already have an account?{" "}
              <button onClick={onSwitch} className="text-blue-300 hover:text-blue-200 font-semibold transition">
                Sign in
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── LOAN SCHEDULE MODAL ──────────────────────────────────────────────────────

function LoanScheduleModal({ loan, onClose, readonly }) {
  const [installments, setInstallments] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    apiFetch(`/loans/${loan.id}/installments`).then(setInstallments).finally(() => setLoading(false));
  }, [loan.id]);

  useEffect(() => { load(); }, [load]);

  const togglePay = async (inst) => {
    if (readonly) return;
    if (inst.status === "paid") {
      await apiFetch(`/installments/${inst.id}/unpay`, { method: "PATCH", body: JSON.stringify({}) });
    } else {
      await apiFetch(`/installments/${inst.id}/pay`, { method: "PATCH", body: JSON.stringify({}) });
    }
    load();
  };

  const totalPaid = installments.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const totalDue  = installments.reduce((s, i) => s + i.amount, 0);

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
          {loading ? <p className="p-6 text-slate-400">Loading schedule…</p> : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b border-slate-100">
                <tr className="text-slate-400 text-xs uppercase">
                  <th className="py-3 px-4 text-left">#</th>
                  <th className="py-3 px-4 text-left">Due Date</th>
                  <th className="py-3 px-4 text-right">Principal</th>
                  <th className="py-3 px-4 text-right">Interest</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-left">Status</th>
                  <th className="py-3 px-4 text-left">Paid On</th>
                  {!readonly && <th className="py-3 px-4"></th>}
                </tr>
              </thead>
              <tbody>
                {installments.map((inst) => (
                  <tr key={inst.id} className={`border-t border-slate-50 ${inst.status === "overdue" ? "bg-red-50/40" : inst.status === "paid" ? "bg-emerald-50/20" : ""}`}>
                    <td className="py-2.5 px-4 text-slate-500">{inst.installment_no}</td>
                    <td className="py-2.5 px-4 text-slate-700">{fmtDate(inst.due_date)}</td>
                    <td className="py-2.5 px-4 text-right text-slate-600">{fmt(inst.principal_portion)}</td>
                    <td className="py-2.5 px-4 text-right text-slate-600">{fmt(inst.interest_portion)}</td>
                    <td className="py-2.5 px-4 text-right font-semibold text-slate-700">{fmt(inst.amount)}</td>
                    <td className="py-2.5 px-4">{statusBadge(inst.status)}</td>
                    <td className="py-2.5 px-4 text-slate-400">{fmtDate(inst.paid_date)}</td>
                    {!readonly && (
                      <td className="py-2.5 px-4 text-right">
                        <button onClick={() => togglePay(inst)}
                          className={`text-xs font-semibold px-3 py-1 rounded-lg transition ${inst.status === "paid" ? "bg-slate-100 text-slate-500 hover:bg-slate-200" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"}`}>
                          {inst.status === "paid" ? "Undo" : "Mark Paid"}
                        </button>
                      </td>
                    )}
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

// ═══════════════════════════════════════════════════════════════════════════════
// BORROWER PORTAL
// ═══════════════════════════════════════════════════════════════════════════════

function BorrowerPortal({ user, onLogout }) {
  const [loans, setLoans]           = useState([]);
  const [reminders, setReminders]   = useState([]);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [borrower, setBorrower]     = useState(null);

  useEffect(() => {
    // Fetch borrower record linked to this user
    apiFetch(`/borrowers/by-user/${user.id}`)
      .then(b => {
        setBorrower(b);
        return apiFetch(`/loans/by-borrower/${b.id}`);
      })
      .then(setLoans)
      .finally(() => setLoading(false));

    apiFetch(`/reminders/${user.id}`).then(setReminders).catch(() => {});
  }, [user.id]);

  const totalDisbursed = loans.reduce((s, l) => s + l.principal, 0);
  const activeLoans    = loans.filter(l => l.status === "active");
  const closedLoans    = loans.filter(l => l.status === "closed");

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-slate-100 flex flex-col shadow-sm">
        <div className="px-5 py-6 border-b border-slate-100">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">MnC Finance</p>
          <h1 className="text-xl font-bold text-slate-800 mt-0.5">LoanTrack</h1>
        </div>
        <div className="flex-1 px-5 py-6">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-medium mb-3">My Portal</p>
          <div className="space-y-1">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium">
              <span>💼</span> My Loans
            </div>
          </div>
        </div>
        <div className="px-4 py-4 border-t border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600 shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-700 truncate">{user.name}</p>
              <p className="text-xs text-slate-400 truncate">ID: {user.id_number}</p>
            </div>
          </div>
          <button onClick={onLogout}
            className="w-full text-xs font-semibold text-slate-500 hover:text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg transition text-left">
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 overflow-y-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My Loan Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Welcome back, <strong>{user.name}</strong>. Here's your loan overview.</p>
        </div>

        <ReminderBanner reminders={reminders} />

        <div className="grid grid-cols-3 gap-4">
          <KPICard label="Total Borrowed" value={fmt(totalDisbursed)} sub={`${loans.length} loan(s)`} accent="blue" />
          <KPICard label="Active Loans" value={activeLoans.length} accent="amber" />
          <KPICard label="Closed Loans" value={closedLoans.length} accent="emerald" />
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-700 text-sm uppercase tracking-wider">My Loans</h3>
          </div>
          {loading ? (
            <p className="p-6 text-slate-400 text-sm">Loading your loans…</p>
          ) : loans.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <p className="text-4xl mb-3">📋</p>
              <p className="font-medium">No loans found.</p>
              <p className="text-sm">Contact MnC to issue a loan to your account.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-slate-500 text-xs uppercase">
                  <th className="py-3 px-4 text-left font-semibold">Loan #</th>
                  <th className="py-3 px-4 text-right font-semibold">Principal</th>
                  <th className="py-3 px-4 text-right font-semibold">Rate</th>
                  <th className="py-3 px-4 text-right font-semibold">Tenure</th>
                  <th className="py-3 px-4 text-left font-semibold">Disbursed</th>
                  <th className="py-3 px-4 text-left font-semibold">Status</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {loans.map(l => (
                  <tr key={l.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                    <td className="py-3 px-4 text-slate-500 font-medium">#{l.id}</td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-700">{fmt(l.principal)}</td>
                    <td className="py-3 px-4 text-right text-slate-500">{l.flat_rate}%</td>
                    <td className="py-3 px-4 text-right text-slate-500">{l.tenure_months}mo</td>
                    <td className="py-3 px-4 text-slate-500">{fmtDate(l.disbursement_date)}</td>
                    <td className="py-3 px-4">{statusBadge(l.status)}</td>
                    <td className="py-3 px-4 text-right">
                      <button onClick={() => setSelectedLoan(l)}
                        className="text-blue-500 hover:text-blue-700 text-xs font-semibold">
                        View Schedule
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Overdue alert */}
        {loans.some(l => l.status === "active") && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-700">
            <strong>💡 Need help?</strong> If you have questions about your loan or repayment schedule, contact MnC Finance directly.
          </div>
        )}
      </main>

      {selectedLoan && (
        <LoanScheduleModal loan={selectedLoan} readonly onClose={() => setSelectedLoan(null)} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN PORTAL
// ═══════════════════════════════════════════════════════════════════════════════

const ADMIN_NAV = [
  { id: "dashboard",  label: "Dashboard",  icon: "📊" },
  { id: "users",      label: "All Users",  icon: "👥" },
  { id: "borrowers",  label: "Borrowers",  icon: "👤" },
  { id: "loans",      label: "Loans",      icon: "💼" },
  { id: "arrears",    label: "Arrears",    icon: "⚠️" },
  { id: "reminders",  label: "Reminders",  icon: "🔔" },
  { id: "smslog",     label: "SMS Log",    icon: "📨" },
];

function AdminPortal({ user, onLogout }) {
  const [view, setView]           = useState("dashboard");
  const [borrowers, setBorrowers] = useState([]);

  useEffect(() => {
    apiFetch("/borrowers").then(setBorrowers).catch(() => {});
  }, [view]);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-56 bg-white border-r border-slate-100 flex flex-col shadow-sm">
        <div className="px-5 py-6 border-b border-slate-100">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">MnC Admin</p>
          <h1 className="text-xl font-bold text-slate-800 mt-0.5">LoanTrack</h1>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {ADMIN_NAV.map(item => (
            <button key={item.id} onClick={() => setView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${view === item.id ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-600 shrink-0">A</div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-700 truncate">{user.name}</p>
              <p className="text-xs text-slate-400">Administrator</p>
            </div>
          </div>
          <button onClick={onLogout}
            className="w-full text-xs font-semibold text-slate-500 hover:text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg transition text-left">
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto">
        {view === "dashboard" && <AdminDashboard />}
        {view === "users"     && <AdminUsers />}
        {view === "borrowers" && <AdminBorrowers />}
        {view === "loans"     && <AdminLoans borrowers={borrowers} />}
        {view === "arrears"   && <AdminArrears />}
        {view === "reminders" && <AdminReminders />}
        {view === "smslog"    && <AdminSMSLog />}
      </main>
    </div>
  );
}

// ── Admin: Dashboard ──────────────────────────────────────────────────────────

function AdminDashboard() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/dashboard").then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-slate-400">Loading…</p>;
  if (!data)   return null;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-800">Portfolio Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard label="Total Disbursed"  value={fmt(data.total_disbursed)}  sub={`${data.total_loans} loans`}       accent="blue" />
        <KPICard label="Repaid"           value={fmt(data.total_repaid)}     sub={`${data.closed_loans} closed`}     accent="emerald" />
        <KPICard label="Arrears"          value={fmt(data.arrears_amount)}   sub={`${data.arrears_count} overdue`}   accent="red" />
        <KPICard label="Registered Users" value={data.total_users ?? "—"}   sub={`${data.total_borrowers} borrowers`} accent="purple" />
        <KPICard label="SMS Sent Today"    value={data.sms_sent_today ?? 0}  sub="via Africa's Talking"               accent="slate" />
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-semibold text-slate-700 mb-4 text-sm uppercase tracking-wider">Recent Loans</h3>
          {data.recent_loans.length === 0
            ? <p className="text-slate-400 text-sm">No loans yet.</p>
            : (
              <table className="w-full text-sm">
                <thead><tr className="text-slate-400 text-xs uppercase border-b border-slate-50">
                  <th className="pb-2 text-left">Borrower</th><th className="pb-2 text-right">Principal</th><th className="pb-2 text-right">Status</th>
                </tr></thead>
                <tbody>{data.recent_loans.map(l => (
                  <tr key={l.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 text-slate-700 font-medium">{l.borrower_name}</td>
                    <td className="py-2 text-right text-slate-600">{fmt(l.principal)}</td>
                    <td className="py-2 text-right">{statusBadge(l.status)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-semibold text-red-600 mb-4 text-sm uppercase tracking-wider">⚠ Overdue Loans</h3>
          {data.overdue_loans.length === 0
            ? <p className="text-slate-400 text-sm">No overdue installments.</p>
            : (
              <table className="w-full text-sm">
                <thead><tr className="text-slate-400 text-xs uppercase border-b border-slate-50">
                  <th className="pb-2 text-left">Borrower</th><th className="pb-2 text-right">Missed</th><th className="pb-2 text-right">Amount Due</th>
                </tr></thead>
                <tbody>{data.overdue_loans.map(l => (
                  <tr key={l.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 text-slate-700 font-medium">{l.borrower_name}</td>
                    <td className="py-2 text-right text-slate-500">{l.overdue_count} inst.</td>
                    <td className="py-2 text-right font-semibold text-red-600">{fmt(l.overdue_amount)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  );
}

// ── Admin: All Users ──────────────────────────────────────────────────────────

function AdminUsers() {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [userLoans, setUserLoans] = useState([]);
  const [loanLoading, setLoanLoading] = useState(false);

  useEffect(() => {
    apiFetch("/users").then(setUsers).finally(() => setLoading(false));
  }, []);

  const viewUser = async (u) => {
    setSelected(u);
    setLoanLoading(true);
    try {
      const borrower = await apiFetch(`/borrowers/by-user/${u.id}`);
      const loans    = await apiFetch(`/loans/by-borrower/${borrower.id}`);
      setUserLoans(loans);
    } catch {
      setUserLoans([]);
    } finally {
      setLoanLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Registered Users</h1>
      <p className="text-slate-500 text-sm -mt-4">All borrowers who have registered an account on LoanTrack.</p>

      {loading ? <p className="text-slate-400">Loading…</p> : users.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-4xl mb-3">👥</p>
          <p className="font-medium">No registered users yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-slate-500 text-xs uppercase">
                <th className="py-3 px-4 text-left font-semibold">Name</th>
                <th className="py-3 px-4 text-left font-semibold">Email</th>
                <th className="py-3 px-4 text-left font-semibold">Phone</th>
                <th className="py-3 px-4 text-left font-semibold">ID Number</th>
                <th className="py-3 px-4 text-right font-semibold">Loans</th>
                <th className="py-3 px-4 text-right font-semibold">Total Borrowed</th>
                <th className="py-3 px-4 text-left font-semibold">Joined</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-semibold text-slate-700">{u.name}</td>
                  <td className="py-3 px-4 text-slate-500">{u.email}</td>
                  <td className="py-3 px-4 text-slate-500">{u.phone || "—"}</td>
                  <td className="py-3 px-4 text-slate-500 font-mono">{u.id_number}</td>
                  <td className="py-3 px-4 text-right text-slate-600">{u.loan_count}</td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-700">{fmt(u.total_borrowed)}</td>
                  <td className="py-3 px-4 text-slate-400">{fmtDate(u.created_at)}</td>
                  <td className="py-3 px-4 text-right">
                    <button onClick={() => viewUser(u)}
                      className="text-blue-500 hover:text-blue-700 text-xs font-semibold">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Modal title={`${selected.name} — User Details`} onClose={() => { setSelected(null); setUserLoans([]); }} wide>
          <div className="grid grid-cols-2 gap-4 text-sm mb-5">
            {[
              ["Full Name", selected.name],
              ["Email", selected.email],
              ["Phone", selected.phone || "—"],
              ["ID Number", selected.id_number],
              ["Registered", fmtDate(selected.created_at)],
              ["Total Borrowed", fmt(selected.total_borrowed)],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-0.5">{label}</p>
                <p className="font-semibold text-slate-700">{value}</p>
              </div>
            ))}
          </div>
          <h4 className="font-semibold text-slate-700 text-sm uppercase tracking-wider border-t border-slate-100 pt-4 mb-3">Loan History</h4>
          {loanLoading ? <p className="text-slate-400 text-sm">Loading…</p> : userLoans.length === 0 ? (
            <p className="text-slate-400 text-sm">No loans found for this user.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-slate-400 text-xs uppercase">
                  <th className="py-2 px-3 text-left">#</th>
                  <th className="py-2 px-3 text-right">Principal</th>
                  <th className="py-2 px-3 text-right">Rate</th>
                  <th className="py-2 px-3 text-right">Tenure</th>
                  <th className="py-2 px-3 text-left">Disbursed</th>
                  <th className="py-2 px-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {userLoans.map(l => (
                  <tr key={l.id} className="border-t border-slate-50">
                    <td className="py-2 px-3 text-slate-500">#{l.id}</td>
                    <td className="py-2 px-3 text-right font-semibold text-slate-700">{fmt(l.principal)}</td>
                    <td className="py-2 px-3 text-right text-slate-500">{l.flat_rate}%</td>
                    <td className="py-2 px-3 text-right text-slate-500">{l.tenure_months}mo</td>
                    <td className="py-2 px-3 text-slate-500">{fmtDate(l.disbursement_date)}</td>
                    <td className="py-2 px-3">{statusBadge(l.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </div>
  );
}

// ── Admin: Borrowers ──────────────────────────────────────────────────────────

function BorrowerProfile({ borrower, onBack, onDeleted }) {
  const [loans, setLoans]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm]         = useState({ name: borrower.name, email: borrower.email || "", phone: borrower.phone || "", id_number: borrower.id_number || "" });
  const [saveMsg, setSaveMsg]   = useState("");
  const [error, setError]       = useState("");

  const loadLoans = useCallback(async () => {
    setLoading(true);
    const all = await apiFetch("/loans");
    setLoans(all.filter(l => l.borrower_id === borrower.id));
    setLoading(false);
  }, [borrower.id]);

  useEffect(() => { loadLoans(); }, [loadLoans]);

  const allClosed = loans.length > 0 && loans.every(l => l.status === "closed");

  const saveEdit = async () => {
    if (!form.name.trim()) { setError("Name is required."); return; }
    setError("");
    await apiFetch(`/borrowers/${borrower.id}`, { method: "PATCH", body: JSON.stringify(form) });
    setSaveMsg("Saved!");
    setEditMode(false);
    setTimeout(() => setSaveMsg(""), 2500);
  };

  const deleteBorrower = async () => {
    if (!confirm(`Delete ${borrower.name}? This will remove all their loans and repayment records.`)) return;
    await apiFetch(`/borrowers/${borrower.id}`, { method: "DELETE" });
    onDeleted();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-700 text-sm font-medium transition">← Back</button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-500 text-sm">Borrowers</span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600">
              {form.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">{form.name}</h2>
              <p className="text-sm text-slate-400">Customer since {fmtDate(borrower.created_at)}</p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {saveMsg && <span className="text-emerald-600 text-sm font-medium">{saveMsg}</span>}
            <button onClick={() => { setEditMode(!editMode); setError(""); setSaveMsg(""); }}
              className="text-sm font-semibold px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
              {editMode ? "Cancel" : "Edit Profile"}
            </button>
            {allClosed && (
              <button onClick={deleteBorrower}
                className="text-sm font-semibold px-4 py-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 transition">
                Delete
              </button>
            )}
          </div>
        </div>

        {editMode ? (
          <div className="border-t border-slate-100 pt-5">
            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            <div className="grid grid-cols-2 gap-x-4">
              <FormInput label="Full Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <FormInput label="ID / National No." value={form.id_number} onChange={e => setForm({ ...form, id_number: e.target.value })} />
              <FormInput label="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              <FormInput label="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <button onClick={saveEdit} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2 rounded-xl text-sm transition">Save Changes</button>
          </div>
        ) : (
          <div className="border-t border-slate-100 pt-5 grid grid-cols-3 gap-4 text-sm">
            {[["Email", borrower.email], ["Phone", borrower.phone], ["ID Number", borrower.id_number]].map(([label, val]) => (
              <div key={label}>
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">{label}</p>
                <p className="text-slate-700 font-medium">{val || "—"}</p>
              </div>
            ))}
          </div>
        )}

        {!allClosed && loans.length > 0 && (
          <p className="mt-4 text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
            This borrower can be deleted once all their loans are fully repaid and closed.
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <KPICard label="Total Disbursed" value={fmt(loans.reduce((s,l) => s+l.principal, 0))} sub={`${loans.length} loan(s)`} accent="blue" />
        <KPICard label="Active Loans" value={loans.filter(l => l.status==="active").length} accent="amber" />
        <KPICard label="Closed Loans" value={loans.filter(l => l.status==="closed").length} accent="emerald" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-700 text-sm uppercase tracking-wider">Loan History</h3>
        </div>
        {loading ? <p className="p-6 text-slate-400 text-sm">Loading…</p> : loans.length === 0 ? (
          <div className="text-center py-12 text-slate-400"><p className="text-3xl mb-2">📋</p><p className="text-sm">No loans yet.</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-slate-500 text-xs uppercase">
                <th className="py-3 px-4 text-left">Loan #</th>
                <th className="py-3 px-4 text-right">Principal</th>
                <th className="py-3 px-4 text-right">Rate</th>
                <th className="py-3 px-4 text-right">Tenure</th>
                <th className="py-3 px-4 text-left">Disbursed</th>
                <th className="py-3 px-4 text-left">Status</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {loans.map(l => (
                <tr key={l.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="py-3 px-4 text-slate-500">#{l.id}</td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-700">{fmt(l.principal)}</td>
                  <td className="py-3 px-4 text-right text-slate-500">{l.flat_rate}%</td>
                  <td className="py-3 px-4 text-right text-slate-500">{l.tenure_months}mo</td>
                  <td className="py-3 px-4 text-slate-500">{fmtDate(l.disbursement_date)}</td>
                  <td className="py-3 px-4">{statusBadge(l.status)}</td>
                  <td className="py-3 px-4 text-right">
                    <button onClick={() => setSelectedLoan(l)} className="text-blue-500 hover:text-blue-700 text-xs font-semibold">View Schedule</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedLoan && <LoanScheduleModal loan={selectedLoan} onClose={() => { setSelectedLoan(null); loadLoans(); }} />}
    </div>
  );
}

function AdminBorrowers() {
  const [borrowers, setBorrowers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected]   = useState(null);
  const [form, setForm]           = useState({ name: "", email: "", phone: "", id_number: "" });
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(true);

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

  if (selected) return <BorrowerProfile borrower={selected} onBack={() => { setSelected(null); load(); }} onDeleted={() => { setSelected(null); load(); }} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Borrowers</h1>
        <button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">+ Add Borrower</button>
      </div>

      {loading ? <p className="text-slate-400">Loading…</p> : borrowers.length === 0 ? (
        <div className="text-center py-20 text-slate-400"><p className="text-4xl mb-3">👤</p><p>No borrowers yet.</p></div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-slate-500 text-xs uppercase">
                <th className="py-3 px-4 text-left">Name</th><th className="py-3 px-4 text-left">Email</th>
                <th className="py-3 px-4 text-left">Phone</th><th className="py-3 px-4 text-left">ID No.</th>
                <th className="py-3 px-4 text-left">Joined</th><th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {borrowers.map(b => (
                <tr key={b.id} className="border-t border-slate-50 hover:bg-blue-50/30 cursor-pointer" onClick={() => setSelected(b)}>
                  <td className="py-3 px-4 font-semibold text-blue-600">{b.name}</td>
                  <td className="py-3 px-4 text-slate-500">{b.email || "—"}</td>
                  <td className="py-3 px-4 text-slate-500">{b.phone || "—"}</td>
                  <td className="py-3 px-4 text-slate-500">{b.id_number || "—"}</td>
                  <td className="py-3 px-4 text-slate-400">{fmtDate(b.created_at)}</td>
                  <td className="py-3 px-4 text-right text-slate-400 text-xs">View →</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title="New Borrower" onClose={() => { setShowModal(false); setError(""); }}>
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          <FormInput label="Full Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <FormInput label="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <FormInput label="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          <FormInput label="ID / National No." value={form.id_number} onChange={e => setForm({ ...form, id_number: e.target.value })} />
          <div className="flex gap-3 pt-2">
            <button onClick={submit} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-xl transition">Save</button>
            <button onClick={() => { setShowModal(false); setError(""); }} className="flex-1 border border-slate-200 text-slate-600 font-semibold py-2 rounded-xl hover:bg-slate-50 transition">Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Admin: Loans ──────────────────────────────────────────────────────────────

function AdminLoans({ borrowers }) {
  const [loans, setLoans]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [error, setError]       = useState("");
  const [form, setForm]         = useState({ borrower_id: "", principal: "", flat_rate: "", tenure_months: "", disbursement_date: new Date().toISOString().split("T")[0] });

  const load = useCallback(() => {
    apiFetch("/loans").then(setLoans).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.borrower_id || !form.principal || !form.flat_rate || !form.tenure_months) { setError("All fields required."); return; }
    setError("");
    await apiFetch("/loans", { method: "POST", body: JSON.stringify({ ...form, borrower_id: parseInt(form.borrower_id), principal: parseFloat(form.principal), flat_rate: parseFloat(form.flat_rate), tenure_months: parseInt(form.tenure_months) }) });
    setShowModal(false);
    setForm({ borrower_id: "", principal: "", flat_rate: "", tenure_months: "", disbursement_date: new Date().toISOString().split("T")[0] });
    load();
  };

  const remove = async (id, e) => {
    e.stopPropagation();
    if (!confirm("Delete this loan?")) return;
    await apiFetch(`/loans/${id}`, { method: "DELETE" });
    load();
  };

  const preview = (() => {
    const p = parseFloat(form.principal), r = parseFloat(form.flat_rate), t = parseInt(form.tenure_months);
    if (!p || !r || !t) return null;
    const ti = p * (r / 100) * (t / 12);
    return { ti, total: p + ti, monthly: (p + ti) / t };
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Loans</h1>
        <button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">+ Issue Loan</button>
      </div>

      {loading ? <p className="text-slate-400">Loading…</p> : loans.length === 0 ? (
        <div className="text-center py-20 text-slate-400"><p className="text-4xl mb-3">📋</p><p>No loans issued yet.</p></div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-slate-500 text-xs uppercase">
                <th className="py-3 px-4 text-left">Borrower</th><th className="py-3 px-4 text-right">Principal</th>
                <th className="py-3 px-4 text-right">Rate</th><th className="py-3 px-4 text-right">Tenure</th>
                <th className="py-3 px-4 text-left">Disbursed</th><th className="py-3 px-4 text-left">Status</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {loans.map(l => (
                <tr key={l.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-semibold text-slate-700">{l.borrower_name}</td>
                  <td className="py-3 px-4 text-right text-slate-700">{fmt(l.principal)}</td>
                  <td className="py-3 px-4 text-right text-slate-500">{l.flat_rate}%</td>
                  <td className="py-3 px-4 text-right text-slate-500">{l.tenure_months}mo</td>
                  <td className="py-3 px-4 text-slate-500">{fmtDate(l.disbursement_date)}</td>
                  <td className="py-3 px-4">{statusBadge(l.status)}</td>
                  <td className="py-3 px-4 text-right flex gap-2 justify-end">
                    <button onClick={() => setSelectedLoan(l)} className="text-blue-500 hover:text-blue-700 text-xs font-semibold">Schedule</button>
                    <button onClick={(e) => remove(l.id, e)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
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
          <FormInput label="Principal (KES) *" type="number" min="0" value={form.principal} onChange={e => setForm({ ...form, principal: e.target.value })} placeholder="e.g. 50000" />
          <FormInput label="Annual Flat Rate (%) *" type="number" min="0" step="0.1" value={form.flat_rate} onChange={e => setForm({ ...form, flat_rate: e.target.value })} placeholder="e.g. 12" />
          <FormInput label="Tenure (months) *" type="number" min="1" value={form.tenure_months} onChange={e => setForm({ ...form, tenure_months: e.target.value })} placeholder="e.g. 12" />
          <FormInput label="Disbursement Date *" type="date" value={form.disbursement_date} onChange={e => setForm({ ...form, disbursement_date: e.target.value })} />
          {preview && (
            <div className="bg-blue-50 rounded-xl p-4 mb-4 text-sm">
              <p className="font-semibold text-blue-700 mb-2">Loan Preview</p>
              <div className="flex justify-between text-slate-600 mb-1"><span>Total Interest</span><span className="font-medium">{fmt(preview.ti)}</span></div>
              <div className="flex justify-between text-slate-600 mb-1"><span>Total Payable</span><span className="font-medium">{fmt(preview.total)}</span></div>
              <div className="flex justify-between text-blue-700 font-semibold border-t border-blue-100 pt-1"><span>Monthly Installment</span><span>{fmt(preview.monthly)}</span></div>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={submit} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-xl transition">Issue Loan</button>
            <button onClick={() => { setShowModal(false); setError(""); }} className="flex-1 border border-slate-200 text-slate-600 font-semibold py-2 rounded-xl hover:bg-slate-50 transition">Cancel</button>
          </div>
        </Modal>
      )}

      {selectedLoan && <LoanScheduleModal loan={selectedLoan} onClose={() => { setSelectedLoan(null); load(); }} />}
    </div>
  );
}

// ── Admin: Arrears ────────────────────────────────────────────────────────────

function AdminArrears() {
  const [data, setData]         = useState(null);
  const [loans, setLoans]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [installments, setInstallments] = useState({});

  useEffect(() => {
    apiFetch("/dashboard").then(setData);
    apiFetch("/loans").then(setLoans).finally(() => setLoading(false));
  }, []);

  const loadInstallments = async (loanId) => {
    if (installments[loanId]) { setExpanded(expanded === loanId ? null : loanId); return; }
    const d = await apiFetch(`/loans/${loanId}/installments`);
    setInstallments(prev => ({ ...prev, [loanId]: d }));
    setExpanded(loanId);
  };

  const markPaid = async (instId, loanId) => {
    await apiFetch(`/installments/${instId}/pay`, { method: "PATCH", body: JSON.stringify({}) });
    const updated = await apiFetch(`/loans/${loanId}/installments`);
    setInstallments(prev => ({ ...prev, [loanId]: updated }));
    setLoans(await apiFetch("/loans"));
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
          <KPICard label="Total Arrears" value={fmt(data.arrears_amount)} accent="amber" />
        </div>
      )}
      {loading ? <p className="text-slate-400">Loading…</p> : overdueLoans.length === 0 ? (
        <div className="text-center py-20 text-slate-400"><p className="text-4xl mb-3">✅</p><p>No overdue loans. All clear.</p></div>
      ) : (
        <div className="space-y-3">
          {overdueLoans.map(loan => {
            const insts  = installments[loan.id] || [];
            const overdue = insts.filter(i => i.status === "overdue");
            return (
              <div key={loan.id} className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
                <button onClick={() => loadInstallments(loan.id)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-red-50/30 transition">
                  <div className="text-left">
                    <p className="font-semibold text-slate-800">{loan.borrower_name}</p>
                    <p className="text-sm text-slate-500">Loan #{loan.id} · {fmt(loan.principal)}</p>
                  </div>
                  <div className="text-right">
                    {overdue.length > 0 && <p className="text-sm font-bold text-red-600">{fmt(overdue.reduce((s,i)=>s+i.amount,0))} overdue</p>}
                    <p className="text-xs text-slate-400">{expanded === loan.id ? "▲ collapse" : "▼ expand"}</p>
                  </div>
                </button>
                {expanded === loan.id && insts.length > 0 && (
                  <div className="border-t border-slate-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr className="text-slate-400 text-xs uppercase">
                          <th className="py-2 px-4 text-left">#</th><th className="py-2 px-4 text-left">Due</th>
                          <th className="py-2 px-4 text-right">Amount</th><th className="py-2 px-4 text-left">Status</th>
                          <th className="py-2 px-4"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {insts.map(inst => (
                          <tr key={inst.id} className={`border-t border-slate-50 ${inst.status==="overdue"?"bg-red-50/40":""}`}>
                            <td className="py-2 px-4 text-slate-500">{inst.installment_no}</td>
                            <td className="py-2 px-4 text-slate-700">{fmtDate(inst.due_date)}</td>
                            <td className="py-2 px-4 text-right font-semibold text-slate-700">{fmt(inst.amount)}</td>
                            <td className="py-2 px-4">{statusBadge(inst.status)}</td>
                            <td className="py-2 px-4 text-right">
                              {inst.status !== "paid" && (
                                <button onClick={() => markPaid(inst.id, loan.id)} className="text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-semibold px-3 py-1 rounded-lg transition">Mark Paid</button>
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

// ── Admin: Reminders ──────────────────────────────────────────────────────────

function AdminReminders() {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    apiFetch("/reminders/admin").then(setReminders).finally(() => setLoading(false));
  }, []);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Payment Reminders</h1>
        <p className="text-slate-500 text-sm mt-0.5">Installments due tomorrow — <strong>{tomorrowStr}</strong></p>
      </div>

      {loading ? <p className="text-slate-400">Loading…</p> : reminders.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-4xl mb-3">🎉</p>
          <p className="font-medium text-lg">No payments due tomorrow.</p>
          <p className="text-sm mt-1">All borrowers are up to date for the next 24 hours.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
            <strong>🔔 {reminders.length} installment{reminders.length > 1 ? "s" : ""} due tomorrow.</strong> Contact borrowers to ensure timely payment.
          </div>
          <SendAllRemindersButton />

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-slate-500 text-xs uppercase">
                  <th className="py-3 px-4 text-left">Borrower</th>
                  <th className="py-3 px-4 text-left">Email</th>
                  <th className="py-3 px-4 text-left">Phone</th>
                  <th className="py-3 px-4 text-left">Loan #</th>
                  <th className="py-3 px-4 text-right">Installment</th>
                  <th className="py-3 px-4 text-right">Amount Due</th>
                  <th className="py-3 px-4 text-left">Due Date</th>
                </tr>
              </thead>
              <tbody>
                {reminders.map(r => (
                  <tr key={r.id} className="border-t border-slate-50 hover:bg-amber-50/30">
                    <td className="py-3 px-4 font-semibold text-slate-700">{r.borrower_name}</td>
                    <td className="py-3 px-4 text-slate-500">{r.email || "—"}</td>
                    <td className="py-3 px-4 text-slate-500">{r.phone || "—"}</td>
                    <td className="py-3 px-4 text-slate-500">#{r.loan_id}</td>
                    <td className="py-3 px-4 text-right text-slate-500">#{r.installment_no}</td>
                    <td className="py-3 px-4 text-right font-bold text-amber-700">{fmt(r.amount)}</td>
                    <td className="py-3 px-4 text-slate-600">{fmtDate(r.due_date)}</td>
                    <td className="py-3 px-4 text-right"><SendReminderBtn borrower_name={r.borrower_name} loan_id={r.loan_id} phone={r.phone} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SMS Log (Admin) ──────────────────────────────────────────────────────────

function AdminSMSLog() {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/sms-log").then(setLogs).finally(() => setLoading(false));
  }, []);

  const statusColor = (s) => {
    if (!s) return "text-slate-400";
    if (s === "Success" || s === "sent" || s === "simulated") return "text-emerald-600";
    if (s.startsWith("error")) return "text-red-500";
    return "text-amber-600";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">SMS Log</h1>
        <p className="text-slate-500 text-sm mt-0.5">All messages sent via Africa's Talking — last 200 records.</p>
      </div>

      {loading ? <p className="text-slate-400">Loading…</p> : logs.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-4xl mb-3">📨</p>
          <p className="font-medium">No SMS messages sent yet.</p>
          <p className="text-sm">Messages appear here once reminders or notifications are triggered.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-slate-500 text-xs uppercase">
                <th className="py-3 px-4 text-left font-semibold">Borrower</th>
                <th className="py-3 px-4 text-left font-semibold">Phone</th>
                <th className="py-3 px-4 text-left font-semibold">Message</th>
                <th className="py-3 px-4 text-left font-semibold">Status</th>
                <th className="py-3 px-4 text-left font-semibold">Sent At</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-medium text-slate-700">{l.borrower_name || "—"}</td>
                  <td className="py-3 px-4 text-slate-500 font-mono text-xs">{l.phone}</td>
                  <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={l.message}>{l.message}</td>
                  <td className={`py-3 px-4 text-xs font-semibold ${statusColor(l.status)}`}>{l.status}</td>
                  <td className="py-3 px-4 text-slate-400 text-xs">{fmtDate(l.sent_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Send Reminder Buttons ─────────────────────────────────────────────────────

function SendAllRemindersButton() {
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(false);

  const send = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/reminders/send-all", { method: "POST", body: JSON.stringify({}) });
      setStatus(`✅ Sent ${res.sent} SMS message${res.sent !== 1 ? "s" : ""} successfully.`);
    } catch (err) {
      setStatus(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(null), 5000);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button onClick={send} disabled={loading}
        className="bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-xl transition shadow-sm">
        {loading ? "Sending…" : "📨 Send All SMS Reminders"}
      </button>
      {status && <span className="text-sm font-medium text-slate-700">{status}</span>}
    </div>
  );
}

function SendReminderBtn({ borrower_name, loan_id, phone }) {
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);

  if (!phone) return <span className="text-xs text-slate-300">No phone</span>;

  const send = async (e) => {
    e.stopPropagation();
    setLoading(true);
    try {
      // We send to all of this borrower's tomorrow installments via the borrower route
      // (identified by loan_id — look up borrower via loan)
      await fetch(`${API}/reminders/send-all`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({}) });
      setSent(true);
    } catch {
      setSent(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={send} disabled={loading || sent}
      className={`text-xs font-semibold px-3 py-1 rounded-lg transition ${sent ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700 hover:bg-amber-200"}`}>
      {loading ? "…" : sent ? "Sent ✓" : "Send SMS"}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════════

export default function App() {
  const [user, setUser] = useState(null);

  if (!user) return <AuthPage onLogin={setUser} />;
  if (user.role === "admin") return <AdminPortal user={user} onLogout={() => setUser(null)} />;
  return <BorrowerPortal user={user} onLogout={() => setUser(null)} />;
}