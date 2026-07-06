import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API_BASE = 'http://localhost:8000'

function App() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [dashboard, setDashboard] = useState(null)
  const [borrowers, setBorrowers] = useState([])

  const [newBorrower, setNewBorrower] = useState({
    name: '',
    email: '',
    phone: '',
    id_number: '',
  })

  const [loans, setLoans] = useState([])
  const [newLoan, setNewLoan] = useState({
    borrower_id: '',
    principal: '',
    flat_rate: '',
    tenure_months: '',
    disbursement_date: '',
  })

  const [selectedLoanId, setSelectedLoanId] = useState('')
  const [installments, setInstallments] = useState([])

  const canCreateBorrower = useMemo(() => {
    return newBorrower.name.trim().length > 0
  }, [newBorrower.name])

  const canCreateLoan = useMemo(() => {
    const b = Number(newLoan.borrower_id)
    const principal = Number(newLoan.principal)
    const flat_rate = Number(newLoan.flat_rate)
    const tenure_months = Number(newLoan.tenure_months)
    return (
      Number.isInteger(b) &&
      b > 0 &&
      Number.isFinite(principal) &&
      principal > 0 &&
      Number.isFinite(flat_rate) &&
      flat_rate >= 0 &&
      Number.isInteger(tenure_months) &&
      tenure_months > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(newLoan.disbursement_date.trim())
    )
  }, [newLoan])

  function formatMoney(n) {
    const x = Number(n)
    if (!Number.isFinite(x)) return ''
    return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  async function apiFetch(path, opts) {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(text || `Request failed: ${res.status}`)
    }
    return res.json()
  }

  async function loadAll() {
    setError('')
    setLoading(true)
    try {
      const [dash, brs, lns] = await Promise.all([
        apiFetch('/dashboard'),
        apiFetch('/borrowers'),
        apiFetch('/loans'),
      ])
      setDashboard(dash)
      setBorrowers(brs)
      setLoans(lns)
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function loadInstallments(loanId) {
    setError('')
    setLoading(true)
    try {
      const rows = await apiFetch(`/loans/${loanId}/installments`)
      setInstallments(rows)
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Fire-and-forget to avoid lint rule complaints about setting state inside effects
    ;(async () => {
      try {
        setError('')
        setLoading(true)
        const [dash, brs, lns] = await Promise.all([
          apiFetch('/dashboard'),
          apiFetch('/borrowers'),
          apiFetch('/loans'),
        ])
        setDashboard(dash)
        setBorrowers(brs)
        setLoans(lns)
      } catch (e) {
        setError(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedLoanId) return

    ;(async () => {
      try {
        setError('')
        setLoading(true)
        const rows = await apiFetch(`/loans/${selectedLoanId}/installments`)
        setInstallments(rows)
      } catch (e) {
        setError(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLoanId])

  async function handleCreateBorrower(e) {
    e.preventDefault()
    if (!canCreateBorrower) return

    setError('')
    setLoading(true)
    try {
      const payload = {
        name: newBorrower.name.trim(),
        email: newBorrower.email.trim() || null,
        phone: newBorrower.phone.trim() || null,
        id_number: newBorrower.id_number.trim() || null,
      }
      await apiFetch('/borrowers', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setNewBorrower({ name: '', email: '', phone: '', id_number: '' })
      await loadAll()
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateLoan(e) {
    e.preventDefault()
    if (!canCreateLoan) return

    setError('')
    setLoading(true)
    try {
      const payload = {
        borrower_id: Number(newLoan.borrower_id),
        principal: Number(newLoan.principal),
        flat_rate: Number(newLoan.flat_rate),
        tenure_months: Number(newLoan.tenure_months),
        disbursement_date: newLoan.disbursement_date.trim(),
      }
      const created = await apiFetch('/loans', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setSelectedLoanId(String(created.id))
      setNewLoan({
        borrower_id: '',
        principal: '',
        flat_rate: '',
        tenure_months: '',
        disbursement_date: '',
      })
      await loadAll()
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function updateInstallment(id, action) {
    setError('')
    setLoading(true)
    try {
      if (action === 'pay') {
        await apiFetch(`/installments/${id}/pay`, { method: 'PATCH', body: JSON.stringify({}) })
      } else {
        await apiFetch(`/installments/${id}/unpay`, { method: 'PATCH' })
      }
      if (selectedLoanId) await loadInstallments(selectedLoanId)
      await loadAll()
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' }}>
      <h1 style={{ margin: '8px 0 16px' }}>Loan Finance Tracker</h1>

      {error ? (
        <div style={{ background: '#fee', border: '1px solid #f99', padding: 12, marginBottom: 16 }}>
          <b>Error:</b> {error}
        </div>
      ) : null}

      {loading ? <div style={{ marginBottom: 12 }}>Loading…</div> : null}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <Stat title="Total Loans" value={dashboard?.total_loans ?? '-'} />
        <Stat title="Active Loans" value={dashboard?.active_loans ?? '-'} />
        <Stat title="Closed Loans" value={dashboard?.closed_loans ?? '-'} />
        <Stat title="Total Borrowers" value={dashboard?.total_borrowers ?? '-'} />

        <Stat title="Total Disbursed" value={dashboard ? formatMoney(dashboard.total_disbursed) : '-'} />
        <Stat title="Total Repaid" value={dashboard ? formatMoney(dashboard.total_repaid) : '-'} />
        <Stat title="Arrears Count" value={dashboard?.arrears_count ?? '-'} />
        <Stat title="Arrears Amount" value={dashboard ? formatMoney(dashboard.arrears_amount) : '-'} />
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
        <div style={{ border: '1px solid #ddd', padding: 14, borderRadius: 8 }}>
          <h2 style={{ marginTop: 0 }}>Create Borrower</h2>
          <form onSubmit={handleCreateBorrower} style={{ display: 'grid', gap: 10 }}>
            <Field label="Name" value={newBorrower.name} onChange={(v) => setNewBorrower((s) => ({ ...s, name: v }))} required />
            <Field label="Email" value={newBorrower.email} onChange={(v) => setNewBorrower((s) => ({ ...s, email: v }))} />
            <Field label="Phone" value={newBorrower.phone} onChange={(v) => setNewBorrower((s) => ({ ...s, phone: v }))} />
            <Field label="ID Number" value={newBorrower.id_number} onChange={(v) => setNewBorrower((s) => ({ ...s, id_number: v }))} />
            <button type="submit" disabled={!canCreateBorrower || loading}>
              Add Borrower
            </button>
          </form>

          <h3 style={{ marginTop: 18 }}>Existing Borrowers</h3>
          <ul style={{ paddingLeft: 18 }}>
            {borrowers.slice(0, 10).map((b) => (
              <li key={b.id} style={{ marginBottom: 8 }}>
                <span>
                  {b.name} (#{b.id})
                </span>{' '}
                <button
                  type="button"
                  onClick={async () => {
                    const ok = window.confirm(`Delete borrower #${b.id} (${b.name})? This may fail if they have active loans.`)
                    if (!ok) return

                    setError('')
                    setLoading(true)
                    try {
                      await apiFetch(`/borrowers/${b.id}`, { method: 'DELETE' })
                      await loadAll()
                    } catch (e) {
                      setError(e?.message || String(e))
                    } finally {
                      setLoading(false)
                    }
                  }}
                  disabled={loading}
                  style={{ marginLeft: 12, color: '#b00', border: '1px solid #eaa', background: '#fff', padding: '2px 8px', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer' }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ border: '1px solid #ddd', padding: 14, borderRadius: 8 }}>
          <h2 style={{ marginTop: 0 }}>Create Loan</h2>
          <form onSubmit={handleCreateLoan} style={{ display: 'grid', gap: 10 }}>
            <label>
              Borrower
              <select
                value={newLoan.borrower_id}
                onChange={(e) => setNewLoan((s) => ({ ...s, borrower_id: e.target.value }))}
                style={{ width: '100%', padding: 8 }}
              >
                <option value="">Select borrower</option>
                {borrowers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} (#{b.id})
                  </option>
                ))}
              </select>
            </label>

            <Field label="Principal" type="number" step="0.01" value={newLoan.principal} onChange={(v) => setNewLoan((s) => ({ ...s, principal: v }))} required />
            <Field label="Flat Rate (%)" type="number" step="0.01" value={newLoan.flat_rate} onChange={(v) => setNewLoan((s) => ({ ...s, flat_rate: v }))} required />
            <Field label="Tenure (months)" type="number" step="1" value={newLoan.tenure_months} onChange={(v) => setNewLoan((s) => ({ ...s, tenure_months: v }))} required />
            <Field label="Disbursement Date" type="date" value={newLoan.disbursement_date} onChange={(v) => setNewLoan((s) => ({ ...s, disbursement_date: v }))} required />

            <button type="submit" disabled={!canCreateLoan || loading}>
              Add Loan
            </button>
          </form>

          <h3 style={{ marginTop: 18 }}>Recent Loans</h3>
          <ul style={{ paddingLeft: 18 }}>
            {loans.slice(0, 10).map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => setSelectedLoanId(String(l.id))}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'blue', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {l.borrower_name} • Loan #{l.id}
                </button>{' '}
                — {l.status} — {formatMoney(l.principal)}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div style={{ border: '1px solid #ddd', padding: 14, borderRadius: 8, marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>Installments</h2>

        {selectedLoanId ? (
          <>
            <div style={{ marginBottom: 12 }}>
              Selected Loan ID: <b>{selectedLoanId}</b>
              <button
                type="button"
                onClick={() => loadInstallments(selectedLoanId)}
                disabled={loading}
                style={{ marginLeft: 12 }}
              >
                Refresh
              </button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['No', 'Due Date', 'Amount', 'Principal', 'Interest', 'Status', 'Action'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px 6px' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {installments.map((it) => (
                  <tr key={it.id}>
                    <td style={{ padding: '8px 6px' }}>{it.installment_no}</td>
                    <td style={{ padding: '8px 6px' }}>{it.due_date}</td>
                    <td style={{ padding: '8px 6px' }}>{formatMoney(it.amount)}</td>
                    <td style={{ padding: '8px 6px' }}>{formatMoney(it.principal_portion)}</td>
                    <td style={{ padding: '8px 6px' }}>{formatMoney(it.interest_portion)}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <b>{it.status}</b>
                      {it.status === 'overdue' ? <span style={{ color: '#b00', marginLeft: 6 }}>(arrears)</span> : null}
                    </td>
                    <td style={{ padding: '8px 6px' }}>
                      {it.status !== 'paid' ? (
                        <button type="button" onClick={() => updateInstallment(it.id, 'pay')} disabled={loading}>
                          Mark paid
                        </button>
                      ) : (
                        <button type="button" onClick={() => updateInstallment(it.id, 'unpay')} disabled={loading}>
                          Unpay
                        </button>
                      )}
                    </td>
                  </tr>
                ))}

                {installments.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 12, color: '#666' }}>
                      No installments found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </>
        ) : (
          <div style={{ color: '#666' }}>Select a loan to view installments.</div>
        )}
      </div>
    </div>
  )
}

function Stat({ title, value }) {
  return (
    <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
      <div style={{ color: '#666', fontSize: 13 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required = false, step }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        type={type}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        style={{ width: '100%', padding: 8 }}
      />
    </label>
  )
}

export default App

