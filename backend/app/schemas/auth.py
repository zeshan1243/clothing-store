from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import AdminRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class AdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr
    role: AdminRole
    is_active: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    admin: AdminOut


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)


class AdminNameUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class ActivityItem(BaseModel):
    id: int
    action: str
    entity_type: str
    entity_id: int | None
    # Short human context (e.g. order number or SKU) when the log entry has one.
    label: str | None
    created_at: datetime


class TeamMember(BaseModel):
    id: int
    name: str
    role: AdminRole
    is_active: bool
    last_login_at: datetime | None


class AdminProfileStats(BaseModel):
    orders_confirmed: int
    deliveries_done: int
    open_assigned: int
    cash_collected: str
    actions_30d: int


class AdminProfile(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: AdminRole
    created_at: datetime
    last_login_at: datetime | None
    stats: AdminProfileStats
    recent_activity: list[ActivityItem]
    team: list[TeamMember]
