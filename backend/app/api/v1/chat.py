import json, asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.chat import ChatRequest
from app.services.server_manager import server_manager
from app.services.chat_service import chat_service

router = APIRouter()


@router.get("/conversations")
async def list_conversations(current_user: User = Depends(get_current_user)):
    return await chat_service.list_conversations(current_user.id)


@router.post("/conversations")
async def create_conversation(current_user: User = Depends(get_current_user), title: str = "New Chat"):
    return await chat_service.create_conversation(current_user.id, title)


@router.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: int, current_user: User = Depends(get_current_user)):
    ok = await chat_service.delete_conversation(current_user.id, conv_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "deleted"}


@router.get("/conversations/{conv_id}/messages")
async def get_messages(conv_id: int, current_user: User = Depends(get_current_user)):
    msgs = await chat_service.get_messages(conv_id, current_user.id)
    return {"messages": msgs}


@router.post("/conversations/{conv_id}/messages")
async def save_messages(conv_id: int, body: dict, current_user: User = Depends(get_current_user)):
    messages = body.get("messages", [])
    ok = await chat_service.save_messages(conv_id, current_user.id, messages)
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "saved"}


@router.patch("/conversations/{conv_id}/title")
async def update_title(conv_id: int, body: dict, current_user: User = Depends(get_current_user)):
    title = body.get("title", "New Chat")
    ok = await chat_service.update_title(conv_id, current_user.id, title)
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "updated"}


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

    # Verify SGLang server is reachable before streaming
    try:
        async with httpx.AsyncClient(timeout=5.0) as probe:
            hr = await probe.get(f"http://{host}:{port}/health")
            if hr.status_code not in (200, 404):
                raise HTTPException(status_code=502, detail=f"SGLang server health check failed: {hr.status_code}")
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail=f"Cannot connect to SGLang server at {host}:{port}")
    except httpx.TimeoutException:
        raise HTTPException(status_code=502, detail=f"SGLang server at {host}:{port} timed out")

    # Integrate RAG if requested
    if req.rag_collection:
        user_msg = next((m for m in reversed(req.messages) if m.role == "user"), None)
        if user_msg and isinstance(user_msg.content, str):
            try:
                from app.services.rag_service import rag_service
                hits = await rag_service.hybrid_query(
                    collection_name=req.rag_collection,
                    query=user_msg.content,
                    top_k=req.rag_top_k or 5
                )
                if hits:
                    context_block = "\n\n".join(
                        f"[Source: {hit['metadata'].get('source', 'unknown')}]\n{hit['text']}"
                        for hit in hits
                    )
                    user_msg.content = (
                        f"Context information from documents:\n"
                        f"---------------------\n"
                        f"{context_block}\n"
                        f"---------------------\n\n"
                        f"Given the context information above, answer the query:\n"
                        f"{user_msg.content}"
                    )
            except Exception as e:
                # Log and continue without crashing
                pass

    payload = {
        "model": req.model,
        "messages": [m.model_dump(exclude_none=True) for m in req.messages],
        "temperature": req.temperature,
        "top_p": req.top_p,
        "max_tokens": req.max_tokens,
        "stream": req.stream,
        "frequency_penalty": req.frequency_penalty,
        "presence_penalty": req.presence_penalty,
    }
    if req.stop:
        payload["stop"] = req.stop
    if req.tools:
        payload["tools"] = req.tools
    if req.tool_choice:
        payload["tool_choice"] = req.tool_choice
    if req.response_format:
        payload["response_format"] = req.response_format
    if req.n > 1:
        payload["n"] = req.n
    if req.logprobs is not None:
        payload["logprobs"] = req.logprobs
    if req.top_logprobs is not None:
        payload["top_logprobs"] = req.top_logprobs
    if req.seed is not None:
        payload["seed"] = req.seed
    if req.enable_thinking is not None:
        payload["extra_body"] = {"enable_thinking": req.enable_thinking}

    if not req.stream:
        async with httpx.AsyncClient(timeout=300.0) as client:
            r = await client.post(url, json=payload)
            if r.status_code != 200:
                raise HTTPException(status_code=r.status_code, detail=r.text)
            return r.json()

    async def generate():
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                try:
                    async with client.stream("POST", url, json=payload) as r:
                        if r.status_code != 200:
                            error_body = await r.aread()
                            yield f"data: {json.dumps({'error': f'SGLang returned {r.status_code}: {error_body.decode(errors='replace')[:200]}'})}\n\n"
                            yield "data: [DONE]\n\n"
                            return
                        async for line in r.aiter_lines():
                            if line.startswith("data: "):
                                data = line[6:]
                                if data.strip() == "[DONE]":
                                    yield "data: [DONE]\n\n"
                                    return
                                yield f"{line}\n\n"
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"
                    yield "data: [DONE]\n\n"
        except GeneratorExit:
            pass
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
