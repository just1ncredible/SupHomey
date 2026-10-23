from typing import Literal

from pydantic import BaseModel, Field

ValuationKind = Literal["batch", "realtime", "simulated"]
PriceBasis = Literal["list", "predicted"]


class PropertyMarker(BaseModel):
    """Lightweight record for map markers and result lists."""

    id: str
    lat: float
    lng: float
    list_price: float | None = Field(description="Historical 2024 listing (asking) price — not a sale price.")
    predicted_price: float | None = Field(description="Model valuation, if one is loaded for this property.")
    valuation_kind: ValuationKind | None = None
    bedrooms: float | None
    bathrooms: float | None
    living_area_sqft: float | None
    home_type: str | None
    street_address: str | None
    city: str | None
    zipcode: str | None


class PropertyListResponse(BaseModel):
    total: int = Field(description="Properties matching the filters (before limit/offset).")
    offset: int
    limit: int
    items: list[PropertyMarker]


class Valuation(BaseModel):
    status: Literal["available", "simulated", "unavailable", "error"]
    source: ValuationKind | None = None
    value: float | None = None
    low: float | None = None
    high: float | None = None
    interval_coverage: float | None = Field(default=None, description="Validated coverage of [low, high], e.g. 0.8.")
    price_per_sqft: float | None = Field(default=None, description="Predicted value / living area.")
    model_name: str | None = None
    model_version: str | None = None
    message: str


class Benchmarks(BaseModel):
    """Third-party figures from the source listing. Context only — never model inputs or outputs."""

    zestimate: float | None
    rent_zestimate: float | None
    tax_assessed_value: float | None


class PropertyDetail(BaseModel):
    id: str
    zpid: int | None
    street_address: str | None
    city: str | None
    state: str | None
    zipcode: str | None
    latitude: float
    longitude: float
    home_type: str | None
    bedrooms: float | None
    bathrooms: float | None
    living_area_sqft: float | None
    lot_area_sqft: float | None
    lot_area_source: str | None = Field(description="reported_sqft | converted_from_acres | inferred_acres | inferred_sqft")
    year_built: int | None
    list_price: float | None
    list_price_per_sqft: float | None
    days_on_market: int | None = Field(description="Days on Zillow when the 2024 snapshot was taken.")
    valuation: Valuation
    benchmarks: Benchmarks
    dataset_source: str


class ZipMatch(BaseModel):
    zipcode: str
    count: int
    bounds: tuple[float, float, float, float] = Field(description="south, west, north, east")


class CityMatch(BaseModel):
    city: str
    count: int
    bounds: tuple[float, float, float, float]


class SearchResponse(BaseModel):
    query: str
    properties: list[PropertyMarker]
    zipcodes: list[ZipMatch]
    cities: list[CityMatch]


class HomeTypeOption(BaseModel):
    value: str
    count: int


class FilterMeta(BaseModel):
    home_types: list[HomeTypeOption]
    list_price_range: tuple[float, float]
    living_area_range: tuple[float, float]
    predicted_available: bool
    predicted_kind: ValuationKind | None
