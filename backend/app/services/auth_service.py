import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select

from app.config import settings
from app.core.database import async_session_factory
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from app.models.user import User
from app.models.session import Session
from app.models.api_key import ApiKey


class AuthService:
    async def is_setup_complete(self) -> bool:
        setup_file = settings.resolved_setup_complete_file
        if not os.path.exists(setup_file):
            return False
        async with async_session_factory() as db:
            result = await db.execute(select(User).limit(1))
            return result.scalar_one_or_none() is not None

    def _save_env_var(self, key: str, value: str) -> None:
        env_path = ".env"
        lines = []
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                lines = f.readlines()
        found = False
        with open(env_path, "w") as f:
            for line in lines:
                if line.strip().startswith(f"{key}="):
                    f.write(f"{key}={value}\n")
                    found = True
                else:
                    f.write(line)
            if not found:
                f.write(f"{key}={value}\n")

    async def complete_setup(self, username: str, email: str, password: str, huggingface_token: Optional[str] = None) -> dict:
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

            with open(settings.resolved_setup_complete_file, "w") as f:
                f.write(f"setup_at={datetime.now(timezone.utc).isoformat()}\n")

            if huggingface_token:
                self._save_env_var("HUGGINGFACE_TOKEN", huggingface_token)

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
            await db.refresh(api_key)
            return {
                "id": api_key.id,
                "name": name,
                "key": key,
                "scopes": scopes,
                "is_active": api_key.is_active,
                "last_used_at": api_key.last_used_at,
                "created_at": api_key.created_at,
            }

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

    async def logout(self, user_id: int) -> None:
        from app.models.session import Session
        async with async_session_factory() as db:
            await db.execute(Session.__table__.delete().where(Session.user_id == user_id))
            await db.commit()

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

    async def reset_database(self) -> dict:
        setup_file = settings.resolved_setup_complete_file
        db_url = settings.resolved_database_url
        db_path = db_url.replace("sqlite+aiosqlite:///", "")

        removed = []
        if os.path.exists(setup_file):
            os.remove(setup_file)
            removed.append(setup_file)
        if os.path.exists(db_path):
            os.remove(db_path)
            removed.append(db_path)

        from app.core.database import init_db
        await init_db()

        return {
            "status": "reset",
            "removed": removed,
            "message": "Database and setup marker deleted. Restart backend, then go to /setup to create admin.",
        }

    async def ensure_default_admin(self) -> None:
        async with async_session_factory() as db:
            result = await db.execute(select(User).limit(1))
            if result.scalar_one_or_none() is None:
                user = User(
                    username="admin",
                    email="admin@sglang-commander.local",
                    password_hash=hash_password("admin"),
                    is_admin=True,
                )
                db.add(user)
                await db.commit()
                setup_file = settings.resolved_setup_complete_file
                if not os.path.exists(setup_file):
                    with open(setup_file, "w") as f:
                        f.write(f"auto_created_at={datetime.now(timezone.utc).isoformat()}\n")


auth_service = AuthService()
