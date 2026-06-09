from pydantic import BaseModel, Field
from typing import Optional, Any


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(system|user|assistant|tool)$")
    content: str | list[dict[str, Any]] | None = None
    name: Optional[str] = None
    tool_calls: Optional[list[dict[str, Any]]] = None
    tool_call_id: Optional[str] = None


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
    tools: Optional[list[dict[str, Any]]] = None
    tool_choice: Optional[str | dict[str, Any]] = None
    response_format: Optional[dict[str, Any]] = None
    n: int = Field(default=1, ge=1, le=10)
    logprobs: Optional[bool] = None
    top_logprobs: Optional[int] = Field(default=None, ge=0, le=20)
    seed: Optional[int] = None
    enable_thinking: Optional[bool] = None
    rag_collection: Optional[str] = None
    rag_top_k: Optional[int] = Field(5, ge=1, le=50)


class ChatResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    choices: list[dict[str, Any]]
    usage: Optional[dict[str, int]] = None
