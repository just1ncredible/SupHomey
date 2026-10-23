from fastapi import APIRouter, Depends, HTTPException, Query

from app.schemas.property import (
    Benchmarks,
    CityMatch,
    FilterMeta,
    HomeTypeOption,
    PropertyDetail,
    PropertyListResponse,
    PropertyMarker,
    SearchResponse,
    ZipMatch,
)
from app.routes.params import bbox_param, filter_params
from app.services.container import Services, get_services
from app.services.repository import BBox, PropertyFilters
from app.services.serialize import clean, marker_records

router = APIRouter(prefix="/api", tags=["properties"])


@router.get("/properties", response_model=PropertyListResponse)
def list_properties(
    filters: PropertyFilters = Depends(filter_params),
    bbox: BBox | None = Depends(bbox_param),
    limit: int = Query(5000, ge=1, description="Max markers returned (capped by HOMESCOPE_MAX_PAGE_SIZE)."),
    offset: int = Query(0, ge=0),
    services: Services = Depends(get_services),
):
    """Map markers and summaries, filtered by bounding box and property attributes."""
    limit = min(limit, services.settings.max_page_size)
    subset = services.repo.query(filters, bbox)
    page = subset.iloc[offset : offset + limit]
    return {"total": len(subset), "offset": offset, "limit": limit, "items": marker_records(page)}


@router.get("/properties/meta", response_model=FilterMeta)
def filter_meta(services: Services = Depends(get_services)):
    """Options and ranges for building filter controls."""
    df = services.repo.all()
    types = df["home_type"].dropna().value_counts()
    has_pred = df["predicted_price"].notna()
    return FilterMeta(
        home_types=[HomeTypeOption(value=str(k), count=int(v)) for k, v in types.items()],
        list_price_range=(clean(df["list_price"].min()), clean(df["list_price"].max())),
        living_area_range=(clean(df["living_area_sqft"].min()), clean(df["living_area_sqft"].max())),
        predicted_available=bool(has_pred.any()),
        predicted_kind=services.batch.kind if services.batch and has_pred.any() else None,
    )


@router.get("/properties/{property_id}", response_model=PropertyDetail)
def get_property(property_id: str, services: Services = Depends(get_services)):
    """Full record for one property, including its valuation status."""
    row = services.repo.get(property_id)
    if row is None:
        raise HTTPException(404, f"Property '{property_id}' not found")
    price, area = clean(row["list_price"]), clean(row["living_area_sqft"])
    return PropertyDetail(
        **{
            k: clean(row[k])
            for k in (
                "id", "zpid", "street_address", "city", "state", "zipcode", "latitude", "longitude",
                "home_type", "bedrooms", "bathrooms", "living_area_sqft", "lot_area_sqft",
                "lot_area_source", "year_built", "list_price", "days_on_market",
            )
        },
        list_price_per_sqft=round(price / area, 2) if price and area else None,
        valuation=services.valuations.for_property(row),
        benchmarks=Benchmarks(
            zestimate=clean(row["zestimate"]),
            rent_zestimate=clean(row["rent_zestimate"]),
            tax_assessed_value=clean(row["tax_assessed_value"]),
        ),
        dataset_source=services.dataset.source,
    )


@router.get("/search", response_model=SearchResponse)
def search(
    q: str = Query(..., min_length=1, max_length=100, description="Street address, ZIP code, or city"),
    limit: int = Query(8, ge=1, le=25),
    services: Services = Depends(get_services),
):
    """Dataset-backed search. Only addresses present in the dataset are returned."""
    props, zips, cities = services.repo.search(q, limit)
    return SearchResponse(
        query=q,
        properties=[PropertyMarker(**r) for r in marker_records(props)],
        zipcodes=[ZipMatch(**r) for r in zips.to_dict("records")] if not zips.empty else [],
        cities=[CityMatch(**r) for r in cities.to_dict("records")] if not cities.empty else [],
    )
