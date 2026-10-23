from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.schemas.model import BatchInfo, ModelStatusResponse, PredictRequest, PredictResponse
from app.services.container import Services, build_services, get_services
from app.services.valuation import model_info

router = APIRouter(prefix="/api", tags=["model"])


def _status(services: Services) -> ModelStatusResponse:
    predictor, batch = services.predictor, services.batch
    batch_info = None
    if batch is not None:
        batch_info = BatchInfo(
            kind=batch.kind,
            source_file=batch.source_file,
            rows_in_file=batch.rows_in_file,
            matched=batch.matched,
            coverage=round(batch.matched / max(len(services.dataset.frame), 1), 4),
            generated_at=batch.generated_at,
            warnings=batch.warnings,
        )
    if predictor.state == "loaded":
        message = "Real-time model loaded."
    elif predictor.state == "error":
        message = f"Model bundle found but failed to load: {predictor.error}"
    elif batch is not None and batch.kind == "batch":
        message = "Precomputed predictions loaded; no real-time model installed."
    elif batch is not None:
        message = "No model connected. Showing SIMULATED values for UI preview only."
    else:
        message = "No model connected. AI valuations are unavailable."
    card = predictor.bundle.card if predictor.bundle else None
    return ModelStatusResponse(
        realtime_status=predictor.state,
        realtime_error=predictor.error,
        model=model_info(predictor),
        metrics=card.metrics if card else None,
        batch=batch_info,
        message=message,
    )


@router.get("/model/metrics", response_model=ModelStatusResponse)
def model_metrics(services: Services = Depends(get_services)):
    """Model status and validation metrics exactly as supplied in the model card (never estimated here)."""
    return _status(services)


@router.post("/model/reload", response_model=ModelStatusResponse)
def reload_model(request: Request):
    """Reload the dataset, model bundle and batch predictions from disk (no server restart needed)."""
    services = build_services(request.app.state.services.settings)
    request.app.state.services = services
    return _status(services)


@router.post(
    "/predict",
    response_model=PredictResponse,
    responses={
        404: {"model": PredictResponse, "description": "Unknown property_id"},
        422: {"model": PredictResponse, "description": "Invalid or insufficient inputs"},
        503: {"model": PredictResponse, "description": "No trained model installed"},
    },
)
def predict(body: PredictRequest, services: Services = Depends(get_services)):
    """Real-time prediction from the installed model. Never falls back to a fabricated value."""
    status_code, response = services.valuations.predict(body)
    return JSONResponse(status_code=status_code, content=response.model_dump(mode="json"))
