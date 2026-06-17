import asyncio
import csv
import json
import os
import time
from typing import Any, Dict, List, Optional
import httpx
from sqlalchemy import select

from app.core.database import async_session_factory
from app.models.batch import BatchJob
from app.services.server_manager import server_manager
from app.websocket.manager import ws_manager

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BATCH_DIR = os.path.join(BASE_DIR, "data", "batches")
UPLOAD_DIR = os.path.join(BATCH_DIR, "uploads")
RESULT_DIR = os.path.join(BATCH_DIR, "results")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(RESULT_DIR, exist_ok=True)


class BatchService:
    def __init__(self):
        self._running_tasks: Dict[str, asyncio.Task] = {}
        self._cancelled_jobs: set[str] = set()

    async def list_jobs(self) -> List[Dict[str, Any]]:
        async with async_session_factory() as db:
            result = await db.execute(select(BatchJob).order_by(BatchJob.created_at.desc()))
            jobs = result.scalars().all()
            return [
                {
                    "id": j.id,
                    "filename": j.filename,
                    "status": j.status,
                    "total_items": j.total_items,
                    "completed_items": j.completed_items,
                    "failed_items": j.failed_items,
                    "created_at": j.created_at.isoformat() if j.created_at else None,
                    "updated_at": j.updated_at.isoformat() if j.updated_at else None,
                }
                for j in jobs
            ]

    async def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        async with async_session_factory() as db:
            result = await db.execute(select(BatchJob).where(BatchJob.id == job_id))
            j = result.scalar_one_or_none()
            if not j:
                return None
            return {
                "id": j.id,
                "filename": j.filename,
                "status": j.status,
                "total_items": j.total_items,
                "completed_items": j.completed_items,
                "failed_items": j.failed_items,
                "created_at": j.created_at.isoformat() if j.created_at else None,
                "updated_at": j.updated_at.isoformat() if j.updated_at else None,
            }

    async def cancel_job(self, job_id: str) -> bool:
        self._cancelled_jobs.add(job_id)
        task = self._running_tasks.get(job_id)
        if task:
            task.cancel()
        
        async with async_session_factory() as db:
            result = await db.execute(select(BatchJob).where(BatchJob.id == job_id))
            job = result.scalar_one_or_none()
            if job and job.status in ("pending", "running"):
                job.status = "cancelled"
                await db.commit()
                # Broadcast final cancelled state
                await ws_manager.broadcast({
                    "type": "batch_progress",
                    "data": {
                        "job_id": job_id,
                        "filename": job.filename,
                        "status": "cancelled",
                        "completed": job.completed_items,
                        "total": job.total_items,
                        "failed": job.failed_items,
                        "progress_pct": round((job.completed_items / job.total_items) * 100, 2) if job.total_items > 0 else 0,
                        "eta_seconds": 0
                    }
                })
                return True
        return False

    async def start_batch_job(
        self,
        job_id: str,
        filename: str,
        concurrency_limit: int = 5,
        max_tokens: int = 512,
        temperature: float = 0.7,
        endpoint_type: str = "chat",
        prompt_column: Optional[str] = None,
    ):
        async with async_session_factory() as db:
            result = await db.execute(select(BatchJob).where(BatchJob.id == job_id))
            job = result.scalar_one_or_none()
            if not job:
                return
            job.status = "running"
            await db.commit()

        task = asyncio.create_task(
            self._run_job_loop(
                job_id=job_id,
                filename=filename,
                concurrency_limit=concurrency_limit,
                max_tokens=max_tokens,
                temperature=temperature,
                endpoint_type=endpoint_type,
                prompt_column=prompt_column,
            )
        )
        self._running_tasks[job_id] = task

    async def _run_job_loop(
        self,
        job_id: str,
        filename: str,
        concurrency_limit: int,
        max_tokens: int,
        temperature: float,
        endpoint_type: str,
        prompt_column: Optional[str],
    ):
        file_path = os.path.join(UPLOAD_DIR, filename)
        is_csv = filename.endswith(".csv")

        # Read prompts
        items: List[Dict[str, Any]] = []
        headers: List[str] = []
        if is_csv:
            try:
                with open(file_path, "r", encoding="utf-8-sig") as f:
                    reader = csv.DictReader(f)
                    headers = reader.fieldnames or []
                    items = list(reader)
            except Exception as e:
                await self._fail_job(job_id, f"Failed to parse CSV: {e}")
                return
        else:
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    for i, line in enumerate(f):
                        if line.strip():
                            line_json = json.loads(line)
                            # Ensure it's a dict
                            if not isinstance(line_json, dict):
                                line_json = {"prompt": str(line_json)}
                            items.append(line_json)
            except Exception as e:
                await self._fail_job(job_id, f"Failed to parse JSONL: {e}")
                return

        total_items = len(items)
        if total_items == 0:
            await self._fail_job(job_id, "No data items to process")
            return

        async with async_session_factory() as db:
            result = await db.execute(select(BatchJob).where(BatchJob.id == job_id))
            job = result.scalar_one_or_none()
            if job:
                job.total_items = total_items
                await db.commit()

        # Determine prompt key
        prompt_key = prompt_column
        if not prompt_key:
            # Auto-detect prompt key
            candidates = ["prompt", "text", "message", "input", "instruction"]
            if is_csv and headers:
                for cand in candidates:
                    for h in headers:
                        if cand == h.lower().strip():
                            prompt_key = h
                            break
                    if prompt_key:
                        break
                if not prompt_key:
                    prompt_key = headers[0]
            elif items:
                first_item = items[0]
                for cand in candidates:
                    for k in first_item.keys():
                        if cand == k.lower().strip():
                            prompt_key = k
                            break
                    if prompt_key:
                        break
                if not prompt_key:
                    prompt_key = list(first_item.keys())[0]

        # Get server url
        server_status = await server_manager.get_status()
        if not server_status.get("running"):
            await self._fail_job(job_id, "Active LLM backend server is not running")
            return

        host = server_status.get("host", "127.0.0.1")
        port = server_status.get("port", 30000)
        
        if endpoint_type == "chat":
            url = f"http://{host}:{port}/v1/chat/completions"
        else:
            url = f"http://{host}:{port}/v1/completions"

        # Concurrency control
        sem = asyncio.Semaphore(concurrency_limit)
        completed = 0
        failed = 0
        start_time = time.time()

        async def call_api(item: Dict[str, Any], idx: int):
            nonlocal completed, failed
            if job_id in self._cancelled_jobs:
                return

            prompt = item.get(prompt_key, "")
            if not prompt:
                item["response_text"] = ""
                item["error"] = "Empty prompt"
                failed += 1
                return

            async with sem:
                if job_id in self._cancelled_jobs:
                    return

                try:
                    async with httpx.AsyncClient(timeout=120.0) as client:
                        if endpoint_type == "chat":
                            payload = {
                                "model": "default",
                                "messages": [{"role": "user", "content": str(prompt)}],
                                "max_tokens": max_tokens,
                                "temperature": temperature,
                            }
                            resp = await client.post(url, json=payload)
                            resp.raise_for_status()
                            res_json = resp.json()
                            item["response_text"] = res_json["choices"][0]["message"]["content"]
                        else:
                            payload = {
                                "model": "default",
                                "prompt": str(prompt),
                                "max_tokens": max_tokens,
                                "temperature": temperature,
                            }
                            resp = await client.post(url, json=payload)
                            resp.raise_for_status()
                            res_json = resp.json()
                            item["response_text"] = res_json["choices"][0]["text"]
                        
                        item["error"] = ""
                        completed += 1

                except Exception as e:
                    item["response_text"] = ""
                    item["error"] = str(e)
                    failed += 1

                # Calculate progress & ETA
                total_processed = completed + failed
                elapsed = time.time() - start_time
                speed = total_processed / elapsed if elapsed > 0 else 0
                remaining = total_items - total_processed
                eta = remaining / speed if speed > 0 else 0

                # Broadcast progress
                await ws_manager.broadcast({
                    "type": "batch_progress",
                    "data": {
                        "job_id": job_id,
                        "filename": filename,
                        "status": "running",
                        "completed": completed,
                        "total": total_items,
                        "failed": failed,
                        "progress_pct": round((total_processed / total_items) * 100, 2),
                        "eta_seconds": int(eta),
                    }
                })

                # Update database occasionally to prevent locking issues
                if total_processed % 5 == 0 or total_processed == total_items:
                    async with async_session_factory() as db:
                        result_db = await db.execute(select(BatchJob).where(BatchJob.id == job_id))
                        job_db = result_db.scalar_one_or_none()
                        if job_db:
                            job_db.completed_items = completed
                            job_db.failed_items = failed
                            await db.commit()

        # Gather tasks
        api_tasks = [call_api(item, idx) for idx, item in enumerate(items)]
        try:
            await asyncio.gather(*api_tasks)
        except asyncio.CancelledError:
            self._cancelled_jobs.add(job_id)

        # Handle final state and write result file
        if job_id in self._cancelled_jobs:
            status = "cancelled"
        elif failed == total_items:
            status = "failed"
        else:
            status = "completed"

        # Write results
        result_filename = f"result_{job_id}_{filename}"
        result_file_path = os.path.join(RESULT_DIR, result_filename)

        try:
            if is_csv:
                fieldnames = headers + ["response_text", "error"] if "response_text" not in headers else headers
                with open(result_file_path, "w", newline="", encoding="utf-8") as f:
                    writer = csv.DictWriter(f, fieldnames=fieldnames)
                    writer.writeheader()
                    for item in items:
                        # Only write keys present in fieldnames
                        filtered_item = {k: item.get(k, "") for k in fieldnames}
                        writer.writerow(filtered_item)
            else:
                with open(result_file_path, "w", encoding="utf-8") as f:
                    for item in items:
                        f.write(json.dumps(item) + "\n")
        except Exception as e:
            status = "failed"
            # Log error
            print(f"Failed to write results file: {e}")

        async with async_session_factory() as db:
            result_db = await db.execute(select(BatchJob).where(BatchJob.id == job_id))
            job_db = result_db.scalar_one_or_none()
            if job_db:
                job_db.status = status
                job_db.completed_items = completed
                job_db.failed_items = failed
                await db.commit()

        # Broadcast final completion state
        await ws_manager.broadcast({
            "type": "batch_progress",
            "data": {
                "job_id": job_id,
                "filename": filename,
                "status": status,
                "completed": completed,
                "total": total_items,
                "failed": failed,
                "progress_pct": 100.0,
                "eta_seconds": 0,
            }
        })

        self._running_tasks.pop(job_id, None)

    async def _fail_job(self, job_id: str, error_msg: str):
        async with async_session_factory() as db:
            result = await db.execute(select(BatchJob).where(BatchJob.id == job_id))
            job = result.scalar_one_or_none()
            if job:
                job.status = "failed"
                await db.commit()
                # Broadcast failure
                await ws_manager.broadcast({
                    "type": "batch_progress",
                    "data": {
                        "job_id": job_id,
                        "filename": job.filename,
                        "status": "failed",
                        "completed": 0,
                        "total": job.total_items or 1,
                        "failed": job.total_items or 1,
                        "progress_pct": 100.0,
                        "eta_seconds": 0,
                        "error": error_msg
                    }
                })


batch_service = BatchService()
