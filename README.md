# LoanTrack — Loan Finance Management System

A full-stack loan management application built for microfinance and lending companies. It enables you to manage borrowers, issue loans, track repayment schedules, flag overdue installments, and monitor portfolio health through a live dashboard.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Features](#features)
4. [Project Structure](#project-structure)
5. [Prerequisites](#prerequisites)
6. [Local Setup — Backend](#local-setup--backend)
7. [Local Setup — Frontend](#local-setup--frontend)
8. [Running the Application](#running-the-application)
9. [Authentication](#authentication)
10. [API Reference](#api-reference)
11. [Interest Model](#interest-model)
12. [Database Schema](#database-schema)
13. [Deployment](#deployment)
    - [Backend → Railway](#backend--railway)
    - [Frontend → Vercel](#frontend--vercel)
14. [Environment Variables](#environment-variables)
15. [Troubleshooting](#troubleshooting)
16. [Roadmap](#roadmap)

---

## Overview

LoanTrack is a single-page React application backed by a Flask REST API and an SQLite database. It is designed for internal use by loan officers and finance managers who need to:

- Register and manage borrower profiles
- Issue loans with automatic repayment schedule generation
- Record and track monthly installment payments
- Identify overdue accounts and total arrears at a glance
- View a real-time portfolio dashboard with key performance indicators

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Tailwind CSS, Vite |
| Backend | Python 3.10+, Flask, Flask-CORS |
| Database | SQLite (via Python's built-in `sqlite3`) |
| Deployment — Frontend | Vercel |
| Deployment — Backend | Railway |

---

## Features

### Authentication
- Login page requiring Full Name, ID Number, and Password
- Session held in memory for the duration of the browser tab
- User identity displayed in the sidebar with a Sign Out button

### Dashboard
- Total amount disbursed across all loans
- Total repaid to date
- Arrears amount and count of overdue installments
- Total registered borrowers and active loans
- Recent loans table
- Live overdue loans summary

### Borrower Management
- Add borrowers with name, email, phone, and national ID number
- Click any borrower to open their full profile
- Edit borrower details inline (name, email, phone, ID number)
- View complete loan history per borrower with statuses
- Delete a borrower only after all their loans are fully repaid and closed

### Loan Issuance
- Issue loans with principal amount, annual flat interest rate, tenure in months, and disbursement date
- Live preview of total interest, total payable, and monthly installment before confirming
- Repayment schedule auto-generated on loan creation

### Repayment Tracking
- View the full installment schedule for any loan
- Mark individual installments as paid or undo a payment
- Loan status automatically changes to `closed` when all installments are paid

### Arrears Management
- Dedicated arrears view listing all loans with overdue installments
- Expandable rows to view and action individual overdue installments
- Overdue status is auto-flagged when a pending installment's due date passes

---

## Project Structure

```
loantrack/
├── backend/
│   ├── venv/                  # Python virtual environment (not committed)
│   ├── main.py                # Flask application — all routes and DB logic
│   ├── loans.db               # SQLite database (auto-created on first run)
│   ├── requirements.txt       # Python dependencies
│   └── Procfile               # For Railway deployment
│
└── frontend/
    ├── public/
    ├── src/
    │   ├── App.jsx            # Entire React SPA — all views and components
    │   ├── index.css          # Tailwind CSS directives
    │   └── main.jsx           # React entry point
    ├── index.html
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── vite.config.js
    ├── vercel.json            # Vercel SPA routing config
    └── package.json
```

---

## Prerequisites

Install these before starting:

| Tool | Version | Download |
|---|---|---|
| Python | 3.10 or higher | [python.org/downloads](https://www.python.org/downloads) |
| Node.js | 18 or higher | [nodejs.org](https://nodejs.org) |
| Git | Any recent version | [git-scm.com](https://git-scm.com) |
| VS Code (recommended) | Any | [code.visualstudio.com](https://code.visualstudio.com) |

**Recommended VS Code extensions:**
- Python (Microsoft)
- ES7+ React/Redux/React-Native Snippets
- Tailwind CSS IntelliSense
- Thunder Client (for testing the API)

---

## Local Setup — Backend

### 1. Navigate to the backend folder

```bash
cd loantrack/backend
```

### 2. Create a virtual environment

```bash
python3 -m venv venv
```

### 3. Activate the virtual environment

**macOS / Linux:**
```bash
source venv/bin/activate
```

**Windows (Command Prompt):**
```cmd
venv\Scripts\activate
```

**Windows (PowerShell):**
```powershell
venv\Scripts\Activate.ps1
```

You should see `(venv)` at the start of your terminal prompt.

### 4. Install Python dependencies

```bash
pip install flask flask-cors python-dateutil
```

Or if you have a `requirements.txt`:
```bash
pip install -r requirements.txt
```

### 5. Confirm `main.py` is in the backend folder

```
backend/
  venv/
  main.py    ← should be here
```

The `loans.db` SQLite file will be created automatically in this same folder the first time the server starts.

---

## Local Setup — Frontend

### 1. Navigate to the frontend folder (from the project root)

```bash
cd loantrack/frontend
```

### 2. Install Node dependencies

```bash
npm install
```

### 3. Install and configure Tailwind CSS

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 4. Configure `tailwind.config.js`

Replace the contents of `frontend/tailwind.config.js` with:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
}
```

### 5. Configure `src/index.css`

Replace the entire contents of `frontend/src/index.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 6. Confirm `src/main.jsx` imports the CSS

Open `frontend/src/main.jsx` and make sure it contains:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

### 7. Place `App.jsx`

Copy the provided `App.jsx` into `frontend/src/App.jsx`, replacing any existing file there.

---

## Running the Application

You need **two terminals running simultaneously** — one for the backend, one for the frontend.

### Terminal 1 — Start the Flask backend

```bash
cd loantrack/backend
source venv/bin/activate      # macOS/Linux
# or: venv\Scripts\activate   # Windows

python main.py
```

Expected output:
```
 * Running on http://127.0.0.1:8000
 * Debug mode: on
```

Verify it works by visiting: [http://localhost:8000/dashboard](http://localhost:8000/dashboard)

### Terminal 2 — Start the React frontend

```bash
cd loantrack/frontend
npm run dev
```

Expected output:
```
  VITE v5.x  ready in 300ms
  ➜  Local:   http://localhost:5173/
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

> **Both servers must be running at the same time.** The frontend fetches all data from the backend. If the backend is not running, the app will load but all data calls will fail.

---

## Authentication

The login screen requires three fields:

| Field | Description |
|---|---|
| Full Name | Must match exactly (case-insensitive) |
| ID Number | Must match exactly (case-sensitive) |
| Password | Must match exactly |

### Demo credentials (for local development)

| Name | ID Number | Password |
|---|---|---|
| Admin User | ID001 | admin123 |
| Jane Wanjiku | ID002 | password |

> **Note:** Authentication is currently handled client-side in `App.jsx` using a hardcoded user list (`DEMO_USERS`). For production, replace the `authenticate()` function with a real API call to a `/auth/login` endpoint on your Flask backend that verifies credentials against a database and returns a session token.

---

## API Reference

All endpoints return JSON. The base URL is `http://localhost:8000` locally.

### Dashboard

| Method | Endpoint | Description |
|---|---|---|
| GET | `/dashboard` | Returns all KPIs, recent loans, and overdue loan summaries |

### Borrowers

| Method | Endpoint | Description |
|---|---|---|
| GET | `/borrowers` | List all borrowers |
| POST | `/borrowers` | Create a new borrower |
| GET | `/borrowers/{id}` | Get a single borrower |
| PATCH | `/borrowers/{id}` | Update borrower details |
| DELETE | `/borrowers/{id}` | Delete a borrower and all their loans |

**POST `/borrowers` — request body:**
```json
{
  "name": "John Kamau",
  "email": "john@example.com",
  "phone": "0712345678",
  "id_number": "12345678"
}
```

### Loans

| Method | Endpoint | Description |
|---|---|---|
| GET | `/loans` | List all loans |
| POST | `/loans` | Issue a new loan (auto-generates installments) |
| GET | `/loans/{id}` | Get a single loan |
| DELETE | `/loans/{id}` | Delete a loan and its installments |

**POST `/loans` — request body:**
```json
{
  "borrower_id": 1,
  "principal": 50000,
  "flat_rate": 12,
  "tenure_months": 12,
  "disbursement_date": "2025-01-01"
}
```

### Installments

| Method | Endpoint | Description |
|---|---|---|
| GET | `/loans/{id}/installments` | Get full repayment schedule for a loan |
| PATCH | `/installments/{id}/pay` | Mark an installment as paid |
| PATCH | `/installments/{id}/unpay` | Undo a payment |

**PATCH `/installments/{id}/pay` — optional request body:**
```json
{
  "paid_date": "2025-02-01"
}
```
If `paid_date` is omitted, today's date is used.

---

## Interest Model

LoanTrack uses a **flat rate** interest model:

```
Total Interest   = Principal × (Rate / 100) × (Tenure / 12)
Total Payable    = Principal + Total Interest
Monthly Install. = Total Payable / Tenure
```

**Example:** KES 50,000 loan at 12% flat rate over 12 months

```
Total Interest   = 50,000 × 0.12 × (12/12) = KES 6,000
Total Payable    = 50,000 + 6,000           = KES 56,000
Monthly Install. = 56,000 / 12              = KES 4,666.67
```

The last installment is adjusted to absorb any rounding difference across the schedule.

---

## Database Schema

SQLite database file: `backend/loans.db` (auto-created on first run).

### `borrowers`

| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | Auto-incremented |
| name | TEXT | Full name (required) |
| email | TEXT | Optional |
| phone | TEXT | Optional |
| id_number | TEXT | National ID or similar |
| created_at | TEXT | ISO datetime, set on creation |

### `loans`

| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | Auto-incremented |
| borrower_id | INTEGER FK | References `borrowers.id` |
| principal | REAL | Loan amount |
| flat_rate | REAL | Annual flat interest rate (%) |
| tenure_months | INTEGER | Loan duration in months |
| disbursement_date | TEXT | ISO date (YYYY-MM-DD) |
| status | TEXT | `active` or `closed` |
| created_at | TEXT | ISO datetime |

### `installments`

| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | Auto-incremented |
| loan_id | INTEGER FK | References `loans.id` |
| installment_no | INTEGER | 1-indexed sequence number |
| due_date | TEXT | ISO date (YYYY-MM-DD) |
| amount | REAL | Total installment amount |
| principal_portion | REAL | Principal component |
| interest_portion | REAL | Interest component |
| paid_date | TEXT | ISO date when paid (nullable) |
| status | TEXT | `pending`, `overdue`, or `paid` |

---

## Deployment

### Backend → Railway

Railway hosts the Flask API with a persistent server process.

#### 1. Add required files to `backend/`

**`backend/requirements.txt`**
```
flask
flask-cors
python-dateutil
gunicorn
```

**`backend/Procfile`**
```
web: gunicorn main:app
```

#### 2. Push your project to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/loantrack.git
git push -u origin main
```

#### 3. Deploy on Railway

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project → Deploy from GitHub Repo**
3. Select your repository
4. Click **Settings → Root Directory** and set it to `backend`
5. Railway will detect the `Procfile` and deploy automatically
6. Go to **Settings → Networking → Generate Domain** to get your public URL

Your backend URL will look like:
```
https://loantrack-production.up.railway.app
```

#### 4. Update the API URL in `App.jsx`

Find line 3 in `frontend/src/App.jsx`:
```js
const API = "http://localhost:8000";
```
Replace it with your Railway URL:
```js
const API = "https://loantrack-production.up.railway.app";
```

---

### Frontend → Vercel

#### 1. Add `vercel.json` to the `frontend/` folder

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

This ensures React Router (or any client-side navigation) works correctly on page refresh.

#### 2. Deploy using the Vercel CLI

```bash
npm install -g vercel
cd frontend
vercel
```

Follow the prompts:
- **Set up and deploy:** Yes
- **Root directory:** `./` (you are already inside `frontend/`)
- **Build command:** `npm run build`
- **Output directory:** `dist`

Or connect via the Vercel dashboard at [vercel.com](https://vercel.com) by importing the GitHub repo and setting the root directory to `frontend`.

#### 3. Set environment variables on Vercel (optional)

If you later move the API URL to an environment variable, add it in:
**Vercel Dashboard → Project → Settings → Environment Variables**

```
VITE_API_URL = https://loantrack-production.up.railway.app
```

Then update `App.jsx`:
```js
const API = import.meta.env.VITE_API_URL;
```

---

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `VITE_API_URL` | Frontend (Vercel) | Base URL of the Flask backend |
| `FLASK_ENV` | Backend (Railway) | Set to `production` for deployment |
| `PORT` | Backend (Railway) | Auto-set by Railway — do not override |

---

## Troubleshooting

### Tailwind CSS not applying
- Confirm `./src/**/*.{js,ts,jsx,tsx}` is in `tailwind.config.js` `content` array
- Confirm `index.css` has the three `@tailwind` directives
- Confirm `main.jsx` imports `./index.css`
- Restart the dev server: `npm run dev`

### `pip: cannot execute: required file not found`
The virtual environment is broken. Delete and recreate it:
```bash
rm -rf venv
python3 -m venv venv
source venv/bin/activate
pip install flask flask-cors python-dateutil
```

### Backend not connecting to frontend (`Failed to fetch`)
- Confirm the Flask server is running on port 8000
- Confirm `const API = "http://localhost:8000"` in `App.jsx`
- Open the browser console (`F12`) and check for CORS errors
- Ensure `flask-cors` is installed and `CORS(app)` is present in `main.py`

### `loans.db` not found
This is expected on first run. The file is created automatically when `python main.py` starts. If it's missing after startup, check that you are running the command from inside the `backend/` directory.

### Port 8000 already in use
```bash
# Find and kill the process using port 8000
# macOS/Linux:
lsof -ti:8000 | xargs kill

# Windows:
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

### Vercel deployment shows blank page
- Confirm `vercel.json` exists in the `frontend/` folder with the rewrite rule
- Confirm `vite.config.js` does not have a `base` path that conflicts with Vercel routing

### SQLite data lost after Railway redeploy
Railway's filesystem is ephemeral — data in `loans.db` is wiped on each redeploy. For persistent storage, add a **PostgreSQL** database via the Railway dashboard and migrate the backend to use `psycopg2` instead of `sqlite3`.

---

## Roadmap

Future improvements planned for this project:

- [ ] Real backend authentication with JWT tokens and a `users` table
- [ ] PostgreSQL support for production-grade persistence
- [ ] PDF statement generation per borrower or per loan
- [ ] SMS/email payment reminders for overdue installments
- [ ] Role-based access control (admin vs. read-only officer)
- [ ] Reducing balance interest model as an alternative to flat rate
- [ ] Loan restructuring (extend tenure or adjust rate on existing loans)
- [ ] Export to Excel — full portfolio or per-borrower history

---

## License

This project is for internal business use. All rights reserved.