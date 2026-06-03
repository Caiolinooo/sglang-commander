from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.models import HFSearchRequest, DownloadRequest
from app.services.model_manager import model_manager

router = APIRouter()


@router.get("/search")
async def search_models(
    query: str = Query(default="", max_length=200),
    limit: int = Query(default=20, ge=1, le=100),
    task: str = Query(default=None),
    current_user: User = Depends(get_current_user),
):
    return await model_manager.search_hf(query, limit, task or None)


@router.post("/download")
async def download_model(
    req: DownloadRequest,
    current_user: User = Depends(get_current_user),
):
    return await model_manager.download_model(req.repo_id, req.revision)


@router.get("/download-status/{repo_id}")
async def download_status(repo_id: str):
    status = await model_manager.get_download_status(repo_id)
    if status.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Download task not found")
    return status


@router.get("/local")
async def list_local_models():
    return await model_manager.list_local_models()


@router.get("/card/{repo_id:path}")
async def model_card(repo_id: str):
    return await model_manager.get_model_card(repo_id)


@router.get("/info/{repo_id:path}")
async def model_info_endpoint(repo_id: str):
    return await model_manager.get_model_architecture(repo_id)
