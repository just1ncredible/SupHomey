"""Assistant tool loop with a fake OpenAI client (no network, no API key)."""

import json
from types import SimpleNamespace

import pytest

FILTERS = dict(
    min_price=None, max_price=None, price_basis="list", min_beds=None, min_baths=None,
    home_types=[], min_sqft=None, max_sqft=None, zipcode=None, city=None,
)


def call(name, args, call_id="call_1"):
    return SimpleNamespace(type="function_call", name=name, arguments=json.dumps(args), call_id=call_id)


def reasoning():
    return SimpleNamespace(type="reasoning", id="rs_1")


class FakeClient:
    """Replays scripted responses and records every request."""

    def __init__(self, script):
        self.script = list(script)
        self.requests = []
        self.responses = SimpleNamespace(create=self._create)

    def _create(self, **params):
        self.requests.append({**params, "input": list(params["input"])})
        step = self.script.pop(0)
        if isinstance(step, Exception):
            raise step
        output, text = step
        return SimpleNamespace(output=output, output_text=text)


@pytest.fixture
def assistant_client(client_factory):
    def make(script, **overrides):
        fake = FakeClient(script)
        return client_factory(openai_client=fake, **overrides), fake

    return make


def ask(client, question, **context):
    return client.post("/api/assistant/chat", json={"messages": [{"role": "user", "content": question}], "context": context})


def test_not_configured_without_key(client):
    assert client.get("/api/assistant/status").json()["configured"] is False
    body = ask(client, "hi").json()
    assert body["status"] == "not_configured" and "OPENAI_API_KEY" in body["reply"]


def test_search_tool_updates_map(assistant_client):
    args = {
        "filters": {**FILTERS, "min_beds": 3, "max_price": 300000},
        "sort": "none", "limit": 3, "within_current_map_view": False, "show_on_map": True,
    }
    client, fake = assistant_client([
        ([reasoning(), call("search_properties", args)], ""),
        ([], "I found 3-bedroom homes under $300K and updated the map."),
    ])
    body = ask(client, "Show me three-bedroom homes under $300k").json()
    assert body["status"] == "ok" and "updated the map" in body["reply"]
    action = body["actions"][0]
    assert action["type"] == "set_filters"
    assert action["filters"]["min_beds"] == 3 and action["filters"]["max_price"] == 300000
    assert body["cards"][0]["type"] == "properties"
    assert all(i["list_price"] <= 300000 and i["bedrooms"] >= 3 for i in body["cards"][0]["items"])

    # Second request must carry the reasoning item, the call, and the tool output back to the model.
    second = fake.requests[1]["input"]
    assert any(getattr(i, "type", None) == "reasoning" for i in second)
    outputs = [i for i in second if isinstance(i, dict) and i.get("type") == "function_call_output"]
    assert outputs and outputs[0]["call_id"] == "call_1"
    assert json.loads(outputs[0]["output"])["matching_listings"] > 0
    # Strict function schemas are sent.
    assert all(t["strict"] for t in fake.requests[0]["tools"])


def test_cheapest_in_zip_sorts_ascending(assistant_client):
    args = {
        "filters": {**FILTERS, "zipcode": "77494"},
        "sort": "price_asc", "limit": 5, "within_current_map_view": False, "show_on_map": True,
    }
    client, _ = assistant_client([([call("search_properties", args)], ""), ([], "Cheapest homes listed.")])
    body = ask(client, "What are the cheapest homes in 77494?").json()
    prices = [i["list_price"] for i in body["cards"][0]["items"]]
    assert prices == sorted(prices)
    assert body["actions"][0]["sort"] == "price_asc"


def test_area_comparison_and_stats(assistant_client):
    compare = {"group_by": "zipcode", "metric": "median_list_price", "order": "asc", "limit": 3, "min_listings": 5, "filters": FILTERS}
    stats = {"area_type": "city", "area": "katy", "filters": FILTERS}
    client, _ = assistant_client([
        ([call("compare_areas", compare, "c1"), call("area_statistics", stats, "c2")], ""),
        ([], "Here you go."),
    ])
    body = ask(client, "Where are prices lower, and what's the average in Katy?").json()
    table = next(c for c in body["cards"] if c["type"] == "area_table")
    medians = [r["median_list_price"] for r in table["rows"]]
    assert medians == sorted(medians)
    stat = next(c for c in body["cards"] if c["type"] == "stats")["stats"]
    assert stat["area"] == "Katy" and stat["mean_list_price"] > 0 and stat["median_list_price"] > 0


def test_get_property_uses_selection_and_reports_unavailable_valuation(assistant_client, client_factory):
    pid = client_factory().get("/api/properties", params={"limit": 1}).json()["items"][0]["id"]
    client, fake = assistant_client([([call("get_property", {"property_id": None})], ""), ([], "No AI estimate yet.")])
    body = ask(client, "Why is this home estimated at $350k?", selected_property_id=pid).json()
    assert body["actions"][0]["type"] == "select_property" and body["actions"][0]["property"]["id"] == pid
    output = next(i for i in fake.requests[1]["input"] if isinstance(i, dict) and i.get("type") == "function_call_output")
    data = json.loads(output["output"])
    assert data["valuation"]["status"] == "unavailable" and data["explanation"]["available"] is False
    assert pid in fake.requests[0]["instructions"]  # selection passed as context


def test_clarifying_question_needs_no_tools(assistant_client):
    client, _ = assistant_client([([], "What's your monthly budget, and do you want to rent or buy?")])
    body = ask(client, "If I was broke, where should I live?").json()
    assert body["status"] == "ok" and body["tools_used"] == [] and "budget" in body["reply"]


def test_bad_tool_arguments_are_reported_to_model(assistant_client):
    client, fake = assistant_client([
        ([call("area_statistics", {"area_type": "city", "area": "Atlantis", "filters": FILTERS})], ""),
        ([], "Atlantis isn't in the dataset."),
    ])
    ask(client, "Average price in Atlantis?")
    output = next(i for i in fake.requests[1]["input"] if isinstance(i, dict) and i.get("type") == "function_call_output")
    assert "not in the dataset" in json.loads(output["output"])["error"]


def test_openai_errors_return_friendly_message(assistant_client):
    AuthenticationError = type("AuthenticationError", (Exception,), {})
    client, _ = assistant_client([AuthenticationError("bad key")])
    body = ask(client, "hi").json()
    assert body["status"] == "error" and "API key" in body["reply"]


def test_tool_round_limit_forces_final_answer(assistant_client):
    args = {"area_type": "all", "area": None, "filters": FILTERS}
    looping = [([call("area_statistics", args, f"c{i}")], "") for i in range(6)]
    client, fake = assistant_client([*looping, ([], "Final summary.")])
    body = ask(client, "stats please").json()
    assert body["reply"] == "Final summary."
    assert fake.requests[-1]["tool_choice"] == "none"
