from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, func
from app.core.database import Base


class ServerConfig(Base):
    __tablename__ = "server_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False)
    model_path = Column(String(512), nullable=False)
    host = Column(String(64), default="127.0.0.1")
    port = Column(Integer, default=30000)
    args_json = Column(Text, default="{}")
    is_active = Column(Boolean, default=False)
    is_remote = Column(Boolean, default=False)
    remote_url = Column(String(512), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
