from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.server_config import ServerConfig
from app.schemas.server import ServerProfileCreate, ServerProfileUpdate


class ServerProfileService:
    async def list_profiles(self, db: AsyncSession) -> list[dict]:
        result = await db.execute(select(ServerConfig).order_by(ServerConfig.created_at))
        profiles = []
        for row in result.scalars():
            profiles.append(self._to_dict(row))
        return profiles

    async def get_profile(self, db: AsyncSession, profile_id: int) -> dict | None:
        result = await db.execute(select(ServerConfig).where(ServerConfig.id == profile_id))
        row = result.scalar_one_or_none()
        return self._to_dict(row) if row else None

    async def create_profile(self, db: AsyncSession, data: ServerProfileCreate) -> dict:
        profile = ServerConfig(
            name=data.name,
            model_path=data.model_path,
            host=data.host,
            port=data.port,
            args_json=data.args_json,
            is_remote=data.is_remote,
            remote_url=data.remote_url,
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
        return self._to_dict(profile)

    async def update_profile(self, db: AsyncSession, profile_id: int, data: ServerProfileUpdate) -> dict | None:
        result = await db.execute(select(ServerConfig).where(ServerConfig.id == profile_id))
        profile = result.scalar_one_or_none()
        if not profile:
            return None
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(profile, key, value)
        await db.commit()
        await db.refresh(profile)
        return self._to_dict(profile)

    async def delete_profile(self, db: AsyncSession, profile_id: int) -> bool:
        result = await db.execute(select(ServerConfig).where(ServerConfig.id == profile_id))
        profile = result.scalar_one_or_none()
        if not profile:
            return False
        await db.delete(profile)
        await db.commit()
        return True

    async def set_active(self, db: AsyncSession, profile_id: int) -> dict | None:
        await db.execute(delete(ServerConfig).where(ServerConfig.is_active == True))
        result = await db.execute(select(ServerConfig).where(ServerConfig.id == profile_id))
        profile = result.scalar_one_or_none()
        if not profile:
            return None
        profile.is_active = True
        await db.commit()
        await db.refresh(profile)
        return self._to_dict(profile)

    async def get_active(self, db: AsyncSession) -> dict | None:
        result = await db.execute(select(ServerConfig).where(ServerConfig.is_active == True))
        row = result.scalar_one_or_none()
        return self._to_dict(row) if row else None

    def _to_dict(self, profile: ServerConfig) -> dict:
        return {
            "id": profile.id,
            "name": profile.name,
            "model_path": profile.model_path,
            "host": profile.host,
            "port": profile.port,
            "args_json": profile.args_json,
            "is_active": profile.is_active,
            "is_remote": profile.is_remote,
            "remote_url": profile.remote_url,
            "created_at": profile.created_at.isoformat() if profile.created_at else None,
            "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
        }


server_profile_service = ServerProfileService()
