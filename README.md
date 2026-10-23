# HomeScope

*Explore Houston. Understand Home Values.*

A map-first web app for exploring Greater Houston residential properties and comparing them with
machine-learning valuations. This repo contains **Module 1: Home Value Explorer**. Deal Radar and
Affordability Explorer appear in the navigation as "Soon" and plug into the same shell later.

- Interactive Leaflet map of ~26,000 real 2024 Houston listings, with clustering and price labels
- Address / ZIP / city search, filters (price, beds, baths, type, living area), results list
- Property details with the AI valuation front and centre, listing price, facts and benchmarks
- Market statistics scoped to the map view, the filtered set, or the whole dataset
- A model hand-off layer: precomputed predictions or a real-time model bundle from the ML team
- **Ask HomeScope**: AI search that answers plain-English questions from the dataset (OpenAI)

> **What the numbers are.** Prices in the dataset are **2024 Zillow asking prices** from a listing
> snapshot: not sale prices, and the homes are not necessarily for sale now. AI valuations appear
> only when the ML team has supplied a model or predictions; otherwise the app says
> *"AI valuation unavailable — model not connected."* Listing prices, Zestimates and tax values are
> never shown as our model's prediction.

---

## 1. Quick start

Prerequisites: **Python 3.11+** and **Node.js 20+** (tested with Python 3.12 and Node 26), plus
internet access for map tiles and the one-time dataset download.

```bash
# --- Backend (terminal 1) ---
cd backend
python3 -m venv .venv                   # Windows: py -3.12 -m venv .venv
source .venv/bin/activate               # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                    # Windows: copy .env.example .env
python scripts/fetch_dataset.py         # downloads the Kaggle data into data/raw/ (~5 MB)
uvicorn app.main:app --reload --port 8000

# --- Frontend (terminal 2) ---
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. API docs are at **http://localhost:8000/docs**.

**VS Code:** after the installs above, run *Terminal → Run Task… → Start HomeScope*
to start both servers.

If you skip `fetch_dataset.py`, the app still runs on a **synthetic fixture** and shows a
"Synthetic data" warning everywhere.

---

## 2. Technology

| Layer | Stack |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui (Base UI), React Leaflet + Leaflet, supercluster, Recharts, Lucide, React Router |
| Backend | Python, FastAPI, Pydantic v2, pandas |
| ML integration | joblib / scikit-learn pipelines; XGBoost, LightGBM, CatBoost (sklearn wrappers or native files) |
| Data | Local CSV files behind a repository interface (swappable for PostgreSQL/PostGIS) |
| Map tiles | OpenStreetMap (no API key), configurable |

---

## 3. Project structure

```
.
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app factory, CORS, gzip, routers
│   │   ├── config.py            # settings from backend/.env (HOMESCOPE_* variables)
│   │   ├── routes/              # health, properties (+search, meta), market, model (+predict)
│   │   ├── schemas/             # Pydantic response/request models (the API contract)
│   │   ├── services/            # repository (data access), valuation, market stats, DI container
│   │   ├── data/                # ingest.py (cleaning/normalisation), loader.py (real vs fixture)
│   │   └── ml/                  # model_card.py (contract), features.py, predictor.py, batch.py
│   ├── scripts/                 # fetch_dataset.py, generate_fixture.py, predict_batch.py
│   ├── tests/                   # pytest: ingestion, API, model integration
│   ├── requirements.txt, requirements-ml.txt, .env.example
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── map/             # PropertyMap, ClusterLayer (supercluster), MapControls
│       │   ├── property/        # details panel, valuation card, listing-vs-estimate chart
│       │   ├── filters/         # SearchBox, FiltersPanel, ResultsList
│       │   ├── charts/          # MarketStatsPanel
│       │   ├── model/           # model status panel
│       │   ├── layout/          # TopNav, Logo
│       │   └── ui/              # shadcn/ui primitives
│       ├── modules/registry.ts  # product modules (add Deal Radar / Affordability here)
│       ├── pages/               # HomeValueExplorer
│       ├── services/api.ts      # all HTTP calls
│       ├── hooks/, context/, types/, lib/
├── data/
│   ├── raw/                     # real dataset (git-ignored; fetched by script)
│   └── fixtures/                # synthetic development data (committed)
├── models/
│   ├── current/                 # drop a model bundle here (model_card.json + artifact)
│   ├── predictions/             # drop predictions.csv here
│   ├── export_helpers.py        # helpers for the ML team's notebooks
│   ├── model_card.example.json
│   └── README.md                # the model hand-off guide
└── .vscode/tasks.json           # one-click start for both servers
```

---

## 4. Setup in detail

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

`backend/.env` (all optional; defaults shown in `.env.example`):

| Variable | Default | Meaning |
|---|---|---|
| `HOMESCOPE_DATA_DIR` | `data/raw` | Folder with the real CSVs (relative to repo root) |
| `HOMESCOPE_CLEAN_CSV` | `houston_housing_2024_clean.csv` | Kaggle clean dataset file name |
| `HOMESCOPE_DETAILS_CSV` | `houston_listing_details.csv` | Optional address/lot-unit extract |
| `HOMESCOPE_ALLOW_FIXTURE_FALLBACK` | `true` | Serve synthetic data when the real data is missing |
| `HOMESCOPE_MODEL_DIR` | `models/current` | Real-time model bundle folder |
| `HOMESCOPE_PREDICTIONS_PATH` | `models/predictions/predictions.csv` | Batch predictions file |
| `HOMESCOPE_SIMULATED_PREDICTIONS` | `false` | **Dev only**: fake valuations labelled "Simulated — UI Preview" |
| `OPENAI_API_KEY` | *(empty)* | Enables Ask HomeScope (AI search). Server-side only |
| `HOMESCOPE_OPENAI_MODEL` | `gpt-6-luna` | Any OpenAI Responses API model with function calling |
| `HOMESCOPE_OPENAI_REASONING_EFFORT` | `low` | Reasoning effort sent to the model (blank to omit) |
| `HOMESCOPE_CORS_ORIGINS` | `http://localhost:5173,...` | Origins allowed to call the API directly |

