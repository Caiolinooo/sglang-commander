import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import async_session_factory
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from app.models.user import User
from app.models.session import Session
from app.models.api_key import ApiKey


class AuthService:
    async def is_setup_complete(self) -> bool:
        return os.path.exists(settings.setup_complete_file)

    async def complete_setup(self, username: str, email: str, password: str) -> dict:
        async with async_session_factory() as db:
            user = User(
                username=username,
                email=email,
                password_hash=hash_password(password),
                is_admin=True,
            )
            db.add(user)
            await db.flush()

            access = create_access_token({"sub": str(user.id)})
            refresh = create_refresh_token({"sub": str(user.id)})

            expires = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_expire_days)
            session = Session(user_id=user.id, refresh_token=refresh, expires_at=expires)
            db.add(session)
            await db.commit()

            with open(settings.setup_complete_file, "w") as f:
                f.write(f"setup_at={datetime.now(timezone.utc).isoformat()}\n")

            return {
                "access_token": access,
                "refresh_token": refresh,
                "token_type": "bearer",
                "user": {"id": user.id, "username": user.username, "email": user.email},
            }

    async def login(self, username: str, password: str) -> Optional[dict]:
        async with async_session_factory() as db:
            result = await db.execute(select(User).where(User.username == username))
            user = result.scalar_one_or_none()

            if not user or not verify_password(password, user.password_hash):
                return None

            access = create_access_token({"sub": str(user.id)})
            refresh = create_refresh_token({"sub": str(user.id)})

            expires = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_expire_days)
            session = Session(user_id=user.id, refresh_token=refresh, expires_at=expires)
            db.add(session)
            await db.commit()

            return {
                "access_token": access,
                "refresh_token": refresh,
                "token_type": "bearer",
                "user": {"id": user.id, "username": user.username, "email": user.email},
            }

    async def refresh_token(self, refresh_token: str) -> Optional[dict]:
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            return None

        async with async_session_factory() as db:
            result = await db.execute(
                select(Session).where(Session.refresh_token == refresh_token)
            )
            session = result.scalar_one_or_none()
            if not session:
                return None

            expires_at = session.expires_at.replace(tzinfo=timezone.utc) if session.expires_at.tzinfo is None else session.expires_at
            if expires_at < datetime.now(timezone.utc):
                await db.delete(session)
                await db.commit()
                return None

            user_id = int(payload["sub"])
            new_access = create_access_token({"sub": str(user_id)})
            new_refresh = create_refresh_token({"sub": str(user_id)})

            await db.delete(session)
            expires = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_expire_days)
            new_session = Session(user_id=user_id, refresh_token=new_refresh, expires_at=expires)
            db.add(new_session)
            await db.commit()

            return {
                "access_token": new_access,
                "refresh_token": new_refresh,
                "token_type": "bearer",
            }

    async def change_password(self, user_id: int, current_password: str, new_password: str) -> bool:
        async with async_session_factory() as db:
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if not user or not verify_password(current_password, user.password_hash):
                return False

            user.password_hash = hash_password(new_password)
            await db.commit()
            return True

    async def create_api_key(self, user_id: int, name: str, scopes: str = "read") -> dict:
        key = f"sglc_{secrets.token_hex(32)}"
        async with async_session_factory() as db:
            api_key = ApiKey(user_id=user_id, name=name, key=key, scopes=scopes)
            db.add(api_key)
            await db.commit()
            return {"id": api_key.id, "name": name, "key": key, "scopes": scopes}

    async def list_api_keys(self, user_id: int) -> list[dict]:
        async with async_session_factory() as db:
            result = await db.execute(
                select(ApiKey).where(ApiKey.user_id == user_id).order_by(ApiKey.created_at.desc())
            )
            keys = result.scalars().all()
            return [
                {
                    "id": k.id,
                    "name": k.name,
                    "key": k.key[:12] + "..." if len(k.key) > 12 else k.key,
                    "scopes": k.scopes,
                    "is_active": k.is_active,
                    "last_used_at": k.last_used_at,
                    "created_at": k.created_at,
                }
                for k in keys
            ]

    async def revoke_api_key(self, user_id: int, key_id: int) -> bool:
        async with async_session_factory() as db:
            result = await db.execute(
                select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user_id)
            )
            key = result.scalar_one_or_none()
            if not key:
                return False
            key.is_active = False
            await db.commit()
            return True

    async def get_user(self, user_id: int) -> Optional[dict]:
        async with async_session_factory() as db:
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if user:
                return {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "is_admin": user.is_admin,
                    "created_at": user.created_at,
                }
            return None


auth_service = AuthService()
