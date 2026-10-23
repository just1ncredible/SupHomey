def test_health_reports_synthetic_fixture(client):
    body = client.get("/api/health").json()
    assert body["dataset"]["source"] == "synthetic_fixture"
    assert body["dataset"]["is_synthetic"] is True
    assert body["status"] == "degraded"
    assert body["model_status"] == "not_installed"
    assert body["predictions"] == "none"


def test_properties_list_and_filters(client):
    all_ = client.get("/api/properties", params={"limit": 5000}).json()
    assert all_["total"] == len(all_["items"]) == 1500

    filtered = client.get(
        "/api/properties",
        params={"min_beds": 4, "home_types": "SINGLE_FAMILY", "min_price": 300000, "limit": 5000},
    ).json()
    assert 0 < filtered["total"] < all_["total"]
    for item in filtered["items"]:
        assert item["bedrooms"] >= 4 and item["home_type"] == "SINGLE_FAMILY" and item["list_price"] >= 300000

    bbox = client.get("/api/properties", params={"bbox": "29.7,-95.5,29.8,-95.3", "limit": 5000}).json()
    assert all(29.7 <= i["lat"] <= 29.8 and -95.5 <= i["lng"] <= -95.3 for i in bbox["items"])

    page = client.get("/api/properties", params={"limit": 10, "offset": 5}).json()
    assert len(page["items"]) == 10 and page["total"] == 1500


def test_bad_bbox_rejected(client):
    assert client.get("/api/properties", params={"bbox": "1,2,3"}).status_code == 422
    assert client.get("/api/properties", params={"bbox": "30,-95,29,-96"}).status_code == 422


def test_property_detail_without_model_is_explicitly_unavailable(client):
    item = client.get("/api/properties", params={"limit": 1}).json()["items"][0]
    detail = client.get(f"/api/properties/{item['id']}").json()
    assert detail["valuation"]["status"] == "unavailable"
    assert detail["valuation"]["value"] is None
    assert "model not connected" in detail["valuation"]["message"]
    assert client.get("/api/properties/does-not-exist").status_code == 404


def test_search_by_address_zip_and_city(client):
    body = client.get("/api/search", params={"q": "100 Fixture"}).json()
    assert body["properties"][0]["street_address"].startswith("100 Fixture")
    assert any(z["zipcode"] == "77494" for z in client.get("/api/search", params={"q": "7749"}).json()["zipcodes"])
    assert client.get("/api/search", params={"q": "kat"}).json()["cities"][0]["city"] == "Katy"


def test_market_summary_scopes(client):
    dataset = client.get("/api/market/summary").json()
    assert dataset["scope"]["kind"] == "dataset" and dataset["count"] == 1500
    assert sum(b["count"] for b in dataset["list_price_distribution"]) == 1500
    assert dataset["median_predicted_price"] is None

    view = client.get("/api/market/summary", params={"bbox": "29.7,-95.5,29.8,-95.3", "min_beds": 3}).json()
    assert view["scope"]["kind"] == "viewport_filtered"
    assert view["count"] < dataset["count"]


def test_predict_without_model_returns_503_and_no_value(client):
    item = client.get("/api/properties", params={"limit": 1}).json()["items"][0]
    r = client.post("/api/predict", json={"property_id": item["id"]})
    assert r.status_code == 503
    assert r.json()["status"] == "model_unavailable" and r.json()["prediction"] is None


def test_predict_rejects_leakage_and_unknown_fields(client):
    r = client.post("/api/predict", json={"attributes": {"bedrooms": 3, "extra": {"zestimate": 400000}}})
    assert r.status_code == 422 and r.json()["status"] == "invalid_input"
    assert client.post("/api/predict", json={"attributes": {"list_price": 1}}).status_code == 422


def test_simulated_predictions_are_labelled(client_factory):
    client = client_factory(simulated_predictions=True)
    item = client.get("/api/properties", params={"limit": 1}).json()["items"][0]
    assert item["valuation_kind"] == "simulated"
    valuation = client.get(f"/api/properties/{item['id']}").json()["valuation"]
    assert valuation["status"] == "simulated" and "Simulated — UI Preview" in valuation["message"]
    assert client.get("/api/model/metrics").json()["metrics"] is None
