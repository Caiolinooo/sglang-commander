from pydantic import BaseModel, Field
from typing import Optional, Any


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(system|user|assistant)$")
    content: str | list[dict[str, Any]] = Field(...)


class ChatRequest(BaseModel):
    model: str = "default"
    messages: list[ChatMessage]
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    top_p: float = Field(default=0.95, ge=0.0, le=1.0)
    max_tokens: int = Field(default=4096, ge=1)
    stream: bool = Field(default=True)
    frequency_penalty: float = Field(default=0.0, ge=-2.0, le=2.0)
    presence_penalty: float = Field(default=0.0, ge=-2.0, le=2.0)
    stop: Optional[list[str]] = None


class ChatResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    choices: list[dict[str, Any]]
    usage: Optional[dict[str, int]] = None
