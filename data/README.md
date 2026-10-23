# Data

- `raw/` — the real Houston Housing Market 2024 data. Not committed; fetch with
  `python backend/scripts/fetch_dataset.py` (run from `backend/` with the venv active).
  - `houston_housing_2024_clean.csv` — Kaggle `mohamedalmansop/houston-housing-market-2024-clean-dataset`
  - `houston_listing_details.csv` — zpid-keyed extract (street address, lot unit, tax value, original
    bed/bath/area) from Kaggle `datadetective08/houston-housing-market-2024` (light JSON)
- `fixtures/synthetic_properties.csv` — **synthetic** development data (fabricated addresses on
  "Fixture Ln"). Used only when `raw/` is empty; the UI then shows a "Synthetic data" warning.
  Regenerate with `python backend/scripts/generate_fixture.py`.

The records are a 2024 Zillow listing snapshot: prices are asking prices, not sales, and the
homes are not necessarily for sale today.
