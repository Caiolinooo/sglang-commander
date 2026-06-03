import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.chat import ChatRequest
from app.services.server_manager import server_manager

router = APIRouter()


@router.post("/completions")
async def chat_completion(
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
):
    status = await server_manager.get_status()
    if not status.get("running"):
        raise HTTPException(status_code=503, detail="SGLang server is not running")

    host = status.get("host", "127.0.0.1")
    port = status.get("port", 30000)
    url = f"http://{host}:{port}/v1/chat/completions"

    import httpx

    payload = {
        "model": req.model,
        "messages": [m.model_dump() for m in req.messages],
        "temperature": req.temperature,
        "top_p": req.top_p,
        "max_tokens": req.max_tokens,
        "stream": req.stream,
        "frequency_penalty": req.frequency_penalty,
        "presence_penalty": req.presence_penalty,
    }
    if req.stop:
        payload["stop"] = req.stop

    if not req.stream:
        async with httpx.AsyncClient(timeout=300.0) as client:
            r = await client.post(url, json=payload)
            return r.json()

    async def generate():
        async with httpx.AsyncClient(timeout=300.0) as client:
            async with client.stream("POST", url, json=payload) as r:
                async for line in r.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data.strip() == "[DONE]":
                            yield "data: [DONE]\n\n"
                            break
                        yield f"{line}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
