"""Data tools the AI assistant can call. Every number the assistant states comes from here.

Each tool returns a ToolResult: a compact JSON payload for the model, plus optional UI
actions (update the map) and cards (structured results rendered by the frontend).
"""

from __future__ import annotations

import difflib
import json
from dataclasses import dataclass, field
from typing import Any, Callable

import numpy as np
import pandas as pd

from app.schemas.assistant import (
    AreaRow,
    AreaTableCard,
    AssistantContext,
    MapFilters,
    PropertiesCard,
    SelectPropertyAction,
    SetFiltersAction,
    StatsCard,
)
from app.schemas.property import PropertyMarker
from app.services.container import Services
from app.services.repository import PropertyFilters
from app.services.serialize import clean, marker_records

HOME_TYPES = ["SINGLE_FAMILY", "TOWNHOUSE", "CONDO", "MULTI_FAMILY", "MANUFACTURED", "LOT"]


@dataclass
class ToolResult:
    data: dict[str, Any]
    actions: list = field(default_factory=list)
    cards: list = field(default_factory=list)


# ---------------------------------------------------------------- JSON schemas (strict mode)

def _nullable(kind: str, description: str) -> dict[str, Any]:
    return {"type": [kind, "null"], "description": description}


FILTERS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "description": "Property filters. Use null for anything the user did not specify.",
    "properties": {
        "min_price": _nullable("number", "Minimum price in USD"),
        "max_price": _nullable("number", "Maximum price in USD ('under $300k' -> 300000)"),
        "price_basis": {
            "type": "string",
            "enum": ["list", "predicted"],
            "description": "'list' = 2024 listing price (default). 'predicted' only if AI predictions are loaded.",
        },
        "min_beds": _nullable("number", "Minimum bedrooms ('three-bedroom' -> 3)"),
        "min_baths": _nullable("number", "Minimum bathrooms"),
        "home_types": {
            "type": "array",
            "items": {"type": "string", "enum": HOME_TYPES},
            "description": "Empty = all types. 'homes'/'houses' usually means exclude LOT (vacant land).",
        },
        "min_sqft": _nullable("number", "Minimum living area (sq ft)"),
        "max_sqft": _nullable("number", "Maximum living area (sq ft)"),
        "zipcode": _nullable("string", "5-digit ZIP code"),
        "city": _nullable("string", "City name, e.g. Katy, Sugar Land, Houston"),
    },
    "required": ["min_price", "max_price", "price_basis", "min_beds", "min_baths", "home_types", "min_sqft", "max_sqft", "zipcode", "city"],
    "additionalProperties": False,
}


def _tool(name: str, description: str, properties: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "function",
        "name": name,
        "description": description,
        "strict": True,
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": list(properties),
            "additionalProperties": False,
        },
    }


TOOL_SCHEMAS = [
    _tool(
        "search_properties",
        "Find listings matching filters, optionally sorted, and (by default) show them on the map. "
        "Use for 'show me…', 'find…', 'cheapest/most expensive/largest homes in…'.",
        {
            "filters": FILTERS_SCHEMA,
            "sort": {"type": "string", "enum": ["price_asc", "price_desc", "sqft_desc", "price_per_sqft_asc", "none"]},
            "limit": {"type": "integer", "description": "How many top results to return (1-10)."},
            "within_current_map_view": {"type": "boolean", "description": "Restrict to what the user is looking at."},
            "show_on_map": {"type": "boolean", "description": "Apply these filters/sort to the user's map and list."},
        },
    ),
    _tool(
        "compare_areas",
        "Rank ZIP codes or cities by a price metric across the dataset. Use for 'where are prices lower/higher', "
        "'most affordable areas', 'compare ZIPs'.",
        {
            "group_by": {"type": "string", "enum": ["zipcode", "city"]},
            "metric": {"type": "string", "enum": ["median_list_price", "median_price_per_sqft", "median_rent_zestimate"]},
            "order": {"type": "string", "enum": ["asc", "desc"]},
            "limit": {"type": "integer", "description": "Number of areas to return (1-15)."},
            "min_listings": {"type": "integer", "description": "Ignore areas with fewer listings (suggest 15+)."},
            "filters": FILTERS_SCHEMA,
        },
    ),
    _tool(
        "area_statistics",
        "Descriptive statistics (mean, median, quartiles, $/sqft, mix) for one ZIP code or city, or the whole "
        "dataset when area is null. Use for 'average price in Katy', 'what do homes cost in 77008'.",
        {
            "area_type": {"type": "string", "enum": ["zipcode", "city", "all"]},
            "area": _nullable("string", "ZIP code or city name; null when area_type is 'all'"),
            "filters": FILTERS_SCHEMA,
        },
    ),
    _tool(
        "get_property",
        "Full record for one property: characteristics, 2024 listing price, AI valuation status and value, "
        "model inputs and any available explanation. Use for 'this home', 'why is it estimated at…'.",
        {
            "property_id": _nullable("string", "Property ID; null means the property the user has selected."),
        },
    ),
]


