"""Descriptive statistics over a set of listings (dataset, filtered set, or map viewport)."""

from __future__ import annotations

import pandas as pd

from app.schemas.market import CountItem, MarketSummary, PriceBucket, StatsScope

PRICE_BUCKETS = [
    (None, 200_000, "< $200K"),
    (200_000, 300_000, "$200–300K"),
    (300_000, 400_000, "$300–400K"),
    (400_000, 500_000, "$400–500K"),
    (500_000, 750_000, "$500–750K"),
    (750_000, 1_000_000, "$750K–1M"),
    (1_000_000, 2_000_000, "$1–2M"),
    (2_000_000, None, "$2M+"),
]

NOTE = (
    "Descriptive of the 2024 Zillow listing sample in this dataset (asking prices, not sales). "
    "Not a complete picture of the Houston market."
)


def _median(series: pd.Series) -> float | None:
    s = series.dropna()
    return round(float(s.median()), 2) if len(s) else None


def summarize(subset: pd.DataFrame, dataset_total: int, scope: StatsScope) -> MarketSummary:
    price = subset["list_price"]
    has_area = (subset["living_area_sqft"] > 0).fillna(False)
    ppsf = (price / subset["living_area_sqft"]).where(has_area & (subset["home_type"] != "LOT").fillna(True))

    predicted = subset["predicted_price"].dropna()
    kinds = subset.loc[predicted.index, "valuation_kind"].dropna().unique().tolist()
    predicted_kind = "simulated" if "simulated" in kinds else ("batch" if kinds else None)

    buckets = []
    for lo, hi, label in PRICE_BUCKETS:
        m = price.notna()
        if lo is not None:
            m &= price >= lo
        if hi is not None:
            m &= price < hi
        buckets.append(PriceBucket(label=label, min=lo, max=hi, count=int(m.sum())))

    types = subset["home_type"].fillna("UNKNOWN").value_counts()
    return MarketSummary(
        scope=scope,
        count=len(subset),
        dataset_total=dataset_total,
        median_list_price=_median(price),
        median_list_price_per_sqft=_median(ppsf),
        avg_living_area_sqft=round(float(subset.loc[has_area, "living_area_sqft"].mean()), 1) if has_area.any() else None,
        median_predicted_price=_median(predicted),
        predicted_count=len(predicted),
        predicted_kind=predicted_kind,
        home_types=[CountItem(label=str(k), count=int(v)) for k, v in types.items()],
        list_price_distribution=buckets,
        note=NOTE,
    )
