"""Convert pandas rows to JSON-safe Python values (NaN/NA -> None, numpy -> builtins)."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def clean(value: Any) -> Any:
    if value is None or value is pd.NA:
        return None
    if isinstance(value, float) and np.isnan(value):
        return None
    if isinstance(value, np.generic):
        value = value.item()
        if isinstance(value, float) and np.isnan(value):
            return None
    return value


def marker_records(df: pd.DataFrame) -> list[dict[str, Any]]:
    cols = {
        "id": df["id"],
        "lat": df["latitude"],
        "lng": df["longitude"],
        "list_price": df["list_price"],
        "predicted_price": df["predicted_price"],
        "valuation_kind": df["valuation_kind"],
        "bedrooms": df["bedrooms"],
        "bathrooms": df["bathrooms"],
        "living_area_sqft": df["living_area_sqft"],
        "home_type": df["home_type"],
        "street_address": df["street_address"],
        "city": df["city"],
        "zipcode": df["zipcode"],
    }
    out = pd.DataFrame(cols).astype(object)
    out = out.where(pd.notna(out), None)
    return out.to_dict(orient="records")
