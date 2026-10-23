from fastapi import APIRouter, Depends

from app.routes.params import bbox_param, filter_params
from app.schemas.market import MarketSummary, StatsScope
from app.services.container import Services, get_services
from app.services.market import summarize
from app.services.repository import BBox, PropertyFilters

router = APIRouter(prefix="/api/market", tags=["market"])

SCOPE_LABELS = {
    "dataset": "Entire dataset",
    "filtered": "All properties matching filters",
    "viewport": "Properties in current map view",
    "viewport_filtered": "Filtered properties in current map view",
}


@router.get("/summary", response_model=MarketSummary)
def market_summary(
    filters: PropertyFilters = Depends(filter_params),
    bbox: BBox | None = Depends(bbox_param),
    services: Services = Depends(get_services),
):
    """Descriptive statistics. Scope is inferred from the parameters and reported in `scope`."""
    active = filters.is_active()
    kind = ("viewport_filtered" if active else "viewport") if bbox else ("filtered" if active else "dataset")
    subset = services.repo.query(filters, bbox)
    scope = StatsScope(kind=kind, label=SCOPE_LABELS[kind], bbox=bbox, filters_applied=active)
    return summarize(subset, services.repo.total, scope)
