---
name: db-safety
description: >-
  Hard safety gate for Pre-PM Survey storage layers: SQLite (survey.db), Master
  Excel (DATABASE.xlsx), and survey files (data/surveys/*.json). Block destructive
  operations, require explicit confirmation before touching survey.db, dropping
  tables, overwriting DATABASE.xlsx, or bulk deleting survey JSON records.
  Trigger on /db-safety or whenever data deletion, reset, or migration is mentioned.
license: Internal project skill (no external redistribution terms)
---

# DB & Data Safety (SQLite / DATABASE.xlsx / data/surveys)

Hard gate that sits **above** normal code changes in **NBTC Microwave Pre-PM Survey (`Pre_PM2`)**.
Complements root [`AGENTS.md`](../../../AGENTS.md) path/deletion rules and
[`handoff-safety`](../../../.agents/skills/handoff-safety/SKILL.md).

**Output to user: ภาษาไทย** (paths / command names may stay English).  
Skill body stays English for consistency with other project skills.

## Storage Layers in Pre-PM2

| Layer | Path | Role | Risk |
|---|---|---|---|
| **Live Field Records** | `data/surveys/*.json` | Source of truth on GitHub `main` for field visits | Mass delete or file rewrite causes data loss for field teams |
| **Master Station Excel** | `DATABASE.xlsx` | 197 NBTC stations master directory | Modifying or corrupting loses station coordinates & metadata |
| **Local SQLite Engine** | `survey.db` | Local SQLite caching & photo metadata used by `database.py` | Dropping tables or corrupting breaks local reporting & export tools |
| **Edge API Snapshots** | R2 `/api/dashboard`, `/api/database` | Cloudflare R2 snapshots for fast static read | Bad deploy corrupts public dashboard view |

## When to apply

- Any script or SQL that alters SQLite tables in `survey.db` or drops tables
- Any script or operation that overwrites or modifies `DATABASE.xlsx`
- Any bulk delete or modification of `data/surveys/*.json`
- User asks to clear, reset, wipe, or rebuild survey database
- `/db-safety`

---

## Hard Deny (never run — no exceptions without explicit user YES)

Do **not** execute these unless the user confirmed with the protocol below:

| Class | Examples |
|---|---|
| Delete or overwrite Master Excel | Overwriting `DATABASE.xlsx` without verified `.bak` backup |
| Drop / wipe SQLite database | `DROP TABLE`, `DELETE FROM surveys` without WHERE, deleting `survey.db` |
| Bulk delete survey JSONs | `rm data/surveys/*.json`, bulk GitHub DELETE API calls |
| Untracked schema mutation | Modifying `database.py` SQLite schema without backward compatibility |
| Hard reset git data | `git reset --hard` or `git clean -fdx` wiping `data/surveys/` |

Also **never**:
- Hardcode secrets (`GITHUB_TOKEN`, R2 credentials) into source files
- Serve sensitive files (`DATABASE.xlsx`, `survey.db`, `access-password.txt`) publicly on web

---

## Confirmation protocol (verbatim gate)

Before any Hard Deny / high-risk data mutation, stop and show **all** of:

1. **Target storage** — `survey.db` / `DATABASE.xlsx` / `data/surveys/*.json`
2. **Environment** — `local` (developer machine) / `github-main` (live field data) / `r2-cdn` (production)
3. **Exact command or code** — SQL query, python script, or file operation
4. **Blast radius** — exact number of records/files affected; is backup available? is it reversible?
5. **Why** — one sentence purpose

Then wait for an unambiguous confirmation, e.g.:
```text
YES, RUN <command> ON <target>
```
If confirmation is vague (“ok”, “ทำเลย”, “ไป”) → **cancel** and ask again with the five points.

---

## Safe defaults (what to do instead)

| Goal | Prefer | Avoid |
|---|---|---|
| Update Station Directory | Backup `DATABASE.xlsx` to `DATABASE_backup_<date>.xlsx` before editing | Editing in-place without backup |
| Fix Survey Record | Update single `data/surveys/<recordId>.json` with commit message | Bulk rewriting JSON directory |
| SQLite Schema Migration | Add `IF NOT EXISTS` columns in `database.py:init_db()` additively | `DROP TABLE` and recreate |
| Backup before maintenance | Copy `survey.db` and `DATABASE.xlsx` to `_backup/` | Running mutation on live file |

---

## Allowed without extra YES

- Read-only queries (`SELECT * FROM surveys`, reading `DATABASE.xlsx`, listing `data/surveys/`)
- Verification builds: `npm run build`, `npm run preview`
- Local read-only report exports: `python export_pdf.py --dry-run`
