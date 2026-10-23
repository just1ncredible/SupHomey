"""Load, validate and normalise Houston property records into one canonical table.

Input: the Kaggle "Houston Housing Market 2024 — Clean Dataset" CSV, plus an optional
listing-details extract (street address, lot units, tax value) keyed by zpid.

Output: a pandas DataFrame using the canonical snake_case columns in CANONICAL_COLUMNS.
Anything the source data set to a placeholder (e.g. median-imputed Zestimates) is set
to null here, so downstream code never mistakes a filler value for an observation.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd

SQFT_PER_ACRE = 43_560.0

# Generous Greater Houston bounding box (Galveston → Conroe, Brookshire → Baytown and beyond).
HOUSTON_BOUNDS = {"lat_min": 28.8, "lat_max": 30.9, "lon_min": -96.7, "lon_max": -94.3}

# Without an explicit unit, Zillow lot values below this are acres (a 100 sqft lot is not plausible).
ACRES_INFERENCE_THRESHOLD = 100.0

CANONICAL_COLUMNS = [
    "id",
    "zpid",
    "street_address",
    "city",
    "state",
    "zipcode",
    "latitude",
    "longitude",
    "home_type",
    "bedrooms",
    "bathrooms",
    "living_area_sqft",
    "lot_area_sqft",
    "lot_area_source",
    "year_built",
    "list_price",
    "days_on_market",
    "zestimate",
    "rent_zestimate",
    "tax_assessed_value",
]

# Normalised source column name (lowercase, alphanumerics only) -> canonical name.
COLUMN_ALIASES = {
    "zpid": "zpid",
    "id": "source_id",
    "price": "list_price",
    "listprice": "list_price",
    "unformattedprice": "list_price",
    "bedrooms": "bedrooms",
    "beds": "bedrooms",
    "bathrooms": "bathrooms",
    "baths": "bathrooms",
    "livingarea": "living_area_sqft",
    "sqft": "living_area_sqft",
    "area": "living_area_sqft",
    "lotareavalue": "lot_area_value",
    "lotareaunits": "lot_area_unit",
    "lotareaunit": "lot_area_unit",
    "hometype": "home_type",
    "yearbuilt": "year_built",
    "latitude": "latitude",
    "lat": "latitude",
    "longitude": "longitude",
    "lon": "longitude",
    "lng": "longitude",
    "streetaddress": "street_address",
    "addressstreet": "street_address",
    "city": "city",
    "state": "state",
    "zipcode": "zipcode",
    "zip": "zipcode",
    "zestimate": "zestimate",
    "rentzestimate": "rent_zestimate",
    "haszestimate": "has_zestimate",
    "hasrentzestimate": "has_rent_zestimate",
    "daysonzillow": "days_on_market",
    "taxassessedvalue": "tax_assessed_value",
}

REQUIRED_COLUMNS = ("latitude", "longitude")

NUMERIC_COLUMNS = (
    "zpid",
    "list_price",
    "bedrooms",
    "bathrooms",
    "living_area_sqft",
    "lot_area_value",
    "year_built",
    "latitude",
    "longitude",
    "zestimate",
    "rent_zestimate",
    "has_zestimate",
    "has_rent_zestimate",
    "days_on_market",
    "tax_assessed_value",
)

DatasetSource = Literal["kaggle_houston_2024", "synthetic_fixture"]


class IngestionError(ValueError):
    """The input file cannot be turned into a usable property table."""


@dataclass
class IngestionReport:
    source_file: str
    rows_read: int = 0
    rows_loaded: int = 0
    dropped_invalid_coordinates: int = 0
    dropped_duplicate_ids: int = 0
    dropped_duplicate_records: int = 0
    nulled_placeholder_values: dict[str, int] = field(default_factory=dict)
    lot_units: dict[str, int] = field(default_factory=dict)
    details_joined: int = 0
    details_file: str | None = None
    warnings: list[str] = field(default_factory=list)


def _normalise_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def normalise_columns(df: pd.DataFrame) -> pd.DataFrame:
    renamed = {}
    for col in df.columns:
        canonical = COLUMN_ALIASES.get(_normalise_name(str(col)))
        if canonical and canonical not in renamed.values():
            renamed[col] = canonical
    return df.rename(columns=renamed)[list(renamed.values())]


def normalise_zipcode(series: pd.Series) -> pd.Series:
    """Keep ZIP codes as 5-character strings ('77044'), tolerating ints, floats and ZIP+4."""

    def one(value: object) -> str | None:
        if value is None or (isinstance(value, float) and np.isnan(value)):
            return None
        text = str(value).strip()
        if re.fullmatch(r"\d+\.0+", text):
            text = text.split(".")[0]
        digits = re.match(r"^(\d{3,5})", text)
        return digits.group(1).zfill(5) if digits else None

    return series.map(one).astype("string")


def stable_id(row: pd.Series) -> str:
    """Deterministic ID for records without a zpid, so IDs survive reloads."""
    key = "|".join(
        str(row.get(c, "")) for c in ("street_address", "zipcode", "latitude", "longitude")
    )
    return "h" + hashlib.sha1(key.encode()).hexdigest()[:12]


def _null_where(df: pd.DataFrame, column: str, mask: pd.Series, report: IngestionReport, reason: str) -> None:
    if column not in df:
        return
    mask = mask & df[column].notna()
    count = int(mask.sum())
    if count:
        df.loc[mask, column] = np.nan
        report.nulled_placeholder_values[f"{column}: {reason}"] = count


def load_details(path: Path) -> pd.DataFrame:
    details = pd.read_csv(path, dtype={"zpid": "Int64"})
    details = details.drop_duplicates("zpid").set_index("zpid")
    return details


def ingest(clean_csv: Path, details_csv: Path | None = None) -> tuple[pd.DataFrame, IngestionReport]:
    report = IngestionReport(source_file=str(clean_csv))
    raw = pd.read_csv(clean_csv, dtype=str, keep_default_na=True)
    report.rows_read = len(raw)

    df = normalise_columns(raw)
    missing = [c for c in REQUIRED_COLUMNS if c not in df]
    if missing:
        raise IngestionError(f"{clean_csv.name} is missing required column(s): {', '.join(missing)}")
    if "list_price" not in df:
        report.warnings.append("No price column found; listing prices will be unavailable.")

    for col in NUMERIC_COLUMNS:
        if col in df:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    for col in CANONICAL_COLUMNS + ["lot_area_value", "lot_area_unit"]:
        if col not in df:
            df[col] = np.nan if col in NUMERIC_COLUMNS else pd.Series(pd.NA, index=df.index, dtype="object")
    df["lot_area_unit"] = df["lot_area_unit"].astype("object")
    df["zpid"] = df["zpid"].round().astype("Int64")

    # --- Optional enrichment: real street addresses, lot units, tax values (joined on zpid).
    if details_csv is not None and details_csv.exists():
        details = load_details(details_csv)
        report.details_file = str(details_csv)
        matched = df["zpid"].isin(details.index)
        report.details_joined = int(matched.sum())
        d = details.reindex(df["zpid"]).reset_index(drop=True)
        d.index = df.index
        for col in ("street_address", "state"):
            if col in d:
                df[col] = df[col].where(df[col].notna(), d[col])
        if "tax_assessed_value" in d:
            df["tax_assessed_value"] = pd.to_numeric(d["tax_assessed_value"], errors="coerce")
        # The clean CSV filled missing values with per-home-type medians. Where the original
        # listing had no value, null it again instead of displaying the filler.
        for col in ("bedrooms", "bathrooms", "living_area_sqft"):
            if col in d:
                _null_where(df, col, matched & d[col].isna(), report, "imputed in source (absent from original listing)")
        if "lot_area_value" in d:
            # The original listing's lot value + unit is authoritative; the clean CSV dropped the unit.
            _null_where(df, "lot_area_value", matched & d["lot_area_value"].isna(), report, "imputed in source (absent from original listing)")
            df.loc[matched, "lot_area_value"] = pd.to_numeric(d.loc[matched, "lot_area_value"], errors="coerce")
            df.loc[matched, "lot_area_unit"] = d.loc[matched, "lot_area_unit"]

    # --- Field normalisation.
    df["zipcode"] = normalise_zipcode(df["zipcode"])
    for col in ("street_address", "city", "state"):
        df[col] = df[col].astype("string").str.strip().replace("", pd.NA)
    df["city"] = df["city"].str.title()
    df["state"] = df["state"].str.upper()
    df["home_type"] = (
        df["home_type"].astype("string").str.strip().str.upper().str.replace(r"[\s-]+", "_", regex=True)
    )

    # --- Coordinates: drop anything missing or outside Greater Houston.
    b = HOUSTON_BOUNDS
    valid = (
        df["latitude"].between(b["lat_min"], b["lat_max"])
        & df["longitude"].between(b["lon_min"], b["lon_max"])
    )
    report.dropped_invalid_coordinates = int((~valid).sum())
    df = df[valid].copy()

    # --- Placeholder / impossible values -> null.
    if "has_zestimate" in df:
        _null_where(df, "zestimate", df["has_zestimate"] == 0, report, "placeholder (has_zestimate = 0)")
    if "has_rent_zestimate" in df:
        _null_where(df, "rent_zestimate", df["has_rent_zestimate"] == 0, report, "placeholder (has_rent_zestimate = 0)")
    is_lot = df["home_type"] == "LOT"
    for col in ("bedrooms", "bathrooms", "living_area_sqft"):
        _null_where(df, col, is_lot & (df[col] <= 0), report, "zero on vacant land")
        _null_where(df, col, df[col] < 0, report, "negative")
    _null_where(df, "living_area_sqft", df["living_area_sqft"] <= 0, report, "non-positive")
    _null_where(df, "year_built", df["year_built"] % 1 != 0, report, "fractional (imputed)")
    _null_where(df, "year_built", ~df["year_built"].between(1800, 2030), report, "out of range")
    _null_where(df, "list_price", df["list_price"] <= 0, report, "non-positive")
    _null_where(df, "tax_assessed_value", df["tax_assessed_value"] <= 0, report, "non-positive")

    # --- Lot size: convert everything to square feet and record how the unit was determined.
    unit = df["lot_area_unit"].astype("string").str.lower().str.strip()
    value = df["lot_area_value"].where(df["lot_area_value"] > 0)
    explicit_acres = unit.isin(["acres", "acre", "ac"]).fillna(False)
    explicit_sqft = unit.isin(["sqft", "sq ft", "square feet"]).fillna(False)
    inferred_acres = ~explicit_acres & ~explicit_sqft & (value < ACRES_INFERENCE_THRESHOLD)
    df["lot_area_sqft"] = np.where(explicit_acres | inferred_acres, value * SQFT_PER_ACRE, value)
    df["lot_area_source"] = pd.Series(pd.NA, index=df.index, dtype="string")
    df.loc[value.notna() & explicit_sqft, "lot_area_source"] = "reported_sqft"
    df.loc[value.notna() & explicit_acres, "lot_area_source"] = "converted_from_acres"
    df.loc[value.notna() & inferred_acres, "lot_area_source"] = "inferred_acres"
    df.loc[value.notna() & ~explicit_acres & ~explicit_sqft & ~inferred_acres, "lot_area_source"] = "inferred_sqft"
    df.loc[df["lot_area_sqft"].isna(), "lot_area_source"] = pd.NA
    report.lot_units = {k: int(v) for k, v in df["lot_area_source"].value_counts().items()}
    if report.lot_units.get("inferred_acres"):
        report.warnings.append(
            "Lot units were inferred for some rows (no unit column): values < 100 treated as acres. "
            "Run scripts/fetch_dataset.py to add the listing-details extract with explicit units."
        )

    # --- Stable IDs and de-duplication.
    df["id"] = df["zpid"].astype("string")
    no_zpid = df["id"].isna()
    if no_zpid.any():
        df.loc[no_zpid, "id"] = df[no_zpid].apply(stable_id, axis=1)
    before = len(df)
    df = df.drop_duplicates("id", keep="first")
    report.dropped_duplicate_ids = before - len(df)
    before = len(df)
    df = df.drop_duplicates(
        ["latitude", "longitude", "list_price", "bedrooms", "bathrooms", "living_area_sqft", "home_type", "street_address"],
        keep="first",
    )
    report.dropped_duplicate_records = before - len(df)

    df["year_built"] = df["year_built"].round().astype("Int64")
    df["days_on_market"] = df["days_on_market"].round().astype("Int64")

    df = df[CANONICAL_COLUMNS].reset_index(drop=True)
    report.rows_loaded = len(df)
    if report.rows_loaded == 0:
        raise IngestionError(f"No valid property rows found in {clean_csv.name}")
    return df, report
