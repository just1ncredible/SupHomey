"""End-to-end check of the teammate hand-off: a model bundle and a batch predictions file.

The tiny model trained here exists only inside the test's temp folder to exercise the adapter.
"""

import json

import joblib
import numpy as np
import pandas as pd
import pytest
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder

from app.data.ingest import ingest
from app.ml.features import build_feature_frame
from app.ml.model_card import ModelCard
from tests.conftest import FIXTURE_CSV

FEATURES = [
    {"name": "bedrooms", "dtype": "float"},
    {"name": "bathrooms", "dtype": "float"},
    {"name": "living_area_sqft", "dtype": "float", "required": True},
    {"name": "home_type", "dtype": "string", "default": "SINGLE_FAMILY"},
    {"name": "dist_downtown_mi", "source": "engineered:dist_downtown_mi"},
]


def card_dict(**overrides):
    card = {
        "name": "Test Ridge",
        "version": "0.0.1",
        "framework": "sklearn",
        "artifact": "model.joblib",
        "target_transform": "log1p",
        "features": FEATURES,
        "interval": {"method": "log_residual_quantiles", "lower": -0.2, "upper": 0.18, "coverage": 0.8},
        "metrics": {"mae": 61000, "rmse": 98000, "r2": 0.71, "evaluation": "20% holdout"},
        "training_data": {"source": "fixture", "period": "2024 listings", "rows": 1000},
    }
    card.update(overrides)
    return card


@pytest.fixture
def model_dir(tmp_path):
    df, _ = ingest(FIXTURE_CSV)
    df = df[df["living_area_sqft"].notna()]
    card = ModelCard.model_validate(card_dict())
    X, _ = build_feature_frame(df, card)
    numeric = ["bedrooms", "bathrooms", "living_area_sqft", "dist_downtown_mi"]
    pipe = make_pipeline(
        ColumnTransformer(
            [
                ("num", SimpleImputer(), numeric),
                ("cat", OneHotEncoder(handle_unknown="ignore"), ["home_type"]),
            ]
        ),
        Ridge(),
    )
    pipe.fit(X, np.log1p(df["list_price"]))
    folder = tmp_path / "model"
    folder.mkdir()
    joblib.dump(pipe, folder / "model.joblib")
    (folder / "model_card.json").write_text(json.dumps(card_dict()))
    return folder


def test_realtime_model_serves_predictions(client_factory, model_dir):
    client = client_factory(model_dir=model_dir)
    metrics = client.get("/api/model/metrics").json()
    assert metrics["realtime_status"] == "loaded"
    assert metrics["metrics"]["r2"] == 0.71  # passed through verbatim from the card

    item = client.get("/api/properties", params={"home_types": "SINGLE_FAMILY", "limit": 1}).json()["items"][0]
    r = client.post("/api/predict", json={"property_id": item["id"]})
    assert r.status_code == 200
    pred = r.json()["prediction"]
    assert pred["value"] > 0 and pred["low"] < pred["value"] < pred["high"]
    assert pred["interval_coverage"] == 0.8

    # What-if: override attributes of a dataset property.
    bigger = client.post(
        "/api/predict",
        json={"property_id": item["id"], "attributes": {"living_area_sqft": item["living_area_sqft"] * 2}},
    ).json()
    assert bigger["inputs"]["living_area_sqft"] == item["living_area_sqft"] * 2

    detail = client.get(f"/api/properties/{item['id']}").json()
    assert detail["valuation"]["status"] == "available" and detail["valuation"]["source"] == "realtime"


def test_required_feature_missing_is_reported(client_factory, model_dir):
    client = client_factory(model_dir=model_dir)
    r = client.post("/api/predict", json={"attributes": {"bedrooms": 3, "latitude": 29.76, "longitude": -95.37}})
    assert r.status_code == 422
    assert r.json()["missing_required"] == ["living_area_sqft"]


def test_leaky_model_card_is_refused(client_factory, model_dir):
    card = card_dict(features=FEATURES + [{"name": "zestimate"}])
    (model_dir / "model_card.json").write_text(json.dumps(card))
    client = client_factory(model_dir=model_dir)
    metrics = client.get("/api/model/metrics").json()
    assert metrics["realtime_status"] == "error" and "leaking" in metrics["realtime_error"]
    assert client.post("/api/predict", json={"attributes": {"living_area_sqft": 1000}}).status_code == 503


def test_batch_predictions_join_by_property_id(client_factory, tmp_path):
    ids = [p["id"] for p in client_factory().get("/api/properties", params={"limit": 3}).json()["items"]]
    preds = tmp_path / "predictions.csv"
    pd.DataFrame(
        {
            "property_id": ids + ["not-a-real-id"],
            "predicted_price": [410000, 520000, -5, 1],
            "predicted_low": [380000, None, None, None],
            "predicted_high": [450000, None, None, None],
            "model_name": "Team LGBM",
            "model_version": "1.2",
        }
    ).to_csv(preds, index=False)

    client = client_factory(predictions_path=preds, simulated_predictions=True)
    status = client.get("/api/model/metrics").json()
    assert status["batch"]["kind"] == "batch" and status["batch"]["matched"] == 2
    assert len(status["batch"]["warnings"]) == 2  # one non-positive value, one unknown id

    v = client.get(f"/api/properties/{ids[0]}").json()["valuation"]
    assert v["status"] == "available" and v["source"] == "batch"
    assert (v["value"], v["low"], v["high"]) == (410000, 380000, 450000)
    # Real predictions present -> no simulated values anywhere, even with the dev flag on.
    assert client.get(f"/api/properties/{ids[2]}").json()["valuation"]["status"] == "unavailable"

    filtered = client.get("/api/properties", params={"price_basis": "predicted", "min_price": 500000}).json()
    assert [i["id"] for i in filtered["items"]] == [ids[1]]
