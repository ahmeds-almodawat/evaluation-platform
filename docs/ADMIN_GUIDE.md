# Admin Guide (Internal)

This guide explains the day-to-day admin workflow for the Employee Evaluation Platform (Arabic/English) for ~500 employees.

## Quick start
1) **Add Departments** (Arabic + English names)
2) **Upload Users** (bulk upload)
3) **Review Templates** (default template and any custom templates)
4) **Send a pilot evaluation** (small group)
5) Scale to the full company
6) Use **Dashboards** + **Exports** for reporting and backups

---

## 1) Departments
- Go to **Settings → Departments**
- Add department names in **English and Arabic**
- Keep names consistent with HR/ERP naming

**Tip:** Create departments first before user import (so department mapping works cleanly).

---

## 2) Bulk upload users
- Go to **Settings → Users**
- Download the provided template
- Fill:
  - English name
  - Arabic name
  - Email / phone
  - Department (and Department ID if required)
- Upload and verify:
  - Randomly check 10 users
  - Confirm department mapping

---

## 3) Templates
- Go to **Evaluation Templates**
- Only **Admin** can create/edit/delete templates
- Default template can be edited by Admin only

**Anonymity:**
- If enabled, submissions are anonymous (identity hidden in results unless admin-only “reveal identity” is enabled in your configuration).

---

## 4) Sending evaluations
- Go to **Evaluations**
- Create a new cycle (monthly recommended)
- Choose:
  - Same-department and/or cross-department
  - Target department(s) and roles
- Send to a small pilot first, then scale

---

## 5) Dashboards
Open **Dashboard** and choose:
- **Executive Dashboards:** CEO view (KPIs, trends)
- **Company Dashboard:** org-wide view
- **Department Dashboard:** department-level view
- **Employee Dashboard:** individual view (self)

**Empty dashboards?** This is normal before the first evaluation cycle completes.

---

## 6) Export Center (backups and reporting)
- Go to **Settings → Export Center**
- Export to Excel (XLSX) or CSV (BOM)
- Export Center is resilient:
  - If a table/column is not available yet, it exports an empty sheet and continues.

**Recommended internal routine:**
- Weekly export backup for Users + Evaluations + Audit Logs

---

## 7) Troubleshooting
### “Schema cache” or “column does not exist”
Run in Supabase SQL Editor:
```sql
NOTIFY pgrst, 'reload schema';
```
Then refresh the app.

### Exports show empty results
- Confirm evaluations are **completed**
- Confirm the dashboard filters/date range

---

## 8) Go-live tips for 500 employees
- Pilot in 1–2 departments first
- Communicate clear deadlines
- Set a monthly cadence (same day every month)
- Use the Executive dashboard as your “single source of truth”