# ---------------------------------------------------------------- helpers

def _to_filters(raw: dict[str, Any] | None) -> PropertyFilters:
    raw = raw or {}
    zipcode = raw.get("zipcode")
    if zipcode:
        digits = "".join(ch for ch in str(zipcode) if ch.isdigit())[:5]
        zipcode = digits.zfill(5) if len(digits) >= 3 else None
    return PropertyFilters(
        min_price=raw.get("min_price"),
        max_price=raw.get("max_price"),
        price_basis=raw.get("price_basis") or "list",
        min_beds=raw.get("min_beds"),
        min_baths=raw.get("min_baths"),
        home_types=[t for t in (raw.get("home_types") or []) if t in HOME_TYPES],
        min_sqft=raw.get("min_sqft"),
        max_sqft=raw.get("max_sqft"),
        zipcode=zipcode or None,
        city=(raw.get("city") or None),
    )


def _map_filters(f: PropertyFilters) -> MapFilters:
    return MapFilters(
        price_basis=f.price_basis,  # type: ignore[arg-type]
        min_price=f.min_price,
        max_price=f.max_price,
        min_beds=f.min_beds,
        min_baths=f.min_baths,
        home_types=f.home_types,
        min_sqft=f.min_sqft,
        max_sqft=f.max_sqft,
        zipcode=f.zipcode,
        city=f.city,
    )


def _bounds(df: pd.DataFrame) -> tuple[float, float, float, float]:
    lo, hi = (0.02, 0.98) if len(df) >= 20 else (0.0, 1.0)
    lat, lon = df["latitude"], df["longitude"]
    return (float(lat.quantile(lo)), float(lon.quantile(lo)), float(lat.quantile(hi)), float(lon.quantile(hi)))


def _round(value: Any, digits: int = 0) -> Any:
    value = clean(value)
    if value is None:
        return None
    return round(float(value), digits) if digits else int(round(float(value)))


def _ppsf(df: pd.DataFrame) -> pd.Series:
    has_area = (df["living_area_sqft"] > 0).fillna(False) & (df["home_type"] != "LOT").fillna(True)
    return (df["list_price"] / df["living_area_sqft"]).where(has_area)


def _compact(row: pd.Series) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "address": clean(row["street_address"]),
        "city": clean(row["city"]),
        "zipcode": clean(row["zipcode"]),
        "home_type": clean(row["home_type"]),
        "list_price_2024": _round(row["list_price"]),
        "ai_estimate": _round(row["predicted_price"]),
        "ai_estimate_kind": clean(row["valuation_kind"]),
        "beds": clean(row["bedrooms"]),
        "baths": clean(row["bathrooms"]),
        "living_area_sqft": _round(row["living_area_sqft"]),
        "year_built": clean(row["year_built"]),
    }


def _resolve_area(services: Services, area_type: str, area: str | None) -> tuple[str | None, list[str]]:
    """Return (normalised area or None, suggestions)."""
    if not area:
        return None, []
    df = services.repo.all()
    if area_type == "zipcode":
        z = "".join(ch for ch in area if ch.isdigit())[:5].zfill(5)
        return (z, []) if (df["zipcode"] == z).any() else (None, [])
    cities = sorted(df["city"].dropna().unique())
    by_lower = {c.lower(): c for c in cities}
    if area.strip().lower() in by_lower:
        return by_lower[area.strip().lower()], []
    return None, difflib.get_close_matches(area.title(), cities, n=3, cutoff=0.6)


def _sort(df: pd.DataFrame, sort: str, basis: str) -> pd.DataFrame:
    price = df["predicted_price"] if basis == "predicted" else df["list_price"]
    if sort == "price_asc":
        key, asc = price, True
    elif sort == "price_desc":
        key, asc = price, False
    elif sort == "sqft_desc":
        key, asc = df["living_area_sqft"], False
    elif sort == "price_per_sqft_asc":
        key, asc = _ppsf(df), True
    else:
        return df
    return df.assign(_k=key).sort_values("_k", ascending=asc, na_position="last").drop(columns="_k")


