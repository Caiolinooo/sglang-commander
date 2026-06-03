from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.server import ServerStartRequest, ServerStatusResponse
from app.services.server_manager import server_manager

router = APIRouter()


@router.post("/start")
async def start_server(
    req: ServerStartRequest,
    current_user: User = Depends(get_current_user),
):
    result = await server_manager.start(req.model_dump())
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.post("/stop")
async def stop_server(current_user: User = Depends(get_current_user)):
    return await server_manager.stop()


@router.post("/restart")
async def restart_server(
    req: ServerStartRequest = None,
    current_user: User = Depends(get_current_user),
):
    config = req.model_dump() if req else None
    return await server_manager.restart(config)


@router.get("/status", response_model=ServerStatusResponse)
async def get_status():
    return await server_manager.get_status()


@router.get("/logs")
async def get_logs(
    cursor: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
):
    return await server_manager.get_logs(cursor)


@router.get("/health")
async def health_check():
    return await server_manager.health_check()


@router.get("/model-info")
async def model_info():
    return await server_manager.get_model_info()
