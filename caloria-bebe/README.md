# 🍼 Caloria Bebê

A web app for tracking a baby's feedings and calories. Parents log bottles
(formula or expressed breast milk), breastfeeding and solids. The app
estimates kcal and compares each day with an age- and weight-based energy
target.

```
 browser ──HTTPS──▶ Caddy ──┬── /           static SPA  (frontend/)
  (pt-BR SPA)       :443    └── /api/*  ──▶ FastAPI ──▶ Postgres 16
                  auto TLS                  (backend/)   (volume pgdata)
```

| Layer    | Tech                                                         |
|----------|--------------------------------------------------------------|
| Frontend | Vanilla JS SPA, no build step, mobile-first, light/dark      |
| Backend  | Python 3.12 · FastAPI · SQLAlchemy 2 · JWT auth · bcrypt     |
| Database | PostgreSQL 16 (SQLite for local dev/tests)                   |
| Hosting  | Hostinger VPS · Docker Compose · Caddy (Let's Encrypt HTTPS) |
| CI/CD    | GitHub Actions: tests → rsync → `docker compose up` → health check |

## How calories are computed

- **Daily target** = weight (kg) × reference kcal/kg/day for the baby's sex and
  completed month of age. The reference values are from FAO/WHO/UNU (2004),
  *Human energy requirements*, for 0–23 months (see `backend/app/nutrition.py`).
  The app uses the most recent weight on or before the day.
- **Bottle feedings**: ml × 0.67 kcal/ml, the typical density of mature breast
  milk and of standard formula.
- **Solids**: grams × the food's kcal/100 g, from a starter catalog based on
  the TACO table.
- **Breastfeeding** without a volume estimate is shown as "? kcal" and left out
  of the total.
- Any feeding can take a manual kcal value, which replaces the estimate.

> These are population averages to guide parents, not medical advice.

## API

Interactive docs are at `/api/docs` once the app is running. Every route except
`health`, `auth/*` and `foods` needs `Authorization: Bearer <token>`.

| Method | Path | |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | returns `{access_token}` |
| GET | `/api/me` | current user |
| GET/POST | `/api/babies` | list / create |
| GET/PATCH/DELETE | `/api/babies/{id}` | |
| GET/POST | `/api/babies/{id}/weights` | POST upserts by date |
| GET/POST | `/api/babies/{id}/feedings?date=&tz=` | one local day |
| GET | `/api/babies/{id}/summary?date=&tz=` | kcal vs target |
| GET | `/api/babies/{id}/history?days=14&tz=` | daily totals |
| DELETE | `/api/feedings/{id}`, `/api/weights/{id}` | |
| GET | `/api/foods` | food catalog |

## Local development

```bash
cd caloria-bebe/backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q                                   # 12 tests, in-memory SQLite
uvicorn app.main:app --reload               # API on :8000, SQLite file

# in another shell: serve the frontend and point it at the local API
python -m http.server 5173 -d ../frontend
# then, in the browser console on http://localhost:5173:
#   localStorage.setItem("apiBase", "http://localhost:8000")
# and start the API with CORS_ORIGINS=http://localhost:5173
```

To run the full production stack locally, `cp .env.example .env`, set
`DOMAIN=localhost`, then run `docker compose up --build` and open https://localhost.

## Deploying to the Hostinger VPS

### 1. Prepare the server (once)

In **hPanel → VPS**, pick the **Ubuntu 24.04** template and note the IP. Then:

```bash
ssh root@YOUR_VPS_IP
curl -fsSL https://raw.githubusercontent.com/edwardmonteiro/aikido/main/caloria-bebe/deploy/bootstrap-vps.sh | bash -s -- deploy
```

The script installs Docker and turns on the firewall (22/80/443). It also
creates a `deploy` user and `/opt/caloria-bebe/.env` with a random database
password and JWT secret, and schedules a nightly `pg_dump` backup that keeps
14 days.

### 2. DNS

In **hPanel → Domains → DNS**, add an **A record** that points your domain (or
a subdomain such as `caloria.yourdomain.com`) to the VPS IP. Then set it on the
server:

```bash
sudo -u deploy nano /opt/caloria-bebe/.env      # DOMAIN=caloria.yourdomain.com
```

Caddy gets and renews the HTTPS certificate on its own once DNS resolves.

### 3. Deploy key and GitHub secrets

```bash
# on your machine
ssh-keygen -t ed25519 -f caloria_deploy -N "" -C "github-actions"
ssh-copy-id -i caloria_deploy.pub deploy@YOUR_VPS_IP   # or paste into ~deploy/.ssh/authorized_keys
ssh-keyscan YOUR_VPS_IP                                # output → VPS_KNOWN_HOSTS
```

In **GitHub → Settings → Environments**, create an environment named
`production` and add these secrets:

| Secret | Value |
|---|---|
| `VPS_HOST` | VPS IP or hostname |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | contents of `caloria_deploy` (private key) |
| `VPS_KNOWN_HOSTS` | output of `ssh-keyscan` (recommended; if unset, the workflow scans on each run) |
| `VPS_PORT` | optional, defaults to 22 |

### 4. Ship

Each push to `main` that touches `caloria-bebe/` runs
`.github/workflows/caloria-bebe.yml`. The workflow runs the tests, syncs the
folder to `/opt/caloria-bebe` (it never touches `.env` or `backups/`), runs
`docker compose up -d --build`, and checks `/api/health`. To deploy by hand,
use **Actions → Caloria Bebê → Run workflow**. Until the secrets exist, the
deploy job skips with a warning.

### Operations

```bash
cd /opt/caloria-bebe
docker compose ps
docker compose logs -f api
ls backups/                                           # nightly dumps
gunzip -c backups/caloria-2026-10-29.sql.gz | docker compose exec -T db psql -U caloria caloria   # restore
```

## Known limits / next steps

- The schema is created with `create_all`. Add Alembic before the first change
  to an existing table.
- There is no login rate limiting or password reset yet.
- Each baby belongs to one account. Sharing with a second parent or caregiver
  is not built yet.
