from typing import Literal

from pydantic import BaseModel, Field

ScopeKind = Literal["dataset", "filtered", "viewport", "viewport_filtered"]


class StatsScope(BaseModel):
    kind: ScopeKind
    label: str
    bbox: tuple[float, float, float, float] | None = None
    filters_applied: bool


class CountItem(BaseModel):
    label: str
    count: int


class PriceBucket(BaseModel):
    label: str
    min: float | None
    max: float | None
    count: int


class MarketSummary(BaseModel):
    scope: StatsScope
    count: int
    dataset_total: int
    median_list_price: float | None
    median_list_price_per_sqft: float | None = Field(
        description="Median of listing price / living area, excluding vacant land and rows without area."
    )
    avg_living_area_sqft: float | None
    median_predicted_price: float | None
    predicted_count: int
    predicted_kind: Literal["batch", "simulated"] | None
    home_types: list[CountItem]
    list_price_distribution: list[PriceBucket]
    note: str
