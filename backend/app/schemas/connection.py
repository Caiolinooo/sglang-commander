from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ConnectionProfileCreate(BaseModel):
    name: str = Field(..., max_length=128)
    host: str = Field(..., max_length=256)
    port: int = Field(default=22, ge=1, le=65535)
    username: str = Field(..., max_length=128)
    auth_method: str = Field(default="key", pattern="^(password|key)$")
    password: Optional[str] = Field(None, max_length=256)
    key_path: Optional[str] = Field(None, max_length=512)
    remote_forward_port: int = Field(default=30000, ge=1, le=65535)
    local_bind_port: int = Field(default=30001, ge=1, le=65535)


class ConnectionProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=128)
    host: Optional[str] = Field(None, max_length=256)
    port: Optional[int] = Field(None, ge=1, le=65535)
    username: Optional[str] = Field(None, max_length=128)
    auth_method: Optional[str] = Field(None, pattern="^(password|key)$")
    password: Optional[str] = Field(None, max_length=256)
    key_path: Optional[str] = Field(None, max_length=512)
    remote_forward_port: Optional[int] = Field(None, ge=1, le=65535)
    local_bind_port: Optional[int] = Field(None, ge=1, le=65535)


class ConnectionProfileResponse(BaseModel):
    id: int
    name: str
    host: str
    port: int
    username: str
    auth_method: str
    key_path: Optional[str] = None
    remote_forward_port: int
    local_bind_port: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConnectionTestRequest(BaseModel):
    host: str
    port: int = 22
    username: str
    auth_method: str
    password: Optional[str] = None
    key_path: Optional[str] = None
