"""'Ask SupHomey': answers natural-language questions about the dataset with OpenAI tool calling.

The model never sees the raw table. It calls the tools in tools.py, which query the same
repository the map uses, and must ground every number in a tool result.
"""

from __future__ import annotations

import logging
from typing import Any

from app.assistant.tools import TOOL_SCHEMAS, run_tool, to_json
from app.config import Settings
from app.schemas.assistant import AssistantContext, AssistantRequest, AssistantResponse, ToolTrace
from app.services.container import Services
from app.services.serialize import clean

logger = logging.getLogger(__name__)

MAX_HISTORY = 12

SYSTEM_PROMPT = """You are SupHomey's housing data assistant for Greater Houston.

DATA YOU CAN USE
- A 2024 Zillow listing snapshot (~26,000 homes for sale, Kaggle "Houston Housing Market 2024").
  Prices are 2024 ASKING prices, not sale prices; homes may no longer be for sale. Say "listed at".
- It is a sample of listings, not the whole market. Describe statistics as "in this dataset".
- Zillow Zestimate / Rent Zestimate / tax assessed values are third-party figures. Never call them
  SupHomey's AI estimate. Rent Zestimates are the only rent data; label them as Zillow estimates.
- AI estimates exist only if the tools return them. If a valuation's status is "unavailable", say the
  AI valuation is not connected yet. Never derive an "estimate" yourself.

HOW TO ANSWER
- Get every number from a tool call in this conversation. Never invent or recall figures.
- "Show me / find" requests: call search_properties with show_on_map=true so the map updates. Then
  briefly say what you applied and how many listings match.
- "Cheapest / most expensive in X": search_properties with the matching sort and the area filter.
- "Where are prices lower/higher": compare_areas (default by ZIP, median_list_price, min_listings 15).
  Mention a few areas by name/ZIP with their medians.
- "Average price in X": area_statistics. Report the median and the mean, and explain briefly that the
  median is the better typical figure when they differ a lot.
- "Why is this home estimated at…": get_property (property_id null = the selected home). Report the
  actual AI estimate and its source/model. If no explanation is available, say so plainly. You may
  list the model's inputs and the home's own characteristics, but do not claim how much any factor
  contributed.
- "Homes" or "houses" usually means excluding LOT (vacant land) unless the user asks for land.
- Vague or personal-finance questions (e.g. "I'm broke, where should I live?"): don't guess. First ask
  1-2 short clarifying questions: monthly or total budget, and whether they want to rent or buy. Do not
  call tools until you know. When suggesting areas, use data and note this isn't financial advice.
- Questions outside Houston housing or this dataset: say what you can help with instead.

STYLE
- Concise: 2-5 sentences or a short bullet list. Use $ amounts like $285,000 or $285K.
- The UI shows result cards (property lists, area tables, stats) next to your reply, so summarise
  rather than repeating every row.
"""


def _context_block(services: Services, ctx: AssistantContext) -> str:
    lines = [f"Dataset: {'SYNTHETIC development fixture (not real listings)' if services.dataset.is_synthetic else 'real 2024 Houston listings'}, {services.repo.total:,} records."]
    pred = services.predictions_kind
    model_state = services.predictor.state
    lines.append(
        "AI valuations: "
        + {
            "batch": "precomputed team predictions loaded.",
            "simulated": "SIMULATED UI-preview values only (not a real model; always say so).",
            "none": "real-time model loaded." if model_state == "loaded" else "NOT connected (no AI estimates exist).",
        }[pred]
    )
    if ctx.selected_property_id:
        row = services.repo.get(ctx.selected_property_id)
        if row is not None:
            lines.append(
                f"User has selected property {ctx.selected_property_id}: {clean(row['street_address'])}, "
                f"{clean(row['city'])} {clean(row['zipcode'])}."
            )
    if ctx.filters:
        active = {k: v for k, v in ctx.filters.model_dump().items() if v not in (None, [], "list")}
        if active:
            lines.append(f"Current map filters: {active}.")
    return "\n".join(["", "CURRENT CONTEXT", *lines])


