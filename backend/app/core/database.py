import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.resolved_database_url, echo=settings.debug)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        from app.models.user import User
        from app.models.session import Session
        from app.models.server_config import ServerConfig
        from app.models.api_key import ApiKey
        from app.models.chat import ChatConversation, ChatMessage
        from app.models.template import PromptTemplate
        from app.models.batch import BatchJob
        from app.models.connection import ConnectionProfile
        await conn.run_sync(Base.metadata.create_all)
