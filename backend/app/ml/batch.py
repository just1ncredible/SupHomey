"""Precomputed (batch) predictions, joined to properties by stable property ID.

Expected file (CSV or JSON records), one row per property:

    property_id,predicted_price[,predicted_low,predicted_high,interval_coverage,model_name,model_version,generated_at]

`property_id` is the `id` served by this API (the Zillow zpid for the Kaggle data).
`zpid` or `id` are accepted as aliases for property_id. `interval_coverage` (e.g. 0.8) states the
validated coverage of [predicted_low, predicted_high]; omit the interval columns if you have none.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

ValuationKind = Literal["batch", "simulated"]
VALUATION_COLUMNS = ["predicted_price", "predicted_low", "predicted_high", "interval_coverage", "model_name", "model_version"]


@dataclass
class BatchPredictions:
    kind: ValuationKind
    frame: pd.DataFrame  # indexed by property id, columns = VALUATION_COLUMNS
    source_file: str | None
    rows_in_file: int = 0
    matched: int = 0
    loaded_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat(timespec="seconds"))
    generated_at: str | None = None
    warnings: list[str] = field(default_factory=list)


def load_batch_predictions(path: Path, property_ids: pd.Index) -> BatchPredictions:
    raw = pd.read_json(path) if path.suffix.lower() == ".json" else pd.read_csv(path, dtype={"property_id": str, "zpid": str, "id": str})
    rename = {}
    for alias in ("property_id", "zpid", "id"):
        if alias in raw:
            rename[alias] = "property_id"
            break
    raw = raw.rename(columns=rename)
    if "property_id" not in raw or "predicted_price" not in raw:
        raise ValueError(f"{path.name} needs columns property_id and predicted_price")

    df = raw.copy()
    df["property_id"] = df["property_id"].astype(str).str.replace(r"\.0$", "", regex=True).str.strip()
    for col in ("predicted_price", "predicted_low", "predicted_high", "interval_coverage"):
        df[col] = pd.to_numeric(df[col], errors="coerce") if col in df else np.nan
    for col in ("model_name", "model_version"):
        df[col] = df[col].astype("string") if col in df else pd.NA

    result = BatchPredictions(kind="batch", frame=pd.DataFrame(), source_file=str(path), rows_in_file=len(df))
    invalid = ~(df["predicted_price"] > 0)
    if invalid.any():
        result.warnings.append(f"{int(invalid.sum())} rows skipped: predicted_price missing or not positive.")
    df = df[~invalid]
    bad_interval = (df["predicted_low"] > df["predicted_price"]) | (df["predicted_high"] < df["predicted_price"])
    if bad_interval.any():
        result.warnings.append(f"{int(bad_interval.sum())} intervals ignored: they do not contain the prediction.")
        df.loc[bad_interval, ["predicted_low", "predicted_high"]] = np.nan
    dupes = df["property_id"].duplicated(keep="last")
    if dupes.any():
        result.warnings.append(f"{int(dupes.sum())} duplicate property_id rows; kept the last one.")
    df = df[~dupes].set_index("property_id")

    known = df.index.isin(property_ids)
    if (~known).any():
        result.warnings.append(f"{int((~known).sum())} predictions reference IDs not in the loaded dataset.")
    result.frame = df.loc[known, VALUATION_COLUMNS]
    result.matched = int(known.sum())
    if "generated_at" in raw and raw["generated_at"].notna().any():
        result.generated_at = str(raw["generated_at"].dropna().iloc[0])
    return result


def simulate_predictions(properties: pd.DataFrame) -> BatchPredictions:
    """DEVELOPMENT ONLY. Fake valuations so the UI can be exercised before a model exists.

    Values are the listing price scaled by a deterministic random factor. They carry
    kind="simulated" end to end and the UI labels them "Simulated — UI Preview".
    """
    ids = properties["id"].astype(str)
    seeds = pd.util.hash_pandas_object(ids, index=False).to_numpy() % (2**32)
    factors = np.array([np.random.default_rng(int(s)).normal(1.0, 0.08) for s in seeds])
    price = properties["list_price"].to_numpy(dtype=float)
    frame = pd.DataFrame(
        {
            "predicted_price": np.round(price * factors, -3),
            "predicted_low": np.nan,
            "predicted_high": np.nan,
            "interval_coverage": np.nan,
            "model_name": "Simulated preview (not a model)",
            "model_version": "simulated",
        },
        index=pd.Index(ids.to_numpy(), name="property_id"),
    )
    frame = frame[frame["predicted_price"] > 0]
    return BatchPredictions(kind="simulated", frame=frame, source_file=None, rows_in_file=len(frame), matched=len(frame))
