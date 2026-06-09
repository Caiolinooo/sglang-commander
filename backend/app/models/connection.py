from sqlalchemy import Column, Integer, String, Boolean, DateTime, func
from app.core.database import Base


class ConnectionProfile(Base):
    __tablename__ = "connection_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), unique=True, nullable=False)
    host = Column(String(256), nullable=False)
    port = Column(Integer, default=22, nullable=False)
    username = Column(String(128), nullable=False)
    auth_method = Column(String(32), default="key", nullable=False)  # 'password' or 'key'
    password = Column(String(256), nullable=True)
    key_path = Column(String(512), nullable=True)
    remote_forward_port = Column(Integer, default=30000, nullable=False)  # Port on remote SGLang host
    local_bind_port = Column(Integer, default=30001, nullable=False)     # Local port to bind to
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
