from typing import Literal

from pydantic import BaseModel


class DatasetStatus(BaseModel):
    source: Literal["kaggle_houston_2024", "synthetic_fixture"]
    is_synthetic: bool
    label: str
    records: int
    rows_read: int
    dropped_invalid_coordinates: int
    dropped_duplicates: int
    nulled_placeholder_values: dict[str, int]
    lot_units: dict[str, int]
    has_street_addresses: bool
    warnings: list[str]


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    version: str
    dataset: DatasetStatus
    model_status: Literal["not_installed", "loaded", "error"]
    predictions: Literal["batch", "simulated", "none"]
