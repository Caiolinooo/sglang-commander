from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_user
from app.models.user import User
from app.services.metrics_collector import metrics_collector

router = APIRouter()


@router.get("/latest")
async def get_latest_metrics():
    return metrics_collector.get_latest()


@router.get("/history")
async def get_metrics_history(
    seconds: int = Query(default=300, ge=10, le=3600),
):
    return {"metrics": metrics_collector.get_history(seconds)}


@router.get("/all")
async def get_all_metrics():
    return {"metrics": metrics_collector.get_history_all()}
