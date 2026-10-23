"""Decide what valuation to show for a property, and serve real-time predictions.

Precedence: precomputed team predictions -> real-time model -> (dev only) simulated -> unavailable.
A listing price, Zestimate or tax value is never returned as a valuation.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from app.ml.batch import BatchPredictions
from app.ml.predictor import RealtimePredictor
from app.schemas.model import ModelInfo, PredictionValue, PredictRequest, PredictResponse
from app.schemas.property import Valuation
from app.services.repository import PropertyRepository
from app.services.serialize import clean

UNAVAILABLE = "AI valuation unavailable — model not connected."
SIMULATED = "Simulated — UI Preview. Generated for interface testing, not by a trained model."

# Canonical property fields a model may use as inputs. Valuation fields are deliberately absent.
INPUT_FIELDS = (
    "bedrooms",
    "bathrooms",
    "living_area_sqft",
    "lot_area_sqft",
    "year_built",
    "home_type",
    "latitude",
    "longitude",
    "zipcode",
    "city",
)


def model_info(predictor: RealtimePredictor) -> ModelInfo | None:
    if predictor.bundle is None:
        return None
    card = predictor.bundle.card
    return ModelInfo(
        name=card.name,
        version=card.version,
        framework=card.framework,
        target_transform=card.target_transform,
        features=[f.name for f in card.features],
        trained_at=card.trained_at,
        training_data=card.training_data,
        has_interval=card.interval is not None,
        notes=card.notes,
    )


class ValuationService:
    def __init__(self, repo: PropertyRepository, predictor: RealtimePredictor, batch: BatchPredictions | None):
        self.repo = repo
        self.predictor = predictor
        self.batch = batch

    @staticmethod
    def _per_sqft(value: float | None, row: pd.Series) -> float | None:
        area = clean(row.get("living_area_sqft"))
        return round(value / area, 2) if value and area else None

    def for_property(self, row: pd.Series) -> Valuation:
        predicted = clean(row.get("predicted_price"))
        kind = row.get("valuation_kind")
        if predicted is not None and kind == "batch":
            name, version = clean(row.get("model_name")), clean(row.get("model_version"))
            return Valuation(
                status="available",
                source="batch",
                value=predicted,
                low=clean(row.get("predicted_low")),
                high=clean(row.get("predicted_high")),
                interval_coverage=clean(row.get("interval_coverage")),
                price_per_sqft=self._per_sqft(predicted, row),
                model_name=name,
                model_version=version,
                message=f"Precomputed by {name or 'team model'}{f' v{version}' if version else ''}.",
            )

        if self.predictor.available:
            result = self.predictor.predict(pd.DataFrame([row[list(INPUT_FIELDS)].to_dict()]))[0]
            info = model_info(self.predictor)
            if result.value is not None:
                interval = self.predictor.bundle.card.interval
                return Valuation(
                    status="available",
                    source="realtime",
                    value=round(result.value, -2),
                    low=round(result.low, -2) if result.low else None,
                    high=round(result.high, -2) if result.high else None,
                    interval_coverage=interval.coverage if interval else None,
                    price_per_sqft=self._per_sqft(result.value, row),
                    model_name=info.name,
                    model_version=info.version,
                    message=f"Computed on request by {info.name} v{info.version}.",
                )
            missing = ", ".join(result.missing_required or [])
            return Valuation(
                status="unavailable",
                message=f"AI valuation unavailable — this property is missing required model inputs ({missing}).",
            )

        if predicted is not None and kind == "simulated":
            return Valuation(
                status="simulated",
                source="simulated",
                value=predicted,
                price_per_sqft=self._per_sqft(predicted, row),
                model_name=clean(row.get("model_name")),
                model_version="simulated",
                message=SIMULATED,
            )

        if self.predictor.state == "error":
            return Valuation(status="error", message="AI valuation unavailable — the installed model failed to load.")
        return Valuation(status="unavailable", message=UNAVAILABLE)

    def predict(self, request: PredictRequest) -> tuple[int, PredictResponse]:
        info = model_info(self.predictor)
        attrs = request.attributes

        if attrs and attrs.leakage_keys():
            return 422, PredictResponse(
                status="invalid_input",
                property_id=request.property_id,
                prediction=None,
                model=info,
                message=f"Valuation fields cannot be model inputs: {', '.join(attrs.leakage_keys())}.",
            )

        inputs: dict[str, Any] = {}
        if request.property_id is not None:
            row = self.repo.get(request.property_id)
            if row is None:
                return 404, PredictResponse(
                    status="invalid_input",
                    property_id=request.property_id,
                    prediction=None,
                    model=info,
                    message=f"Property '{request.property_id}' not found.",
                )
            inputs = {k: clean(row.get(k)) for k in INPUT_FIELDS}
        if attrs:
            inputs.update({k: v for k, v in attrs.model_dump(exclude={"extra"}).items() if v is not None})
            inputs.update(attrs.extra)
        if not inputs:
            return 422, PredictResponse(
                status="invalid_input",
                property_id=None,
                prediction=None,
                model=info,
                message="Provide a property_id and/or attributes.",
            )

        if not self.predictor.available:
            detail = f" ({self.predictor.error})" if self.predictor.state == "error" else ""
            return 503, PredictResponse(
                status="model_unavailable",
                property_id=request.property_id,
                prediction=None,
                model=None,
                inputs=inputs,
                message=f"No trained model is installed{detail}. Real-time predictions are unavailable.",
            )

        try:
            result = self.predictor.predict(pd.DataFrame([inputs]))[0]
        except Exception as exc:  # noqa: BLE001 - surface model failures as a structured error
            return 500, PredictResponse(
                status="error",
                property_id=request.property_id,
                prediction=None,
                model=info,
                inputs=inputs,
                message=f"Model failed to predict: {type(exc).__name__}: {exc}",
            )
        if result.value is None:
            return 422, PredictResponse(
                status="invalid_input",
                property_id=request.property_id,
                prediction=None,
                model=info,
                inputs=inputs,
                missing_required=result.missing_required or [],
                message="Required model inputs are missing.",
            )
        interval = self.predictor.bundle.card.interval
        return 200, PredictResponse(
            status="ok",
            property_id=request.property_id,
            prediction=PredictionValue(
                value=result.value,
                low=result.low,
                high=result.high,
                interval_coverage=interval.coverage if interval else None,
            ),
            model=info,
            inputs=inputs,
            message="Prediction computed by the installed model.",
        )
