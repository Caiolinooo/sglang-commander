from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from app.core.deps import get_current_user
from app.models.user import User
from app.services.benchmark_service import benchmark_service

router = APIRouter()


class BenchmarkRunRequest(BaseModel):
    prompt: str = Field(default="What is the capital of France?")
    max_tokens: int = Field(default=100, ge=1, le=4096)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    num_runs: int = Field(default=10, ge=1, le=100)
    concurrency: int = Field(default=1, ge=1, le=10)


@router.post("/run")
async def run_benchmark(
    req: BenchmarkRunRequest,
    current_user: User = Depends(get_current_user),
):
    result = await benchmark_service.run_benchmark(
        prompt=req.prompt,
        max_tokens=req.max_tokens,
        temperature=req.temperature,
        num_runs=req.num_runs,
        concurrency=req.concurrency,
    )
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.get("/status")
async def get_benchmark_status():
    return await benchmark_service.get_status()


@router.post("/cancel")
async def cancel_benchmark(current_user: User = Depends(get_current_user)):
    benchmark_service.cancel()
    return {"status": "cancelled"}
