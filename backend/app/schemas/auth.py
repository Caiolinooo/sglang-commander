from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


class SetupRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    email: EmailStr
    password: str = Field(..., min_length=8)
    server_port: int = Field(default=8080, ge=1024, le=65535)
    server_name: str = Field(default="My SGLang Server")
    huggingface_token: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    is_admin: bool
    created_at: datetime

    class Config:
        from_attributes = True


class SetupStatusResponse(BaseModel):
    setup_complete: bool


class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    scopes: str = Field(default="read", pattern="^(read|write|admin)$")


class ApiKeyResponse(BaseModel):
    id: int
    name: str
    key: str
    scopes: str
    is_active: bool
    last_used_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
