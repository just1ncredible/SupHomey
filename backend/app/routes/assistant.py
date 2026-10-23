from fastapi import APIRouter, Depends, Request

from app.assistant.agent import Assistant
from app.schemas.assistant import AssistantRequest, AssistantResponse, AssistantStatus
from app.services.container import Services, get_services

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


def get_assistant(request: Request) -> Assistant:
    return request.app.state.assistant


@router.get("/status", response_model=AssistantStatus)
def assistant_status(assistant: Assistant = Depends(get_assistant)):
    """Whether AI search is configured (an OpenAI key is present)."""
    return AssistantStatus(
        configured=assistant.configured,
        model=assistant.settings.openai_model,
        message="Ready." if assistant.configured else "Add OPENAI_API_KEY to backend/.env and restart the API.",
    )


@router.post("/chat", response_model=AssistantResponse)
def chat(body: AssistantRequest, assistant: Assistant = Depends(get_assistant), services: Services = Depends(get_services)):
    """Answer a question about the housing data. Questions are sent to OpenAI; data stays local
    except for the tool results the model needs to answer."""
    return assistant.chat(body, services)
