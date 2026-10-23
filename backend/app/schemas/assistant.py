from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

from app.schemas.property import PropertyMarker


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class MapFilters(BaseModel):
    """Filters in API parameter form (same names as GET /api/properties)."""

    price_basis: Literal["list", "predicted"] = "list"
    min_price: float | None = None
    max_price: float | None = None
    min_beds: float | None = None
    min_baths: float | None = None
    home_types: list[str] = []
    min_sqft: float | None = None
    max_sqft: float | None = None
    zipcode: str | None = None
    city: str | None = None


class AssistantContext(BaseModel):
    """What the user is looking at, so questions like 'this home' resolve."""

    selected_property_id: str | None = None
    map_bbox: tuple[float, float, float, float] | None = None
    filters: MapFilters | None = None


class AssistantRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
    context: AssistantContext = AssistantContext()


SortKey = Literal["price_asc", "price_desc", "sqft_desc", "price_per_sqft_asc"]


class SetFiltersAction(BaseModel):
    type: Literal["set_filters"] = "set_filters"
    filters: MapFilters
    sort: SortKey | None = None
    bounds: tuple[float, float, float, float] | None = Field(default=None, description="south, west, north, east")


class SelectPropertyAction(BaseModel):
    type: Literal["select_property"] = "select_property"
    property: PropertyMarker


Action = Annotated[SetFiltersAction | SelectPropertyAction, Field(discriminator="type")]


class PropertiesCard(BaseModel):
    type: Literal["properties"] = "properties"
    title: str
    total: int
    items: list[PropertyMarker]


class AreaRow(BaseModel):
    area: str
    kind: Literal["zipcode", "city"]
    listings: int
    median_list_price: float | None
    mean_list_price: float | None
    median_price_per_sqft: float | None
    median_rent_zestimate: float | None
    bounds: tuple[float, float, float, float]


class AreaTableCard(BaseModel):
    type: Literal["area_table"] = "area_table"
    title: str
    metric: str
    rows: list[AreaRow]


class StatsCard(BaseModel):
    type: Literal["stats"] = "stats"
    title: str
    stats: dict[str, Any]


Card = Annotated[PropertiesCard | AreaTableCard | StatsCard, Field(discriminator="type")]


class ToolTrace(BaseModel):
    name: str
    arguments: dict[str, Any]


class AssistantResponse(BaseModel):
    status: Literal["ok", "not_configured", "error"]
    reply: str
    actions: list[Action] = []
    cards: list[Card] = []
    tools_used: list[ToolTrace] = []
    model: str | None = None


class AssistantStatus(BaseModel):
    configured: bool
    model: str
    message: str
