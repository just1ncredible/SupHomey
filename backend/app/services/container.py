"""Builds and holds the long-lived application services (one instance per process)."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from fastapi import Request

from app.config import Settings
from app.data.loader import LoadedDataset, load_dataset
from app.ml.batch import BatchPredictions, load_batch_predictions, simulate_predictions
from app.ml.predictor import RealtimePredictor
from app.services.repository import PandasPropertyRepository, PropertyRepository
from app.services.valuation import ValuationService

logger = logging.getLogger(__name__)


@dataclass
class Services:
    settings: Settings
    dataset: LoadedDataset
    repo: PropertyRepository
    predictor: RealtimePredictor
    batch: BatchPredictions | None
    valuations: ValuationService

    @property
    def predictions_kind(self) -> str:
        return self.batch.kind if self.batch else "none"


def _load_batch(settings: Settings, dataset: LoadedDataset, predictor: RealtimePredictor) -> BatchPredictions | None:
    path = settings.resolve(settings.predictions_path)
    if path.exists():
        try:
            batch = load_batch_predictions(path, dataset.frame["id"].astype(str))
            logger.info("Loaded %s batch predictions from %s", batch.matched, path)
            return batch
        except Exception as exc:  # noqa: BLE001 - a bad predictions file must not take the API down
            logger.error("Could not load batch predictions %s: %s", path, exc)
    # Simulated values are a dev-only stand-in: never used once a real model or predictions exist.
    if settings.simulated_predictions and not predictor.available:
        logger.warning("HOMESCOPE_SIMULATED_PREDICTIONS is on: serving simulated valuations (UI preview only)")
        return simulate_predictions(dataset.frame)
    return None


def build_services(settings: Settings) -> Services:
    dataset = load_dataset(settings)
    predictor = RealtimePredictor(settings.resolve(settings.model_dir))
    batch = _load_batch(settings, dataset, predictor)
    repo = PandasPropertyRepository(dataset.frame, batch)
    return Services(settings, dataset, repo, predictor, batch, ValuationService(repo, predictor, batch))


def get_services(request: Request) -> Services:
    return request.app.state.services
