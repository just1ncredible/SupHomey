"""Centralised application settings, loaded from environment variables / backend/.env."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="HOMESCOPE_",
        env_file=BACKEND_DIR / ".env",
        extra="ignore",
        protected_namespaces=(),
    )

    data_dir: Path = Path("data/raw")
    clean_csv: str = "houston_housing_2024_clean.csv"
    details_csv: str = "houston_listing_details.csv"
    fixture_csv: Path = Path("data/fixtures/synthetic_properties.csv")
    allow_fixture_fallback: bool = True

    model_dir: Path = Path("models/current")
    predictions_path: Path = Path("models/predictions/predictions.csv")
    simulated_predictions: bool = False

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Hard cap on markers returned by a single /api/properties request.
    max_page_size: int = 30000

    def resolve(self, path: Path) -> Path:
        return path if path.is_absolute() else REPO_ROOT / path

    @property
    def clean_csv_path(self) -> Path:
        return self.resolve(self.data_dir) / self.clean_csv

    @property
    def details_csv_path(self) -> Path:
        return self.resolve(self.data_dir) / self.details_csv

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
