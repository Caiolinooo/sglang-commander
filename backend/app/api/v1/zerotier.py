from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.zerotier import JoinNetworkRequest
from app.services.zerotier_manager import zerotier_manager

router = APIRouter()


@router.get("/status")
async def get_zerotier_status():
    return await zerotier_manager.get_status()


@router.post("/join")
async def join_network(
    req: JoinNetworkRequest,
    current_user: User = Depends(get_current_user),
):
    result = await zerotier_manager.join_network(req.network_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.post("/leave")
async def leave_network(
    req: JoinNetworkRequest,
    current_user: User = Depends(get_current_user),
):
    result = await zerotier_manager.leave_network(req.network_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.get("/networks")
async def list_networks():
    return await zerotier_manager.list_networks()