class Assistant:
    def __init__(self, settings: Settings, client: Any | None = None):
        self.settings = settings
        key = settings.openai_api_key.get_secret_value().strip() if settings.openai_api_key else ""
        self.configured = bool(key) or client is not None
        self._client = client
        self._key = key

    @property
    def client(self) -> Any:
        if self._client is None:
            from openai import OpenAI

            self._client = OpenAI(api_key=self._key, timeout=60, max_retries=1)
        return self._client

    def _create(self, input_items: list[Any], instructions: str, allow_tools: bool) -> Any:
        params: dict[str, Any] = {
            "model": self.settings.openai_model,
            "instructions": instructions,
            "input": input_items,
            "tools": TOOL_SCHEMAS,
        }
        if not allow_tools:
            params["tool_choice"] = "none"
        if self.settings.openai_reasoning_effort:
            params["reasoning"] = {"effort": self.settings.openai_reasoning_effort}
        return self.client.responses.create(**params)

    def chat(self, request: AssistantRequest, services: Services) -> AssistantResponse:
        if not self.configured:
            return AssistantResponse(
                status="not_configured",
                reply="AI search isn't set up yet. Add OPENAI_API_KEY to backend/.env and restart the API.",
            )

        instructions = SYSTEM_PROMPT + _context_block(services, request.context)
        input_items: list[Any] = [{"role": m.role, "content": m.content} for m in request.messages[-MAX_HISTORY:]]
        actions, cards, traces = [], [], []

        try:
            response = None
            for round_ in range(self.settings.assistant_max_tool_rounds + 1):
                last_round = round_ == self.settings.assistant_max_tool_rounds
                response = self._create(input_items, instructions, allow_tools=not last_round)
                calls = [item for item in response.output if getattr(item, "type", None) == "function_call"]
                if not calls:
                    break
                # Reasoning items must accompany tool outputs, so keep the whole output.
                input_items += response.output
                for call in calls:
                    args, result = run_tool(call.name, call.arguments, services, request.context)
                    traces.append(ToolTrace(name=call.name, arguments=args))
                    actions += result.actions
                    cards += result.cards
                    input_items.append({"type": "function_call_output", "call_id": call.call_id, "output": to_json(result.data)})
            reply = (response.output_text if response is not None else "") or "I couldn't produce an answer for that."
        except Exception as exc:  # noqa: BLE001 - surface OpenAI/network errors to the UI
            logger.exception("Assistant request failed")
            return AssistantResponse(status="error", reply=_friendly_error(exc), tools_used=traces, model=self.settings.openai_model)

        # Only the latest map change and selection matter; keep cards in call order.
        last_filters = next((a for a in reversed(actions) if a.type == "set_filters"), None)
        last_select = next((a for a in reversed(actions) if a.type == "select_property"), None)
        final_actions = [a for a in (last_filters, last_select) if a is not None]
        return AssistantResponse(status="ok", reply=reply.strip(), actions=final_actions, cards=cards[-4:], tools_used=traces, model=self.settings.openai_model)


def _friendly_error(exc: Exception) -> str:
    name = type(exc).__name__
    if name == "AuthenticationError":
        return "OpenAI rejected the API key. Check OPENAI_API_KEY in backend/.env."
    if name == "RateLimitError":
        return "OpenAI rate limit or quota reached. Try again shortly, or check your OpenAI billing."
    if name == "NotFoundError":
        return "The configured OpenAI model wasn't found. Check HOMESCOPE_OPENAI_MODEL in backend/.env."
    if name in ("APIConnectionError", "APITimeoutError"):
        return "Couldn't reach OpenAI. Check your internet connection and try again."
    return f"The AI request failed ({name}). Try rephrasing or try again."
