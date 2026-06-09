from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.template import (
    PromptTemplateCreate,
    PromptTemplateUpdate,
    PromptTemplateResponse,
    TemplateRenderRequest,
    TemplateRenderResponse,
)
from app.services.template_service import template_service

router = APIRouter()


def _to_response(template) -> PromptTemplateResponse:
    return PromptTemplateResponse(
        id=template.id,
        name=template.name,
        content=template.content,
        description=template.description,
        placeholders=template.get_placeholders(),
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@router.get("", response_model=List[PromptTemplateResponse])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    templates = await template_service.list_templates(db)
    return [_to_response(t) for t in templates]


@router.get("/{template_id}", response_model=PromptTemplateResponse)
async def get_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = await template_service.get_template(db, template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )
    return _to_response(template)


@router.post("", response_model=PromptTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    data: PromptTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        template = await template_service.create_template(db, data)
        return _to_response(template)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.put("/{template_id}", response_model=PromptTemplateResponse)
async def update_template(
    template_id: int,
    data: PromptTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        template = await template_service.update_template(db, template_id, data)
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found",
            )
        return _to_response(template)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ok = await template_service.delete_template(db, template_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )
    return None


@router.post("/{template_id}/render", response_model=TemplateRenderResponse)
async def render_template(
    template_id: int,
    data: TemplateRenderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rendered = await template_service.render_template(db, template_id, data.inputs)
    if rendered is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )
    return TemplateRenderResponse(rendered=rendered)
