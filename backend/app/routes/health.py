from fastapi import APIRouter, Depends

from app import __version__
from app.schemas.health import DatasetStatus, HealthResponse
from app.services.container import Services, get_services

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health(services: Services = Depends(get_services)):
    """Application, dataset and model status."""
    ds, report = services.dataset, services.dataset.report
    return HealthResponse(
        status="degraded" if ds.is_synthetic or services.predictor.state == "error" else "ok",
        version=__version__,
        dataset=DatasetStatus(
            source=ds.source,
            is_synthetic=ds.is_synthetic,
            label="Synthetic development fixture" if ds.is_synthetic else "Houston Housing Market 2024 (Kaggle, Zillow listings)",
            records=report.rows_loaded,
            rows_read=report.rows_read,
            dropped_invalid_coordinates=report.dropped_invalid_coordinates,
            dropped_duplicates=report.dropped_duplicate_ids + report.dropped_duplicate_records,
            nulled_placeholder_values=report.nulled_placeholder_values,
            lot_units=report.lot_units,
            has_street_addresses=bool(ds.frame["street_address"].notna().any()),
            warnings=report.warnings,
        ),
        model_status=services.predictor.state,
        predictions=services.predictions_kind,
    )
