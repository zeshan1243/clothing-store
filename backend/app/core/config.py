from decimal import Decimal
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, loaded from environment variables (and `.env` in development)."""

    # hide_input_in_errors: never echo settings (which include secrets) in startup errors.
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", hide_input_in_errors=True
    )

    environment: Literal["development", "test", "production"] = "development"

    database_url: str = "postgresql+psycopg://localhost:5432/clothing_store"
    test_database_url: str = "postgresql+psycopg://localhost:5432/clothing_store_test"

    jwt_secret: str = "change-me-insecure-development-only-secret-value"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 12
    # Storefront customer sessions (separate token type from admin tokens).
    customer_session_days: int = 30
    account_rate_limit_per_minute: int = 10

    # Public storefront URL (used for sitemap links), e.g. https://www.brand.qa
    site_url: str = "http://localhost:4200"
    # Optional error reporting. Leave empty to disable.
    sentry_dsn: str = ""

    # Comma-separated list of allowed frontend origins.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:4200"]

    # Abuse controls (per client IP, in-process; use a shared store if running multiple instances).
    login_rate_limit_per_minute: int = 10
    order_rate_limit_per_minute: int = 10

    # Commerce rules. Delivery: free inside the free zone (delivery areas marked free); elsewhere the
    # base fee plus a charge per started block of km from central Doha (see services/delivery.py).
    currency: str = "QAR"
    delivery_outside_base_fee: Decimal = Decimal("10.00")
    delivery_fee_per_step: Decimal = Decimal("1.00")
    delivery_step_km: int = 5
    free_delivery_threshold: Decimal | None = None
    low_stock_threshold: int = 3
    max_quantity_per_line: int = 10

    # Business details shown on invoices. Must be reviewed for the registered business before launch.
    business_name: str = "Brand Name"
    business_phone: str = ""
    business_email: str = ""
    business_address: str = "Doha, Qatar"
    business_registration: str = ""

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("jwt_secret")
    @classmethod
    def require_strong_secret_in_production(cls, value: str, info) -> str:
        if info.data.get("environment") == "production" and (
            value.startswith("change-me") or len(value) < 32
        ):
            raise ValueError("JWT_SECRET must be set to a random value of at least 32 characters in production")
        return value

    @model_validator(mode="after")
    def check_production_urls(self) -> "Settings":
        if self.environment != "production":
            return self
        if any("localhost" in o or "127.0.0.1" in o or not o.startswith("https://") for o in self.cors_origins):
            raise ValueError("In production CORS_ORIGINS must list only https:// storefront origins")
        if not self.site_url.startswith("https://"):
            raise ValueError("In production SITE_URL must be the https:// storefront URL")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
