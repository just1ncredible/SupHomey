"""Shared query-parameter parsing for property filters and bounding boxes."""

from typing import Literal

from fastapi import HTTPException, Query

from app.services.repository import BBox, PropertyFilters


def filter_params(
    min_price: float | None = Query(None, ge=0, description="Minimum price on the chosen price_basis."),
    max_price: float | None = Query(None, ge=0),
    price_basis: Literal["list", "predicted"] = Query(
        "list", description="'list' = historical 2024 listing price; 'predicted' = loaded model valuation."
    ),
    min_beds: float | None = Query(None, ge=0),
    min_baths: float | None = Query(None, ge=0),
    home_types: str | None = Query(None, description="Comma-separated, e.g. SINGLE_FAMILY,TOWNHOUSE"),
    min_sqft: float | None = Query(None, ge=0),
    max_sqft: float | None = Query(None, ge=0),
    zipcode: str | None = Query(None, pattern=r"^\d{5}$"),
    city: str | None = Query(None),
) -> PropertyFilters:
    return PropertyFilters(
        min_price=min_price,
        max_price=max_price,
        price_basis=price_basis,
        min_beds=min_beds,
        min_baths=min_baths,
        home_types=[t.strip().upper() for t in home_types.split(",") if t.strip()] if home_types else [],
        min_sqft=min_sqft,
        max_sqft=max_sqft,
        zipcode=zipcode,
        city=city,
    )


def bbox_param(
    bbox: str | None = Query(None, description="south,west,north,east in decimal degrees"),
) -> BBox | None:
    if not bbox:
        return None
    try:
        south, west, north, east = (float(v) for v in bbox.split(","))
    except ValueError:
        raise HTTPException(422, "bbox must be four comma-separated numbers: south,west,north,east")
    if south > north or west > east:
        raise HTTPException(422, "bbox must satisfy south <= north and west <= east")
    return south, west, north, east