# ---------------------------------------------------------------- tools

def search_properties(services: Services, ctx: AssistantContext, args: dict[str, Any]) -> ToolResult:
    filters = _to_filters(args.get("filters"))
    if filters.price_basis == "predicted" and not services.repo.all()["predicted_price"].notna().any():
        return ToolResult({"error": "No AI predictions are loaded; use price_basis 'list'."})
    bbox = ctx.map_bbox if args.get("within_current_map_view") else None
    subset = services.repo.query(filters, bbox)
    sort = args.get("sort") or "none"
    limit = max(1, min(int(args.get("limit") or 5), 10))
    ordered = _sort(subset, sort, filters.price_basis)
    top = ordered.head(limit)

    data: dict[str, Any] = {
        "matching_listings": len(subset),
        "median_list_price_2024": _round(subset["list_price"].median()) if len(subset) else None,
        "list_price_range": [_round(subset["list_price"].min()), _round(subset["list_price"].max())] if len(subset) else None,
        "top_results": [_compact(r) for _, r in top.iterrows()],
        "sorted_by": sort,
    }
    result = ToolResult(data)
    if len(subset) == 0:
        data["note"] = "No listings match. Suggest loosening a filter."
    if args.get("show_on_map", True):
        result.actions.append(
            SetFiltersAction(
                filters=_map_filters(filters),
                sort=None if sort == "none" else sort,  # type: ignore[arg-type]
                bounds=_bounds(subset) if len(subset) else None,
            )
        )
        data["map_updated"] = True
    if len(top):
        result.cards.append(
            PropertiesCard(
                title={"price_asc": "Lowest priced", "price_desc": "Highest priced", "sqft_desc": "Largest", "price_per_sqft_asc": "Lowest $/sqft"}.get(sort, "Matching listings"),
                total=len(subset),
                items=[PropertyMarker(**m) for m in marker_records(top)],
            )
        )
    return result


METRIC_LABELS = {
    "median_list_price": "Median 2024 listing price",
    "median_price_per_sqft": "Median listing $/sqft",
    "median_rent_zestimate": "Median Zillow rent estimate",
}


def compare_areas(services: Services, ctx: AssistantContext, args: dict[str, Any]) -> ToolResult:
    filters = _to_filters(args.get("filters"))
    group_by = args.get("group_by") or "zipcode"
    metric = args.get("metric") or "median_list_price"
    order = args.get("order") or "asc"
    limit = max(1, min(int(args.get("limit") or 8), 15))
    min_listings = max(1, int(args.get("min_listings") or 15))

    subset = services.repo.query(filters).assign(_ppsf=lambda d: _ppsf(d))
    rows = []
    for area, g in subset.groupby(group_by):
        if len(g) < min_listings:
            continue
        rows.append(
            AreaRow(
                area=str(area),
                kind=group_by,  # type: ignore[arg-type]
                listings=len(g),
                median_list_price=_round(g["list_price"].median()),
                mean_list_price=_round(g["list_price"].mean()),
                median_price_per_sqft=_round(g["_ppsf"].median(), 1),
                median_rent_zestimate=_round(g["rent_zestimate"].median()),
                bounds=_bounds(g),
            )
        )
    rows = [r for r in rows if getattr(r, metric) is not None]
    rows.sort(key=lambda r: getattr(r, metric), reverse=order == "desc")
    rows = rows[:limit]
    data = {
        "group_by": group_by,
        "metric": metric,
        "areas_considered": int(subset[group_by].nunique()),
        "min_listings_per_area": min_listings,
        "rows": [r.model_dump(exclude={"bounds", "kind"}) for r in rows],
        "note": "Medians of 2024 asking prices in this dataset sample, not sale prices."
        + (" Rent figures are Zillow Rent Zestimates (third-party estimates)." if metric == "median_rent_zestimate" else ""),
    }
    card = AreaTableCard(title=f"{'Lowest' if order == 'asc' else 'Highest'} {METRIC_LABELS[metric].lower()} by {'ZIP' if group_by == 'zipcode' else 'city'}", metric=metric, rows=rows)
    return ToolResult(data, cards=[card] if rows else [])


