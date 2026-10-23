"""The model card: the contract between a trained model bundle and this application.

A model bundle is a folder (default: models/current/) containing `model_card.json`, the
model artifact, and optionally a preprocessor and a feature hook. The card states which
features the model expects, in which order, and how to build each one from a property
record, so serving-time preprocessing matches training exactly.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

# Fields that encode the answer (or a third-party valuation of it). Feeding them to a price
# model leaks the target and inflates accuracy. Using one requires an explicit, documented exception.
LEAKAGE_FIELDS = frozenset(
    {
        "list_price",
        "price",
        "zestimate",
        "rent_zestimate",
        "price_per_sqft",
        "list_price_per_sqft",
        "tax_assessed_value",
        "predicted_price",
    }
)

Framework = Literal["sklearn", "xgboost", "lightgbm", "catboost"]
FeatureDType = Literal["float", "int", "string", "category", "bool"]


class FeatureSpec(BaseModel):
    name: str = Field(description="Column name exactly as the model saw it during training.")
    source: str | None = Field(
        default=None,
        description=(
            "Where the value comes from: a canonical property field (e.g. 'living_area_sqft'), "
            "'engineered:<name>' for a built-in feature, or 'hook' for a column produced by the "
            "bundle's feature hook. Defaults to `name`."
        ),
    )
    dtype: FeatureDType = "float"
    required: bool = Field(default=False, description="Reject prediction requests where this is missing.")
    default: Any = Field(default=None, description="Fill value when missing (null keeps it as NaN).")

    @property
    def resolved_source(self) -> str:
        return self.source or self.name


class IntervalSpec(BaseModel):
    """A prediction interval derived from VALIDATION residuals (not invented)."""

    method: Literal["log_residual_quantiles", "relative_residual_quantiles"]
    lower: float = Field(description="Lower residual quantile, e.g. -0.18 (log space or relative).")
    upper: float = Field(description="Upper residual quantile, e.g. 0.16.")
    coverage: float = Field(gt=0, lt=1, description="Empirical coverage on validation data, e.g. 0.8.")
    description: str | None = None

    @model_validator(mode="after")
    def _brackets_prediction(self) -> "IntervalSpec":
        if not self.lower <= 0 <= self.upper:
            raise ValueError("interval needs lower <= 0 <= upper so [low, high] contains the prediction")
        return self


class ModelMetrics(BaseModel):
    """Validation metrics exactly as reported by the training team. Only shown when present."""

    mae: float | None = None
    rmse: float | None = None
    r2: float | None = None
    mape: float | None = None
    evaluation: str | None = Field(default=None, description="e.g. '20% holdout' or '5-fold CV'.")
    n_validation: int | None = None


class TrainingData(BaseModel):
    source: str | None = None
    period: str | None = None
    rows: int | None = None


class LeakageException(BaseModel):
    field: str
    justification: str = Field(min_length=20)


class ModelCard(BaseModel):
    name: str
    version: str
    framework: Framework = "sklearn"
    artifact: str = Field(description="Model file relative to the bundle folder.")
    preprocessor: str | None = Field(default=None, description="Optional fitted transformer applied before the model.")
    feature_hook: str | None = Field(
        default=None,
        description="Optional .py file in the bundle defining build_features(df) -> df, for custom engineering.",
    )
    target: str = "list_price"
    target_transform: Literal["none", "log1p", "log"] = "none"
    features: list[FeatureSpec]
    interval: IntervalSpec | None = None
    metrics: ModelMetrics | None = None
    training_data: TrainingData | None = None
    trained_at: str | None = None
    leakage_exceptions: list[LeakageException] = []
    notes: str | None = None

    @model_validator(mode="after")
    def _check_leakage(self) -> "ModelCard":
        allowed = {e.field for e in self.leakage_exceptions}
        leaking = [
            f.name
            for f in self.features
            if (f.resolved_source in LEAKAGE_FIELDS or f.name in LEAKAGE_FIELDS)
            and f.resolved_source not in allowed
            and f.name not in allowed
        ]
        if leaking:
            raise ValueError(
                f"Feature(s) {leaking} use target-leaking valuation fields. Remove them, or document a "
                "justified entry in `leakage_exceptions`."
            )
        names = [f.name for f in self.features]
        if len(names) != len(set(names)):
            raise ValueError("Feature names must be unique.")
        if not names:
            raise ValueError("The model card must list at least one feature.")
        return self
