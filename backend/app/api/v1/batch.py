import asyncio
import os
import shutil
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.batch import BatchJob
from app.services.batch_service import batch_service, UPLOAD_DIR, RESULT_DIR

router = APIRouter()


class BatchRunRequest(BaseModel):
    filename: str = Field(..., description="Name of the uploaded file to process")
    concurrency_limit: int = Field(default=5, ge=1, le=50, description="Max concurrent LLM requests")
    max_tokens: int = Field(default=512, ge=1, description="Max tokens to generate per request")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    endpoint_type: str = Field(default="chat", pattern="^(chat|completions)$")
    prompt_column: Optional[str] = Field(None, description="Specific column/key name to use for prompts")


@router.post("/upload")
async def upload_batch_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if not file.filename.endswith((".csv", ".jsonl")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV or JSONL files are supported."
        )

    # Unique name to avoid overwrite
    unique_filename = f"{uuid.uuid4()}_{file.filename}"
    filepath = os.path.join(UPLOAD_DIR, unique_filename)

    try:
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {e}"
        )

    return {"filename": unique_filename}


@router.post("/run")
async def run_batch_job(
    req: BatchRunRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify file exists
    filepath = os.path.join(UPLOAD_DIR, req.filename)
    if not os.path.exists(filepath):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Uploaded file not found."
        )

    job_id = str(uuid.uuid4())
    job = BatchJob(
        id=job_id,
        filename=req.filename,
        status="pending",
    )
    db.add(job)
    await db.commit()

    # Launch background task
    asyncio.create_task(
        batch_service.start_batch_job(
            job_id=job_id,
            filename=req.filename,
            concurrency_limit=req.concurrency_limit,
            max_tokens=req.max_tokens,
            temperature=req.temperature,
            endpoint_type=req.endpoint_type,
            prompt_column=req.prompt_column,
        )
    )

    return {"job_id": job_id, "status": "pending"}


@router.get("/jobs")
async def list_jobs(
    current_user: User = Depends(get_current_user),
):
    return await batch_service.list_jobs()


@router.get("/jobs/{job_id}")
async def get_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
):
    job = await batch_service.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found."
        )
    return job


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
):
    success = await batch_service.cancel_job(job_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to cancel job. It may not exist or is already finished."
        )
    return {"status": "cancelled"}


@router.get("/jobs/{job_id}/download")
async def download_results(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(BatchJob).where(BatchJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found."
        )

    if job.status not in ("completed", "failed", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job is not finished. Current status: {job.status}"
        )

    result_filename = f"result_{job_id}_{job.filename}"
    result_file_path = os.path.join(RESULT_DIR, result_filename)
    if not os.path.exists(result_file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Result file not found."
        )

    # Clean download name
    original_name = job.filename.split("_", 1)[-1] if "_" in job.filename else job.filename
    download_name = f"result_{original_name}"
    return FileResponse(
        result_file_path,
        filename=download_name,
        media_type="application/octet-stream"
    )
