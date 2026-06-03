import os
from typing import Optional

from huggingface_hub import HfApi, snapshot_download, scan_cache_dir
from app.config import settings


hf_api = HfApi()


class ModelManager:
    def __init__(self):
        self._download_tasks: dict[str, dict] = {}

    async def search_hf(self, query: str, limit: int = 20, task: Optional[str] = None) -> dict:
        try:
            models = hf_api.list_models(
                search=query,
                task=task,
                sort="downloads",
                direction=-1,
                limit=limit,
            )
            results = []
            for m in models:
                results.append({
                    "repo_id": m.modelId,
                    "model_name": m.modelId.split("/")[-1] if "/" in m.modelId else m.modelId,
                    "author": m.modelId.split("/")[0] if "/" in m.modelId else "unknown",
                    "downloads": getattr(m, "downloads", 0),
                    "likes": getattr(m, "likes", 0),
                    "pipeline_tag": getattr(m, "pipeline_tag", None),
                    "library_name": getattr(m, "library_name", None),
                    "tags": list(getattr(m, "tags", [])),
                    "description": getattr(m, "description", ""),
                })
            return {"models": results, "total": len(results)}
        except Exception as e:
            return {"models": [], "total": 0, "error": str(e)}

    async def download_model(self, repo_id: str, revision: str = "main") -> dict:
        task_id = f"{repo_id}@{revision}"
        if task_id in self._download_tasks:
            return {"status": "already_downloading", "task_id": task_id}

        self._download_tasks[task_id] = {
            "status": "downloading",
            "progress": 0.0,
            "repo_id": repo_id,
        }

        try:
            path = snapshot_download(
                repo_id=repo_id,
                revision=revision,
                local_dir_use_symlinks=False,
                resume_download=True,
                token=os.environ.get("HF_TOKEN", None),
            )
            self._download_tasks[task_id] = {
                "status": "completed",
                "progress": 100.0,
                "repo_id": repo_id,
                "path": path,
            }
            return {"status": "completed", "path": path}
        except Exception as e:
            self._download_tasks[task_id] = {
                "status": "error",
                "repo_id": repo_id,
                "error": str(e),
            }
            return {"status": "error", "error": str(e)}

    async def get_download_status(self, repo_id: str) -> dict:
        for task_id, info in self._download_tasks.items():
            if repo_id in task_id:
                return info
        return {"status": "not_found"}

    async def list_local_models(self) -> list[dict]:
        try:
            cache_info = scan_cache_dir()
            models = []
            for repo in cache_info.repos:
                revisions = []
                for rev in repo.revisions:
                    revisions.append({
                        "revision": rev.commit_hash or "unknown",
                        "size_bytes": rev.size_on_disk,
                        "files": [f.file_name for f in rev.files],
                    })
                models.append({
                    "repo_id": repo.repo_id,
                    "repo_type": repo.repo_type,
                    "size_bytes": repo.size_on_disk,
                    "revisions": revisions,
                })
            return models
        except Exception as e:
            return []

    async def get_model_card(self, repo_id: str) -> str:
        try:
            info = hf_api.model_info(repo_id)
            card = hf_api.get_model_card(repo_id)
            card_data = info.cardData if info.cardData else {}
            return {
                "readme": card.content if card else "",
                "card_data": card_data,
                "pipeline_tag": info.pipeline_tag,
                "config": info.config if hasattr(info, "config") else {},
            }
        except Exception as e:
            return {"error": str(e)}

    async def get_model_architecture(self, repo_id: str) -> dict:
        try:
            info = hf_api.model_info(repo_id)
            config = info.config if hasattr(info, "config") and info.config else {}
            return {
                "repo_id": repo_id,
                "pipeline_tag": info.pipeline_tag,
                "library_name": info.library_name,
                "architectures": config.get("architectures", []) if config else [],
                "context_length": config.get("max_position_embeddings") or config.get("n_positions") or config.get("seq_length"),
                "quantization": config.get("quantization_config", {}),
                "num_parameters": config.get("num_parameters", {}),
            }
        except Exception as e:
            return {"error": str(e)}


model_manager = ModelManager()
