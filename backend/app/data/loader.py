"""Pick the dataset to serve: the real Kaggle data if present, otherwise the labelled fixture."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import pandas as pd

from app.config import Settings
from app.data.ingest import DatasetSource, IngestionReport, ingest

logger = logging.getLogger(__name__)


@dataclass
class LoadedDataset:
    frame: pd.DataFrame
    source: DatasetSource
    report: IngestionReport

    @property
    def is_synthetic(self) -> bool:
        return self.source == "synthetic_fixture"


class DatasetUnavailableError(RuntimeError):
    pass


def load_dataset(settings: Settings) -> LoadedDataset:
    clean = settings.clean_csv_path
    if clean.exists():
        details = settings.details_csv_path
        frame, report = ingest(clean, details if details.exists() else None)
        if not details.exists():
            report.warnings.append(
                "Listing-details extract not found: street addresses are unavailable. "
                "Run `python scripts/fetch_dataset.py` to add them."
            )
        logger.info("Loaded %s properties from %s", report.rows_loaded, clean)
        return LoadedDataset(frame, "kaggle_houston_2024", report)

    fixture = settings.resolve(settings.fixture_csv)
    if settings.allow_fixture_fallback and fixture.exists():
        frame, report = ingest(fixture)
        report.warnings.append(
            f"Real dataset not found at {clean}. Serving SYNTHETIC fixture data for development only."
        )
        logger.warning("Real dataset missing; serving synthetic fixture (%s rows)", report.rows_loaded)
        return LoadedDataset(frame, "synthetic_fixture", report)

    raise DatasetUnavailableError(
        f"No dataset found at {clean}. Run `python scripts/fetch_dataset.py` "
        "or enable HOMESCOPE_ALLOW_FIXTURE_FALLBACK."
    )
