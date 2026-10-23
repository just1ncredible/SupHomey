from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import REPO_ROOT, Settings
from app.main import create_app

FIXTURE_CSV = REPO_ROOT / "data" / "fixtures" / "synthetic_properties.csv"


def make_settings(tmp_path: Path, **overrides) -> Settings:
    """Settings that always use the synthetic fixture and an isolated model folder."""
    values = dict(
        data_dir=tmp_path / "no-real-data",
        fixture_csv=FIXTURE_CSV,
        allow_fixture_fallback=True,
        model_dir=tmp_path / "model",
        predictions_path=tmp_path / "predictions.csv",
        simulated_predictions=False,
        _env_file=None,
    )
    values.update(overrides)
    return Settings(**values)


@pytest.fixture
def client_factory(tmp_path):
    clients = []

    def factory(**overrides) -> TestClient:
        client = TestClient(create_app(make_settings(tmp_path, **overrides)))
        client.__enter__()
        clients.append(client)
        return client

    yield factory
    for c in clients:
        c.__exit__(None, None, None)


@pytest.fixture
def client(client_factory) -> TestClient:
    return client_factory()
