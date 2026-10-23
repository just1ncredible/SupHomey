# Model hand-off (for the ML team)

For the source behind the current LSTM predictions, see the
[original training script and workflow notes](training/README.md).

The app never trains anything. It shows valuations that **you** supply, in one of two ways.
Until one of them exists, the UI says *"AI valuation unavailable — model not connected."*

| | A. Batch predictions (simplest) | B. Real-time model bundle |
|---|---|---|
| You provide | `models/predictions/predictions.csv` | `models/current/` folder with `model_card.json` + model file |
| Shows on map, filters, stats | Yes | Detail panel + `POST /api/predict` (run `predict_batch.py` to also get A) |
| Enables what-if inputs | No | Yes |

After adding or replacing files, click **model status chip → Reload model & predictions**
(or `POST http://localhost:8000/api/model/reload`). No server restart needed.

## Property IDs

Every property's ID is its Zillow `zpid` from the Kaggle clean CSV (as a string). Join on that.

## A. Batch predictions

CSV (or JSON records) with one row per property:

```csv
property_id,predicted_price,predicted_low,predicted_high,interval_coverage,model_name,model_version,generated_at
305340899,438200,377000,509000,0.8,LightGBM log-price,1.0.0,2026-10-24T10:00:00Z
```

Only `property_id` and `predicted_price` (in **dollars**) are required. Include
`predicted_low/high` only if they come from validated residuals, and say how in `interval_coverage`.
`export_helpers.export_batch_predictions(...)` writes this format.

When a batch predictions file is loaded, only homes with a valid matching prediction appear
in the map, results, search and statistics. The source dataset is retained, and model coverage
is still measured against that full dataset. Without a batch file, all homes remain available.

## B. Real-time model bundle

```
models/current/
  model_card.json        # contract: see model_card.example.json
  model.joblib           # sklearn Pipeline, or XGB/LGBM/CatBoost sklearn wrapper (joblib)
  preprocessor.joblib    # optional, applied before the model
  features.py            # optional feature hook: def build_features(df) -> df
```

`export_helpers.export_model_bundle(...)` writes the folder for you. Things to get right:

- **`features`**: the exact columns and order the model was trained on. Each entry's `source` says
  where serving gets the value:
  - a canonical field: `bedrooms`, `bathrooms`, `living_area_sqft`, `lot_area_sqft` (sqft),
    `year_built`, `home_type`, `latitude`, `longitude`, `zipcode` (5-char string), `city`
  - a built-in engineered feature, `engineered:<name>`: `dist_downtown_mi`, `dist_tmc_mi`,
    `dist_galleria_mi`, `dist_energy_corridor_mi`, `dist_uh_mi`, `property_age`, `lot_area_acres`, `log_living_area`
  - `hook`: a column produced by your `feature_hook` file (e.g. school ratings, flood zone, KNN comps)
- **`target_transform`**: `log1p` if you trained on `np.log1p(price)`; the API inverts it.
- **`required: true`** on features the model can't do without; otherwise missing values arrive as NaN.
- **`metrics`**: only real validation numbers (MAE, RMSE, R², MAPE + how they were measured).
  Leave `null` otherwise; the UI hides the metrics section.
- **`interval`**: optional, from validation residual quantiles (`export_helpers.interval_from_residuals`).
- **Leakage**: `zestimate`, `rent_zestimate`, `list_price`, `price_per_sqft`, `tax_assessed_value`
  are rejected as inputs. If you truly need one, add a `leakage_exceptions` entry with a justification.

Data-cleaning facts that matter for consistent preprocessing (the API applies these before features):

- Bedrooms, bathrooms, living area and lot size that the clean CSV *imputed* (absent in the original
  listing) are null, as are LOT parcels' zero beds/baths/area and the `2001.5` placeholder year.
- `has_zestimate = 0` rows carry a filler Zestimate (376,400); it is nulled.
- Lot size is converted to square feet using the original listing's unit (acres × 43,560).

If your training used the raw clean CSV values instead, either retrain on the cleaned table
(`app.data.ingest.ingest(...)` returns it) or reproduce your preprocessing in a feature hook.

Validate a bundle and generate batch predictions from it:

```bash
cd backend
python scripts/predict_batch.py            # load + sanity-check models/current
python scripts/predict_batch.py --write    # also write models/predictions/predictions.csv
```

Native XGBoost/LightGBM/CatBoost files need their library installed in the backend venv at the
same version used for training (see `backend/requirements-ml.txt`).
