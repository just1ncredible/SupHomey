"""Helpers for the ML team: export a trained model (or its predictions) in the format the
HomeScope API loads. Standalone: copy this file next to your notebook (works
in Colab too). Requires pandas, numpy and joblib.

    from export_helpers import export_model_bundle, export_batch_predictions, interval_from_residuals

Typical use at the end of training:

    interval = interval_from_residuals(y_val_log, model.predict(X_val), coverage=0.8, log_space=True)
    export_model_bundle(
        pipeline,                          # fitted sklearn Pipeline / XGBRegressor / LGBMRegressor / CatBoostRegressor
        features=[                         # EXACT training columns, in order
            "bedrooms", "bathrooms", "living_area_sqft", "year_built",
            {"name": "home_type", "dtype": "string"},
            {"name": "latitude", "required": True}, {"name": "longitude", "required": True},
            {"name": "dist_downtown_mi", "source": "engineered:dist_downtown_mi"},
        ],
        out_dir="models/current",
        name="LightGBM log-price", version="1.0.0",
        target_transform="log1p",          # if you trained on np.log1p(price)
        metrics={"mae": 52000, "rmse": 91000, "r2": 0.81, "evaluation": "20% holdout", "n_validation": 5100},
        interval=interval,
        training_data={"source": "Kaggle Houston 2024 clean", "period": "2024 listings", "rows": 20700},
    )

Then click "Reload model & predictions" in the app (model status chip), or POST /api/model/reload.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import joblib
import numpy as np
import pandas as pd

# Canonical property fields the API can feed to a model (see backend/app/services/valuation.py).
# Use these as feature `source` values, or rename your training columns to match them.
CANONICAL_FIELDS = [
    "bedrooms",
    "bathrooms",
    "living_area_sqft",   # clean CSV: livingArea
    "lot_area_sqft",      # clean CSV: lotAreaValue, converted to sqft using lotAreaUnit
    "year_built",         # clean CSV: yearBuilt
    "home_type",          # SINGLE_FAMILY, TOWNHOUSE, CONDO, MULTI_FAMILY, MANUFACTURED, LOT
    "latitude",
    "longitude",
    "zipcode",            # 5-character string, e.g. "77008"
    "city",
]
# Built-in engineered features: use source "engineered:<name>".
ENGINEERED_FEATURES = [
    "dist_downtown_mi", "dist_tmc_mi", "dist_galleria_mi", "dist_energy_corridor_mi", "dist_uh_mi",
    "property_age", "lot_area_acres", "log_living_area",
]
# Never use these as inputs (target leakage). The API refuses model cards that do.
LEAKAGE_FIELDS = ["list_price", "price", "zestimate", "rent_zestimate", "price_per_sqft", "tax_assessed_value"]


def interval_from_residuals(y_true: Iterable[float], y_pred: Iterable[float], coverage: float = 0.8, log_space: bool = True) -> dict[str, Any]:
    """Prediction interval from VALIDATION residuals (never training residuals).

    log_space=True: pass log-scale targets/predictions (e.g. np.log1p(price)); the interval is
    multiplicative. log_space=False: pass dollar values; the interval is relative (pred * (1 + q)).
    """
    y_true, y_pred = np.asarray(list(y_true), float), np.asarray(list(y_pred), float)
    residual = (y_true - y_pred) if log_space else (y_true - y_pred) / y_pred
    tail = (1 - coverage) / 2
    lower, upper = np.quantile(residual, [tail, 1 - tail])
    return {
        "method": "log_residual_quantiles" if log_space else "relative_residual_quantiles",
        "lower": float(lower),
        "upper": float(upper),
        "coverage": float(coverage),
        "description": f"{int(coverage * 100)}% empirical interval from {len(residual)} validation residuals",
    }


def export_model_bundle(
    model: Any,
    features: list[str | dict[str, Any]],
    out_dir: str | Path,
    name: str,
    version: str,
    framework: str = "sklearn",
    target_transform: str = "none",
    metrics: dict[str, Any] | None = None,
    interval: dict[str, Any] | None = None,
    training_data: dict[str, Any] | None = None,
    preprocessor: Any = None,
    notes: str | None = None,
) -> Path:
    """Write model.joblib (+ preprocessor.joblib) and model_card.json into out_dir.

    framework="sklearn" covers sklearn Pipelines and the sklearn wrappers of XGBoost, LightGBM
    and CatBoost (pickled with joblib). For native formats, save the model yourself
    (model.save_model(...)) and set framework / artifact in the card accordingly.
    """
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    specs = [{"name": f} if isinstance(f, str) else dict(f) for f in features]
    leaking = [s["name"] for s in specs if s.get("source", s["name"]) in LEAKAGE_FIELDS]
    if leaking:
        raise ValueError(f"Leakage-prone features {leaking} cannot be model inputs.")

    card: dict[str, Any] = {
        "name": name,
        "version": version,
        "framework": framework,
        "artifact": "model.joblib",
        "target": "list_price",
        "target_transform": target_transform,
        "features": specs,
        "metrics": metrics,
        "interval": interval,
        "training_data": training_data,
        "trained_at": date.today().isoformat(),
        "notes": notes,
    }
    joblib.dump(model, out / "model.joblib")
    if preprocessor is not None:
        joblib.dump(preprocessor, out / "preprocessor.joblib")
        card["preprocessor"] = "preprocessor.joblib"
    (out / "model_card.json").write_text(json.dumps(card, indent=2, default=float))
    print(f"Model bundle written to {out.resolve()}")
    return out


def export_batch_predictions(
    property_ids: Iterable[Any],
    predicted_price: Iterable[float],
    out_path: str | Path = "models/predictions/predictions.csv",
    model_name: str | None = None,
    model_version: str | None = None,
    predicted_low: Iterable[float] | None = None,
    predicted_high: Iterable[float] | None = None,
    interval_coverage: float | None = None,
) -> Path:
    """Write precomputed predictions. property_ids are the dataset's zpid values (the API's `id`).

    Predictions are in DOLLARS: undo any log transform before exporting.
    """
    df = pd.DataFrame({"property_id": [str(int(i)) if isinstance(i, (int, float, np.integer)) else str(i) for i in property_ids]})
    df["predicted_price"] = np.round(np.asarray(list(predicted_price), float), 0)
    if predicted_low is not None and predicted_high is not None:
        df["predicted_low"] = np.round(np.asarray(list(predicted_low), float), 0)
        df["predicted_high"] = np.round(np.asarray(list(predicted_high), float), 0)
        df["interval_coverage"] = interval_coverage
    df["model_name"] = model_name
    df["model_version"] = model_version
    df["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)
    print(f"{len(df):,} predictions written to {out.resolve()}")
    return out
