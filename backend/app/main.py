"""HomeScope API.

    uvicorn app.main:app --reload --port 8000     (from the backend/ folder)
"""

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app import __version__
from app.config import Settings, get_settings
from app.assistant.agent import Assistant
from app.routes import assistant, health, market, model, properties
from app.services.container import build_services

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s: %(message)s")


def create_app(settings: Settings | None = None, openai_client: Any | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.services = build_services(settings)
        app.state.assistant = Assistant(settings, client=openai_client)
        yield

    app = FastAPI(
        title="HomeScope API",
        version=__version__,
        description=(
            "Home Value Explorer backend. Serves 2024 Houston listing records, descriptive market "
            "statistics, and ML valuations from a pluggable model bundle."
        ),
        lifespan=lifespan,
    )
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    for module in (health, properties, market, model, assistant):
        app.include_router(module.router)
    return app


app = create_app()
