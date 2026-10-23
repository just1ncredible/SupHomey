from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.ml.model_card import LEAKAGE_FIELDS, ModelMetrics, TrainingData


class ModelInfo(BaseModel):
    name: str
    version: str
    framework: str
    target_transform: str
    features: list[str]
    trained_at: str | None
    training_data: TrainingData | None
    has_interval: bool
    notes: str | None


class BatchInfo(BaseModel):
    kind: Literal["batch", "simulated"]
    source_file: str | None
    rows_in_file: int
    matched: int
    coverage: float = Field(description="Share of loaded properties that have a prediction.")
    generated_at: str | None
    warnings: list[str]


class ModelStatusResponse(BaseModel):
    realtime_status: Literal["not_installed", "loaded", "error"]
    realtime_error: str | None
    model: ModelInfo | None
    metrics: ModelMetrics | None = Field(description="Validation metrics supplied in the model card; null if none.")
    batch: BatchInfo | None
    message: str


class PropertyAttributes(BaseModel):
    """Property characteristics for a real-time prediction. All optional; the model card decides what's required."""

    model_config = ConfigDict(extra="forbid")

    bedrooms: float | None = Field(default=None, ge=0, le=50)
    bathrooms: float | None = Field(default=None, ge=0, le=50)
    living_area_sqft: float | None = Field(default=None, gt=0, le=100_000)
    lot_area_sqft: float | None = Field(default=None, gt=0)
    year_built: int | None = Field(default=None, ge=1800, le=2035)
    home_type: str | None = None
    latitude: float | None = Field(default=None, ge=28.8, le=30.9)
    longitude: float | None = Field(default=None, ge=-96.7, le=-94.3)
    zipcode: str | None = Field(default=None, pattern=r"^\d{5}$")
    city: str | None = None
    extra: dict[str, Any] = Field(
        default_factory=dict,
        description="Supplementary model features not covered above (e.g. school_rating). Leakage fields are rejected.",
    )

    def leakage_keys(self) -> list[str]:
        return sorted(set(self.extra) & LEAKAGE_FIELDS)


class PredictRequest(BaseModel):
    property_id: str | None = Field(default=None, description="Start from a dataset property; `attributes` override its values.")
    attributes: PropertyAttributes | None = None


class PredictionValue(BaseModel):
    value: float
    low: float | None
    high: float | None
    interval_coverage: float | None
    currency: Literal["USD"] = "USD"


class PredictResponse(BaseModel):
    status: Literal["ok", "model_unavailable", "invalid_input", "error"]
    property_id: str | None
    prediction: PredictionValue | None
    model: ModelInfo | None
    inputs: dict[str, Any] = Field(default_factory=dict, description="Property attributes sent to the feature builder.")
    missing_required: list[str] = []
    message: str