Run the tests: `python -m pytest -q` (from `backend/`).

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build
npm run lint         # oxlint
```

In development the browser calls `/api/*` on port 5173 and **Vite proxies it to FastAPI on 8000**,
so no CORS configuration is needed. Optional `frontend/.env.local` settings are in
`frontend/.env.example`:

- `VITE_API_PROXY_TARGET`: where the proxy forwards to (default `http://localhost:8000`)
- `VITE_API_BASE_URL`: call the API directly instead of through the proxy
- `VITE_MAP_TILE_URL` / `VITE_MAP_ATTRIBUTION`: tile provider

**Map tiles.** The default is the standard OpenStreetMap tile server, which needs no key and is
fine for local development and demos. Heavy or production use must follow the
[OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/). To use a keyed
provider (MapTiler, Stadia, Thunderforest…), set the two variables in `frontend/.env.local`. Keep
keys out of git, and keep the attribution accurate.

---

## 5. The dataset

### Supplying it

```bash
cd backend && source .venv/bin/activate
python scripts/fetch_dataset.py
```

This uses KaggleHub to download:

1. **Houston Housing Market 2024 — Clean Dataset** (`mohamedalmansop/houston-housing-market-2024-clean-dataset`),
   saved as `data/raw/houston_housing_2024_clean.csv`.
2. A compact extract of the **raw light JSON** (`datadetective08/houston-housing-market-2024`), saved as
   `data/raw/houston_listing_details.csv`. It adds the things the clean CSV lacks: **street
   addresses**, **lot-size units**, tax-assessed values, and the original bed/bath/area values (used
   to spot imputed fields).

Public datasets normally download anonymously. If Kaggle asks for credentials, create a token at
kaggle.com → Settings → API and save it as `~/.kaggle/kaggle.json`. To supply files manually, put
the clean CSV at `data/raw/houston_housing_2024_clean.csv` (the details file is optional). Then
restart the API, or use **Reload** in the model status panel.

### What ingestion does (`backend/app/data/ingest.py`)

The real CSV differs from its published description, so ingestion was built from the actual file
(25,922 rows; no `streetAddress`, `state` or `lotAreaUnits` columns; ID column `zpid`):

- **Normalises names** to snake_case through an alias table, so `livingArea`, `sqft` and `area` all map to `living_area_sqft`.
- **Validates** required columns (latitude, longitude) and **rejects coordinates** outside Greater Houston.
- **Keeps ZIP codes as 5-character strings** (`7044` becomes `07044`, `77044.0` becomes `77044`).
- **Nulls placeholder values** instead of showing them:
  - Zestimates where `has_zestimate = 0` (the file fills them with the median, 376,400)
  - rent Zestimates where `has_rent_zestimate = 0`
  - the `2001.5` year built on vacant lots
  - zero beds/baths/area on lots
  - bed/bath/area/lot values the clean CSV imputed (absent from the original listing)
- **Converts lot sizes to square feet** using the listing's real unit. Without the details file,
  values under 100 are treated as acres, and those rows are flagged `inferred_acres`.
- **De-duplicates** by ID and by identical records, and **assigns stable IDs** (the `zpid`, or a
  hash of address and coordinates when there is none).

`GET /api/health` reports what was loaded, dropped and nulled.

### Synthetic fallback

If `data/raw/` is empty, the API serves `data/fixtures/synthetic_properties.csv`: 1,500 fabricated
properties on "Fixture Ln". The health endpoint, top bar, map and details panel all label it
**synthetic**. To switch to real data, run `fetch_dataset.py` and restart. Nothing else changes.

---

## 6. Connecting the ML team's model

The full guide is in **[models/README.md](models/README.md)**. In short:

- **A. Batch predictions (simplest).** Export `models/predictions/predictions.csv` with
  `property_id` (the zpid) and `predicted_price` (in dollars). Optional columns: `predicted_low`,
  `predicted_high`, `interval_coverage`, `model_name`, `model_version`. Predictions then show on
  the map, in filters ("AI estimate" price basis), in statistics and in the details panel.
- **B. Real-time model.** Put a bundle in `models/current/`: a `model_card.json` that lists the exact
  training features and how to build each one, plus `model.joblib`. The details panel and
  `POST /api/predict` then call the model live. That supports what-if requests, such as
  overriding `living_area_sqft` for a property. Running `python scripts/predict_batch.py --write`
  turns a bundle into batch predictions.

`models/export_helpers.py` does both exports from a notebook. After adding files, use the model
status chip → **Reload model & predictions**; no restart is needed.

Guarantees built into the integration layer:

- **No fabricated valuations.** Without a model, valuations are explicitly unavailable, and
  `/api/predict` returns `503 model_unavailable`.
- **Leakage guard.** Model cards that use `zestimate`, `rent_zestimate`, `list_price`,
  `price_per_sqft` or `tax_assessed_value` as inputs are refused unless a documented exception is
  given. `/api/predict` rejects them as inputs too.
- **Metrics are never invented.** MAE/RMSE/R²/MAPE appear only when the model card provides them.
- **Intervals come only from the team.** Uncertainty ranges are shown only when supplied with
  their validated coverage.
- **SHAP-ready.** The details panel has a "Why this value?" slot for feature contributions.

Precedence when several sources exist: **batch prediction → real-time model → simulated (dev
flag only) → unavailable.**

---

## 7. Ask HomeScope (AI search)

Users can ask questions in plain English, either with the ✦ button next to the search bar or by
typing a question into the search box and choosing *Ask HomeScope AI*. Examples:

| Question | What happens |
|---|---|
| "Show me three-bedroom homes under $300k" | Filters applied to the map and list; top matches shown |
| "What are the cheapest homes in 77008?" | ZIP filter + price sort; cheapest listings shown |
| "Where are house prices generally lower?" | ZIP codes ranked by median listing price (clickable) |
| "What is the average house price in Katy?" | Mean, median, quartiles, $/sqft for Katy |
| "Why is this home estimated at $350k?" | Looks up the selected home's real valuation and any available explanation |
| "If I was broke, where should I live?" | Asks for budget and rent-vs-buy before suggesting anything |

**Setup:** put `OPENAI_API_KEY=sk-...` in `backend/.env` and restart the API. Without a key the
panel explains how to enable it; the rest of the app is unaffected.

**How it works:** `POST /api/assistant/chat` (in `backend/app/assistant/`) runs an OpenAI Responses
API tool-calling loop. The model never sees the raw dataset. It calls four data tools
(`search_properties`, `compare_areas`, `area_statistics`, `get_property`) that query the same
repository as the map, and the system prompt requires every number to come from a tool result.
Tool calls can return **actions** (apply filters/sort, select a home) that the frontend performs,
and **cards** (property lists, area tables, stats) rendered next to the reply. The same rules as
the rest of the app apply: listing prices are labelled as 2024 asking prices, Zestimates are
labelled third-party, and AI valuations are only reported when a model supplied them.

**Privacy and cost:** questions, plus the tool results needed to answer them, are sent to OpenAI.
The key stays on the server. Each question uses roughly 2–4 model calls.

## 8. API reference

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | App, dataset (source, counts, cleaning report) and model status |
| `GET /api/properties` | Map markers + summaries. Filters: `bbox=s,w,n,e`, `min_price`, `max_price`, `price_basis=list\|predicted`, `min_beds`, `min_baths`, `home_types=A,B`, `min_sqft`, `max_sqft`, `zipcode`, `city`, `limit`, `offset` |
| `GET /api/properties/meta` | Filter options (home types with counts, ranges, prediction availability) |
| `GET /api/properties/{id}` | Full property record with valuation status and third-party benchmarks |
| `GET /api/search?q=` | Dataset-backed search over street addresses, ZIP codes and cities |
| `GET /api/market/summary` | Descriptive statistics; the same filters + `bbox`; the response states its `scope` |
| `GET /api/model/metrics` | Model status, model card info, validation metrics, batch coverage |
| `POST /api/model/reload` | Re-read dataset, model bundle and predictions from disk |
| `GET /api/assistant/status` | Whether AI search is configured |
| `POST /api/assistant/chat` | Ask HomeScope: `{"messages": [...], "context": {"selected_property_id", "map_bbox", "filters"}}` |
| `POST /api/predict` | Real-time prediction: `{"property_id": "...", "attributes": {...overrides}}` |

Interactive docs and schemas: http://localhost:8000/docs.

**Data access** is behind `PropertyRepository` (`backend/app/services/repository.py`). To move to
PostgreSQL/PostGIS, implement that interface (bbox becomes `ST_MakeEnvelope`, filters become
`WHERE` clauses) and construct it in `services/container.py`. Routes stay unchanged.

---

## 9. Adding future modules

Add an entry in `frontend/src/modules/registry.ts`: set `status: 'active'` and point `page` at a
new component in `src/pages/`. Navigation and routing pick it up automatically. Backend routes go
in a new `backend/app/routes/<module>.py` included in `main.py`. Both can reuse the repository and
valuation services, since Deal Radar compares listing prices with batch predictions.

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| "Can't load properties" / "API offline" | Start the backend (`uvicorn app.main:app --reload --port 8000` in `backend/` with the venv active). The page reconnects automatically. |
| `Port 5173 is already in use` | Another Vite server is running. Stop it, or run `npx vite --port 5174` (also add that origin to `HOMESCOPE_CORS_ORIGINS` only if you bypass the proxy). |
| `Address already in use` on 8000 | Stop the other process, or use `--port 8001` and set `VITE_API_PROXY_TARGET=http://localhost:8001` in `frontend/.env.local`. |
| "Synthetic data" banner | The real dataset isn't in `data/raw/`; run `python scripts/fetch_dataset.py`. |
| Street address shows "unavailable" | `houston_listing_details.csv` is missing. Re-run `fetch_dataset.py` without `--skip-details`. |
| Kaggle download asks for credentials | Add `~/.kaggle/kaggle.json` (Kaggle → Settings → API → Create New Token). |
| Grey map / no tiles | Map tiles need internet access. Check `VITE_MAP_TILE_URL` if you changed it. |
| Model chip says "Model error" | Open the chip: it shows the exact load error (invalid card, missing library, leakage). Install the training library at the training version (`requirements-ml.txt`). |
| `ModuleNotFoundError: app` | Run uvicorn and scripts from inside `backend/`. |
| Windows: `Activate.ps1 cannot be loaded` | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use `cmd` and `.venv\Scripts\activate.bat`. |
| Ask HomeScope says "isn't configured" | Add `OPENAI_API_KEY` to `backend/.env` and restart uvicorn (`--reload` doesn't re-read `.env`). |
| Ask HomeScope: "model wasn't found" | Set `HOMESCOPE_OPENAI_MODEL` to a model your OpenAI account can use. |
| Python too old | Use Python 3.11+ (`py -3.12` on Windows, `brew install python@3.12` on macOS). |

---

## Data attribution

Property data: Houston Housing Market 2024 datasets on Kaggle (mohamedalmansop; datadetective08),
derived from Zillow listings. Map data © OpenStreetMap contributors. This is a hackathon prototype
and not financial or appraisal advice.
