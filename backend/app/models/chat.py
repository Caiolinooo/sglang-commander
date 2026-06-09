from sqlalchemy import Column, Integer, String, Text, DateTime, func, ForeignKey
from app.core.database import Base


class ChatConversation(Base):
    __tablename__ = "chat_conversations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False)
    title = Column(String(256), nullable=False, default="New Chat")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer, ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(32), nullable=False)  # user, assistant, system, tool
    content = Column(Text, nullable=True)
    tool_calls = Column(Text, nullable=True)  # JSON
    reasoning = Column(Text, nullable=True)
    metrics = Column(Text, nullable=True)  # JSON
    created_at = Column(DateTime, server_default=func.now())
