from sqlalchemy import Column, Integer, String, Boolean, DateTime, func
from app.core.database import Base


class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False)
    name = Column(String(128), nullable=False)
    key = Column(String(256), unique=True, nullable=False, index=True)
    scopes = Column(String(512), default="read")  # read, write, admin
    is_active = Column(Boolean, default=True)
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