def area_statistics(services: Services, ctx: AssistantContext, args: dict[str, Any]) -> ToolResult:
    area_type = args.get("area_type") or "all"
    filters = _to_filters(args.get("filters"))
    label = "Entire dataset"
    if area_type != "all":
        resolved, suggestions = _resolve_area(services, area_type, args.get("area"))
        if resolved is None:
            return ToolResult({"error": f"'{args.get('area')}' is not in the dataset.", "did_you_mean": suggestions})
        if area_type == "zipcode":
            filters.zipcode, label = resolved, f"ZIP {resolved}"
        else:
            filters.city, label = resolved, resolved

    subset = services.repo.query(filters)
    if subset.empty:
        return ToolResult({"area": label, "listings": 0, "note": "No listings match these filters in this area."})
    price = subset["list_price"].dropna()
    ppsf = _ppsf(subset).dropna()
    stats = {
        "area": label,
        "listings": len(subset),
        "mean_list_price": _round(price.mean()),
        "median_list_price": _round(price.median()),
        "p25_list_price": _round(price.quantile(0.25)),
        "p75_list_price": _round(price.quantile(0.75)),
        "median_price_per_sqft": _round(ppsf.median(), 1) if len(ppsf) else None,
        "avg_living_area_sqft": _round(subset["living_area_sqft"].mean()),
        "median_year_built": _round(subset["year_built"].dropna().median()) if subset["year_built"].notna().any() else None,
        "home_type_mix": {str(k): int(v) for k, v in subset["home_type"].value_counts().items()},
        "median_rent_zestimate": _round(subset["rent_zestimate"].median()),
        "median_ai_estimate": _round(subset["predicted_price"].median()),
        "ai_estimate_kind": next(iter(subset["valuation_kind"].dropna().unique()), None),
    }
    data = {
        **stats,
        "note": "2024 asking prices from this dataset sample (not sales, not the full market). Mean is pulled up by "
        "luxury listings; median is the better 'typical' figure. Rent figures are Zillow Rent Zestimates.",
    }
    result = ToolResult(data, cards=[StatsCard(title=label, stats=stats)])
    if area_type != "all":
        result.actions.append(SetFiltersAction(filters=_map_filters(filters), bounds=_bounds(subset)))
    return result


def get_property(services: Services, ctx: AssistantContext, args: dict[str, Any]) -> ToolResult:
    pid = args.get("property_id") or ctx.selected_property_id
    if not pid:
        return ToolResult({"error": "No property specified and none is selected. Ask the user to pick one on the map."})
    row = services.repo.get(str(pid))
    if row is None:
        return ToolResult({"error": f"Property {pid} not found."})
    valuation = services.valuations.for_property(row)
    bundle = services.predictor.bundle
    price, area = clean(row["list_price"]), clean(row["living_area_sqft"])
    data = {
        **_compact(row),
        "lot_area_sqft": _round(row["lot_area_sqft"]),
        "days_on_market_at_snapshot": clean(row["days_on_market"]),
        "listing_price_per_sqft": round(price / area, 1) if price and area and row["home_type"] != "LOT" else None,
        "valuation": valuation.model_dump(),
        "model_inputs": [f.name for f in bundle.card.features] if bundle else None,
        "explanation": {
            "available": False,
            "reason": "The installed model provides no per-property explanations (e.g. SHAP values) yet.",
        },
        "third_party_benchmarks": {
            "zillow_zestimate": _round(row["zestimate"]),
            "zillow_rent_zestimate": _round(row["rent_zestimate"]),
            "tax_assessed_value": _round(row["tax_assessed_value"]),
            "note": "Not our model's output; never present these as the AI estimate.",
        },
    }
    marker = PropertyMarker(**marker_records(services.repo.all().loc[[str(pid)]])[0])
    return ToolResult(data, actions=[SelectPropertyAction(property=marker)])


TOOLS: dict[str, Callable[[Services, AssistantContext, dict[str, Any]], ToolResult]] = {
    "search_properties": search_properties,
    "compare_areas": compare_areas,
    "area_statistics": area_statistics,
    "get_property": get_property,
}


def run_tool(name: str, arguments: str | dict[str, Any], services: Services, ctx: AssistantContext) -> tuple[dict[str, Any], ToolResult]:
    args = json.loads(arguments) if isinstance(arguments, str) else dict(arguments)
    fn = TOOLS.get(name)
    if fn is None:
        return args, ToolResult({"error": f"Unknown tool {name}"})
    try:
        return args, fn(services, ctx, args)
    except Exception as exc:  # noqa: BLE001 - report tool failures to the model instead of crashing
        return args, ToolResult({"error": f"{type(exc).__name__}: {exc}"})


def to_json(data: dict[str, Any]) -> str:
    def default(o: Any) -> Any:
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating,)):
            return float(o)
        return str(o)

    return json.dumps(data, default=default)
