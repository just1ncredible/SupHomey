"""Data access for properties.

Routes and services depend on the PropertyRepository interface only. The in-memory pandas
implementation is plenty for ~26k rows; a PostgreSQL/PostGIS implementation can replace it
later (bbox -> ST_MakeEnvelope, filters -> WHERE clauses) without touching the routes.
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from app.ml.batch import VALUATION_COLUMNS, BatchPredictions

BBox = tuple[float, float, float, float]  # south, west, north, east


@dataclass
class PropertyFilters:
    min_price: float | None = None
    max_price: float | None = None
    price_basis: str = "list"  # "list" | "predicted"
    min_beds: float | None = None
    min_baths: float | None = None
    home_types: list[str] = field(default_factory=list)
    min_sqft: float | None = None
    max_sqft: float | None = None
    zipcode: str | None = None
    city: str | None = None

    def is_active(self) -> bool:
        return any(
            v not in (None, [], "")
            for k, v in self.__dict__.items()
            if k != "price_basis"
        )


class PropertyRepository(ABC):
    @property
    @abstractmethod
    def total(self) -> int: ...

    @abstractmethod
    def query(self, filters: PropertyFilters, bbox: BBox | None = None) -> pd.DataFrame: ...

    @abstractmethod
    def get(self, property_id: str) -> pd.Series | None: ...

    @abstractmethod
    def all(self) -> pd.DataFrame: ...

    @abstractmethod
    def search(self, text: str, limit: int) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        """Return (properties, zip groups, city groups) matching free text."""


def _bounds(group: pd.DataFrame) -> tuple[float, float, float, float]:
    # Trim the outer 2% so a few mislabelled records don't stretch a ZIP across the metro.
    lo, hi = (0.02, 0.98) if len(group) >= 20 else (0.0, 1.0)
    lat, lon = group["latitude"], group["longitude"]
    return (float(lat.quantile(lo)), float(lon.quantile(lo)), float(lat.quantile(hi)), float(lon.quantile(hi)))


class PandasPropertyRepository(PropertyRepository):
    def __init__(self, frame: pd.DataFrame, valuations: BatchPredictions | None = None):
        df = frame.copy()
        df.index = pd.Index(df["id"].astype(str), name="property_id")
        if valuations is not None and not valuations.frame.empty:
            df = df.join(valuations.frame[VALUATION_COLUMNS], how="left")
            df["valuation_kind"] = np.where(df["predicted_price"].notna(), valuations.kind, None)
        else:
            for col in VALUATION_COLUMNS:
                df[col] = np.nan
            df["valuation_kind"] = None
        self._df = df
        self._address_lc = df["street_address"].fillna("").str.lower()
        self._city_lc = df["city"].fillna("").str.lower()

    @property
    def total(self) -> int:
        return len(self._df)

    def all(self) -> pd.DataFrame:
        return self._df

    def get(self, property_id: str) -> pd.Series | None:
        try:
            return self._df.loc[str(property_id)]
        except KeyError:
            return None

    def query(self, filters: PropertyFilters, bbox: BBox | None = None) -> pd.DataFrame:
        df = self._df
        mask = np.ones(len(df), dtype=bool)
        if bbox is not None:
            south, west, north, east = bbox
            mask &= df["latitude"].between(south, north).to_numpy()
            mask &= df["longitude"].between(west, east).to_numpy()
        price = df["predicted_price"] if filters.price_basis == "predicted" else df["list_price"]
        if filters.min_price is not None:
            mask &= (price >= filters.min_price).fillna(False).to_numpy()
        if filters.max_price is not None:
            mask &= (price <= filters.max_price).fillna(False).to_numpy()
        if filters.min_beds is not None:
            mask &= (df["bedrooms"] >= filters.min_beds).fillna(False).to_numpy()
        if filters.min_baths is not None:
            mask &= (df["bathrooms"] >= filters.min_baths).fillna(False).to_numpy()
        if filters.home_types:
            mask &= df["home_type"].isin(filters.home_types).fillna(False).to_numpy()
        if filters.min_sqft is not None:
            mask &= (df["living_area_sqft"] >= filters.min_sqft).fillna(False).to_numpy()
        if filters.max_sqft is not None:
            mask &= (df["living_area_sqft"] <= filters.max_sqft).fillna(False).to_numpy()
        if filters.zipcode:
            mask &= (df["zipcode"] == filters.zipcode).fillna(False).to_numpy()
        if filters.city:
            mask &= (self._city_lc == filters.city.lower()).to_numpy()
        return df[mask]

    def search(self, text: str, limit: int = 8) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        q = re.sub(r"\s+", " ", text.strip().lower())
        df = self._df
        empty = df.iloc[0:0]
        if not q:
            return empty, pd.DataFrame(), pd.DataFrame()

        # Properties: address prefix matches first, then substring matches.
        starts = self._address_lc.str.startswith(q)
        contains = self._address_lc.str.contains(q, regex=False) & ~starts
        props = pd.concat([df[starts], df[contains]]).head(limit)

        zips = pd.DataFrame()
        if re.fullmatch(r"\d{1,5}", q):
            zmatch = df[df["zipcode"].fillna("").str.startswith(q)]
            if not zmatch.empty:
                zips = pd.DataFrame(
                    [
                        {"zipcode": z, "count": len(g), "bounds": _bounds(g)}
                        for z, g in zmatch.groupby("zipcode", sort=True)
                    ]
                ).sort_values("count", ascending=False).head(5)

        cities = pd.DataFrame()
        if len(q) >= 2 and not q.isdigit():
            cmatch = df[self._city_lc.str.startswith(q)]
            if not cmatch.empty:
                cities = pd.DataFrame(
                    [
                        {"city": c, "count": len(g), "bounds": _bounds(g)}
                        for c, g in cmatch.groupby("city", sort=True)
                    ]
                ).sort_values("count", ascending=False).head(4)
        return props, zips, cities
