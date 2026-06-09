from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class PromptTemplateCreate(BaseModel):
    name: str = Field(..., max_length=128, description="Unique name for the template")
    content: str = Field(..., description="Template content with placeholders (e.g. {var})")
    description: Optional[str] = Field(None, max_length=256, description="Optional description of the template")


class PromptTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=128)
    content: Optional[str] = None
    description: Optional[str] = Field(None, max_length=256)


class PromptTemplateResponse(BaseModel):
    id: int
    name: str
    content: str
    description: Optional[str] = None
    placeholders: List[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TemplateRenderRequest(BaseModel):
    inputs: Dict[str, Any] = Field(default_factory=dict, description="Variables to substitute into the template")


class TemplateRenderResponse(BaseModel):
    rendered: str = Field(..., description="The template populated with input values")
