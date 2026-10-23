"""Build the model's input frame from property records, following the model card.

Built-in engineered features live in ENGINEERED_FEATURES. To add one, write a function that
takes the canonical property frame and returns a Series, and register it with @engineered.
Anything more bespoke can ship inside the model bundle as a feature hook (see model_card.py).
"""

from __future__ import annotations

import importlib.util
from collections.abc import Callable
from pathlib import Path

import numpy as np
import pandas as pd

from app.ml.model_card import FeatureSpec, ModelCard

EngineeredFn = Callable[[pd.DataFrame], pd.Series]
ENGINEERED_FEATURES: dict[str, EngineeredFn] = {}

# Job-centre coordinates from the hackathon brief.
HOUSTON_HUBS = {
    "downtown": (29.7604, -95.3698),
    "tmc": (29.7079, -95.3978),
    "galleria": (29.7399, -95.4617),
    "energy_corridor": (29.7848, -95.6265),
    "uh": (29.7199, -95.3422),
}


def engineered(name: str) -> Callable[[EngineeredFn], EngineeredFn]:
    def register(fn: EngineeredFn) -> EngineeredFn:
        ENGINEERED_FEATURES[name] = fn
        return fn

    return register


def haversine_miles(lat: pd.Series, lon: pd.Series, lat0: float, lon0: float) -> pd.Series:
    lat1, lon1, lat2, lon2 = map(np.radians, (lat.astype(float), lon.astype(float), lat0, lon0))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 3958.8 * 2 * np.arcsin(np.sqrt(a))


for _hub, (_lat, _lon) in HOUSTON_HUBS.items():
    engineered(f"dist_{_hub}_mi")(
        lambda df, lat0=_lat, lon0=_lon: haversine_miles(df["latitude"], df["longitude"], lat0, lon0)
    )


@engineered("property_age")
def _property_age(df: pd.DataFrame) -> pd.Series:
    return 2024 - pd.to_numeric(df["year_built"], errors="coerce")


@engineered("lot_area_acres")
def _lot_acres(df: pd.DataFrame) -> pd.Series:
    return pd.to_numeric(df["lot_area_sqft"], errors="coerce") / 43_560.0


@engineered("log_living_area")
def _log_living(df: pd.DataFrame) -> pd.Series:
    return np.log1p(pd.to_numeric(df["living_area_sqft"], errors="coerce"))


def load_feature_hook(bundle_dir: Path, filename: str) -> Callable[[pd.DataFrame], pd.DataFrame]:
    path = bundle_dir / filename
    spec = importlib.util.spec_from_file_location(f"homescope_feature_hook_{path.stem}", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot import feature hook {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if not hasattr(module, "build_features"):
        raise ImportError(f"{path.name} must define build_features(df) -> DataFrame")
    return module.build_features


def _cast(series: pd.Series, spec: FeatureSpec) -> pd.Series:
    if spec.default is not None:
        series = series.where(series.notna(), spec.default)
    if spec.dtype in ("float", "int"):
        # Keep ints as float so NaN survives; tree models and sklearn imputers handle NaN.
        return pd.to_numeric(series, errors="coerce").astype(float)
    if spec.dtype == "bool":
        return series.astype("boolean").astype(float)
    text = series.astype("string")
    return text.astype("category") if spec.dtype == "category" else text.astype(object).where(text.notna(), None)


def build_feature_frame(
    properties: pd.DataFrame,
    card: ModelCard,
    hook: Callable[[pd.DataFrame], pd.DataFrame] | None = None,
) -> tuple[pd.DataFrame, dict[int, list[str]]]:
    """Return (X, missing_required) where X has exactly the card's columns in the card's order."""
    base = properties.reset_index(drop=True)
    hooked = hook(base.copy()) if hook else None
    columns: dict[str, pd.Series] = {}
    for spec in card.features:
        source = spec.resolved_source
        if source.startswith("engineered:"):
            fn = ENGINEERED_FEATURES.get(source.split(":", 1)[1])
            if fn is None:
                raise KeyError(f"Unknown engineered feature '{source}'. Known: {sorted(ENGINEERED_FEATURES)}")
            values = fn(base)
        elif source == "hook":
            if hooked is None or spec.name not in hooked:
                raise KeyError(f"Feature '{spec.name}' expects the feature hook to produce it.")
            values = hooked[spec.name]
        elif source in base:
            values = base[source]
        else:
            values = pd.Series([np.nan] * len(base))
        columns[spec.name] = _cast(pd.Series(values).reset_index(drop=True), spec)

    X = pd.DataFrame(columns)
    missing: dict[int, list[str]] = {}
    for spec in card.features:
        if spec.required:
            for i in np.flatnonzero(X[spec.name].isna().to_numpy()):
                missing.setdefault(int(i), []).append(spec.name)
    return X, missing
