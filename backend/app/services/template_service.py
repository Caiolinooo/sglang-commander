from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.template import PromptTemplate
from app.schemas.template import PromptTemplateCreate, PromptTemplateUpdate


class TemplateService:
    async def list_templates(self, db: AsyncSession) -> list[PromptTemplate]:
        result = await db.execute(select(PromptTemplate).order_by(PromptTemplate.created_at))
        return list(result.scalars().all())

    async def get_template(self, db: AsyncSession, template_id: int) -> PromptTemplate | None:
        result = await db.execute(select(PromptTemplate).where(PromptTemplate.id == template_id))
        return result.scalar_one_or_none()

    async def get_template_by_name(self, db: AsyncSession, name: str) -> PromptTemplate | None:
        result = await db.execute(select(PromptTemplate).where(PromptTemplate.name == name))
        return result.scalar_one_or_none()

    async def create_template(self, db: AsyncSession, data: PromptTemplateCreate) -> PromptTemplate:
        # Check if a template with this name already exists
        existing = await self.get_template_by_name(db, data.name)
        if existing:
            raise ValueError(f"Template with name '{data.name}' already exists.")
            
        template = PromptTemplate(
            name=data.name,
            content=data.content,
            description=data.description
        )
        db.add(template)
        await db.commit()
        await db.refresh(template)
        return template

    async def update_template(self, db: AsyncSession, template_id: int, data: PromptTemplateUpdate) -> PromptTemplate | None:
        result = await db.execute(select(PromptTemplate).where(PromptTemplate.id == template_id))
        template = result.scalar_one_or_none()
        if not template:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        if "name" in update_data and update_data["name"] != template.name:
            existing = await self.get_template_by_name(db, update_data["name"])
            if existing:
                raise ValueError(f"Template with name '{update_data['name']}' already exists.")

        for key, value in update_data.items():
            setattr(template, key, value)
            
        await db.commit()
        await db.refresh(template)
        return template

    async def delete_template(self, db: AsyncSession, template_id: int) -> bool:
        result = await db.execute(select(PromptTemplate).where(PromptTemplate.id == template_id))
        template = result.scalar_one_or_none()
        if not template:
            return False
        await db.delete(template)
        await db.commit()
        return True

    async def render_template(self, db: AsyncSession, template_id: int, inputs: dict) -> str | None:
        template = await self.get_template(db, template_id)
        if not template:
            return None
        return template.render(inputs)


template_service = TemplateService()
