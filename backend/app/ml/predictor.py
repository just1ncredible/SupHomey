"""Load a trained model bundle and serve real-time predictions.

Supported artifacts (choose with `framework` in model_card.json):
  sklearn   joblib/pickle file: sklearn Pipelines, or XGBoost / LightGBM / CatBoost models saved
            through their scikit-learn wrappers (XGBRegressor, LGBMRegressor, CatBoostRegressor)
  xgboost   native .json / .ubj saved with model.save_model()
  lightgbm  native .txt saved with booster.save_model()
  catboost  native .cbm saved with model.save_model()
The matching library must be installed in the backend venv (see requirements-ml.txt).
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import numpy as np
import pandas as pd
from pydantic import ValidationError

from app.ml.features import build_feature_frame, load_feature_hook
from app.ml.model_card import ModelCard

logger = logging.getLogger(__name__)

CARD_FILENAME = "model_card.json"
ModelState = Literal["not_installed", "loaded", "error"]


@dataclass
class PointPrediction:
    value: float | None
    low: float | None = None
    high: float | None = None
    missing_required: list[str] | None = None


def _load_artifact(framework: str, path: Path) -> Any:
    if framework == "sklearn":
        import joblib

        return joblib.load(path)
    if framework == "xgboost":
        import xgboost

        model = xgboost.XGBRegressor()
        model.load_model(path)
        return model
    if framework == "lightgbm":
        import lightgbm

        return lightgbm.Booster(model_file=str(path))
    if framework == "catboost":
        import catboost

        model = catboost.CatBoostRegressor()
        model.load_model(str(path))
        return model
    raise ValueError(f"Unsupported framework '{framework}'")


class ModelBundle:
    """A loaded model + its card. Construct with ModelBundle.load()."""

    def __init__(self, card: ModelCard, model: Any, preprocessor: Any, hook: Callable | None, folder: Path):
        self.card = card
        self.model = model
        self.preprocessor = preprocessor
        self.hook = hook
        self.folder = folder

    @classmethod
    def load(cls, folder: Path) -> "ModelBundle":
        card = ModelCard.model_validate(json.loads((folder / CARD_FILENAME).read_text()))
        model = _load_artifact(card.framework, folder / card.artifact)
        preprocessor = None
        if card.preprocessor:
            import joblib

            preprocessor = joblib.load(folder / card.preprocessor)
        hook = load_feature_hook(folder, card.feature_hook) if card.feature_hook else None
        return cls(card, model, preprocessor, hook, folder)

    def _inverse_target(self, raw: np.ndarray) -> np.ndarray:
        if self.card.target_transform == "log1p":
            return np.expm1(raw)
        if self.card.target_transform == "log":
            return np.exp(raw)
        return raw

    def _interval(self, values: np.ndarray) -> tuple[np.ndarray, np.ndarray] | None:
        spec = self.card.interval
        if spec is None:
            return None
        if spec.method == "log_residual_quantiles":
            return values * np.exp(spec.lower), values * np.exp(spec.upper)
        return values * (1 + spec.lower), values * (1 + spec.upper)

    def predict_frame(self, properties: pd.DataFrame) -> list[PointPrediction]:
        X, missing = build_feature_frame(properties, self.card, self.hook)
        ok = np.array([i not in missing for i in range(len(X))], dtype=bool)
        results = [PointPrediction(None, missing_required=missing.get(i)) for i in range(len(X))]
        if not ok.any():
            return results
        X_ok = X[ok]
        if self.preprocessor is not None:
            X_ok = self.preprocessor.transform(X_ok)
        raw = np.asarray(self.model.predict(X_ok), dtype=float).reshape(-1)
        values = self._inverse_target(raw)
        interval = self._interval(values)
        for j, i in enumerate(np.flatnonzero(ok)):
            v = float(values[j])
            if not np.isfinite(v):
                continue
            results[i] = PointPrediction(
                value=v,
                low=float(interval[0][j]) if interval else None,
                high=float(interval[1][j]) if interval else None,
            )
        return results


class RealtimePredictor:
    """Holds the currently installed bundle (if any) and its load status."""

    def __init__(self, folder: Path):
        self.folder = folder
        self.bundle: ModelBundle | None = None
        self.state: ModelState = "not_installed"
        self.error: str | None = None
        self.reload()

    def reload(self) -> None:
        self.bundle, self.error = None, None
        if not (self.folder / CARD_FILENAME).exists():
            self.state = "not_installed"
            return
        try:
            self.bundle = ModelBundle.load(self.folder)
            self.state = "loaded"
            logger.info("Loaded model %s v%s", self.bundle.card.name, self.bundle.card.version)
        except (ValidationError, ValueError) as exc:
            self.state, self.error = "error", f"Invalid model card: {exc}"
        except ImportError as exc:
            self.state, self.error = "error", f"Missing library for this model: {exc}. See requirements-ml.txt."
        except Exception as exc:  # noqa: BLE001 - any artifact problem should degrade, not crash the API
            self.state, self.error = "error", f"Could not load model bundle: {type(exc).__name__}: {exc}"
        if self.error:
            logger.error(self.error)

    @property
    def available(self) -> bool:
        return self.bundle is not None

    def predict(self, properties: pd.DataFrame) -> list[PointPrediction]:
        if self.bundle is None:
            raise RuntimeError("No model installed")
        return self.bundle.predict_frame(properties)
