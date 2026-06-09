from sqlalchemy import Column, Integer, String, DateTime, func
from app.core.database import Base


class BatchJob(Base):
    __tablename__ = "batch_jobs"

    id = Column(String(36), primary_key=True)
    filename = Column(String(256), nullable=False)
    status = Column(String(32), default="pending")  # pending, running, completed, failed, cancelled
    total_items = Column(Integer, default=0)
    completed_items = Column(Integer, default=0)
    failed_items = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
