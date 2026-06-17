import json
from datetime import datetime, timezone
from sqlalchemy import select
from app.core.database import async_session_factory
from app.models.chat import ChatConversation, ChatMessage


class ChatService:
    async def list_conversations(self, user_id: int) -> list[dict]:
        async with async_session_factory() as db:
            result = await db.execute(
                select(ChatConversation)
                .where(ChatConversation.user_id == user_id)
                .order_by(ChatConversation.updated_at.desc())
            )
            convs = result.scalars().all()
            return [
                {
                    "id": c.id,
                    "title": c.title,
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                    "updated_at": c.updated_at.isoformat() if c.updated_at else None,
                }
                for c in convs
            ]

    async def create_conversation(self, user_id: int, title: str = "New Chat") -> dict:
        async with async_session_factory() as db:
            conv = ChatConversation(user_id=user_id, title=title)
            db.add(conv)
            await db.commit()
            await db.refresh(conv)
            return {
                "id": conv.id,
                "title": conv.title,
                "created_at": conv.created_at.isoformat() if conv.created_at else None,
                "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
            }

    async def delete_conversation(self, user_id: int, conv_id: int) -> bool:
        async with async_session_factory() as db:
            result = await db.execute(
                select(ChatConversation).where(
                    ChatConversation.id == conv_id,
                    ChatConversation.user_id == user_id,
                )
            )
            conv = result.scalar_one_or_none()
            if not conv:
                return False
            await db.delete(conv)
            await db.commit()
            return True

    async def get_messages(self, conversation_id: int, user_id: int) -> list[dict]:
        async with async_session_factory() as db:
            result = await db.execute(
                select(ChatConversation).where(
                    ChatConversation.id == conversation_id,
                    ChatConversation.user_id == user_id,
                )
            )
            conv = result.scalar_one_or_none()
            if not conv:
                return []
            msg_result = await db.execute(
                select(ChatMessage)
                .where(ChatMessage.conversation_id == conversation_id)
                .order_by(ChatMessage.id)
            )
            msgs = msg_result.scalars().all()
            return [
                {
                    "id": m.id,
                    "role": m.role,
                    "content": m.content,
                    "tool_calls": json.loads(m.tool_calls) if m.tool_calls else None,
                    "reasoning": m.reasoning,
                    "metrics": json.loads(m.metrics) if m.metrics else None,
                    "created_at": m.created_at.isoformat() if m.created_at else None,
                }
                for m in msgs
            ]

    async def save_messages(
        self, conversation_id: int, user_id: int, messages: list[dict]
    ) -> bool:
        async with async_session_factory() as db:
            result = await db.execute(
                select(ChatConversation).where(
                    ChatConversation.id == conversation_id,
                    ChatConversation.user_id == user_id,
                )
            )
            conv = result.scalar_one_or_none()
            if not conv:
                return False
            for msg in messages:
                db_msg = ChatMessage(
                    conversation_id=conversation_id,
                    role=msg.get("role", "user"),
                    content=msg.get("content"),
                    tool_calls=json.dumps(msg["tool_calls"]) if msg.get("tool_calls") else None,
                    reasoning=msg.get("reasoning"),
                    metrics=json.dumps(msg["metrics"]) if msg.get("metrics") else None,
                )
                db.add(db_msg)
            conv.updated_at = datetime.now(timezone.utc)
            await db.commit()
            return True

    async def update_title(self, conversation_id: int, user_id: int, title: str) -> bool:
        async with async_session_factory() as db:
            result = await db.execute(
                select(ChatConversation).where(
                    ChatConversation.id == conversation_id,
                    ChatConversation.user_id == user_id,
                )
            )
            conv = result.scalar_one_or_none()
            if not conv:
                return False
            conv.title = title
            await db.commit()
            return True


chat_service = ChatService()
