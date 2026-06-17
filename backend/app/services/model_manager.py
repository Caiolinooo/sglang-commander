import asyncio
import os
import re
import json
from typing import Optional

from huggingface_hub import HfApi, snapshot_download, scan_cache_dir
from app.config import settings
from app.services.gpu_detector import (
    get_basic_info as _gpu_basic_info,
    get_live_info as _gpu_live_info,
    get_all_detailed_status as _gpu_detailed_status,
)


def _get_model_scan_dirs() -> list[str]:
    """Get model directories from config (no hardcoded paths)."""
    return settings.resolved_model_scan_dirs



hf_api = HfApi(token=settings.huggingface_token)

# Approximate VRAM in GB for common model sizes at different quantizations
# Key: parameter count (billions), Value: {precision: vram_gb}
_VRAM_TABLE = {
    1: {"fp16": 2, "int8": 1, "int4": 0.5},
    3: {"fp16": 6, "int8": 3, "int4": 2},
    7: {"fp16": 14, "int8": 7, "int4": 4},
    8: {"fp16": 16, "int8": 8, "int4": 5},
    13: {"fp16": 26, "int8": 13, "int4": 7},
    14: {"fp16": 28, "int8": 14, "int4": 8},
    27: {"fp16": 54, "int8": 27, "int4": 15},
    30: {"fp16": 60, "int8": 30, "int4": 16},
    32: {"fp16": 64, "int8": 32, "int4": 18},
    70: {"fp16": 140, "int8": 70, "int4": 40},
    72: {"fp16": 144, "int8": 72, "int4": 42},
}

# VRAM overhead: KV cache + activations + framework (GB)
_KV_CACHE_OVERHEAD = 2.0
_FRAMEWORK_OVERHEAD = 1.5


def _estimate_params_billions(tags: list, model_name: str, config: dict = None) -> Optional[float]:
    """Estimate parameter count in billions from tags, name, or config."""
    # Try from config first
    if config:
        num_params = config.get("num_parameters")
        if num_params and isinstance(num_params, (int, float)):
            return num_params / 1e9

    # Try from tags
    for tag in tags:
        if isinstance(tag, str):
            # Match patterns like "7b", "13b", "70b", "7B", "13B"
            m = re.search(r'(\d+\.?\d*)\s*[bB]', tag)
            if m:
                val = float(m.group(1))
                if val < 1000:  # sanity check
                    return val

    # Try from model name
    m = re.search(r'[-_/](\d+\.?\d*)[bB]', model_name)
    if m:
        val = float(m.group(1))
        if val < 1000:
            return val

    return None


def _detect_format(tags: list, library_name: str = None) -> str:
    """Detect model format from tags."""
    tag_set = set(tags) if tags else set()
    if "gguf" in tag_set:
        return "gguf"
    if "awq" in tag_set:
        return "awq"
    if "gptq" in tag_set:
        return "gptq"
    if "fp8" in tag_set or "eetq" in tag_set:
        return "fp8"
    if "safetensors" in tag_set:
        return "safetensors"
    if library_name and "llama" in library_name.lower():
        return "gguf"
    return "unknown"


def _detect_quantization(tags: list, model_name: str) -> str:
    """Detect quantization level from tags and name."""
    tag_str = " ".join(tags).lower() if tags else ""
    name_lower = model_name.lower()
    combined = f"{tag_str} {name_lower}"

    if "awq" in combined:
        return "awq"
    if "gptq" in combined:
        return "gptq"
    if "int4" in combined or "4bit" in combined or "q4" in combined:
        return "int4"
    if "int8" in combined or "8bit" in combined or "q8" in combined:
        return "int8"
    if "fp8" in combined:
        return "fp8"
    if "fp16" in combined or "bf16" in combined:
        return "fp16"
    if "gguf" in combined:
        # Extract GGUF quant level
        m = re.search(r'(q[2-8]_?\w*|iq[2-8]\w*)', combined)
        if m:
            return m.group(1)
        return "gguf"
    return "fp16"


def _estimate_vram_gb(params_b: float, quant: str, context_length: int = 4096) -> float:
    """Estimate VRAM needed in GB."""
    if params_b <= 0:
        return 0

    quant_key = quant.lower()
    if quant_key in ("awq", "gptq", "int4"):
        precision = "int4"
    elif quant_key in ("int8",):
        precision = "int8"
    elif quant_key in ("fp8",):
        precision = "int8"  # fp8 ≈ int8 for memory
    elif quant_key in ("fp16", "bf16", "safetensors", "unknown", ""):
        precision = "fp16"
    else:
        # GGUF or custom - estimate from quant string
        if "q2" in quant_key or "iq2" in quant_key:
            precision = "int4"  # very aggressive
        elif "q3" in quant_key or "iq3" in quant_key:
            precision = "int4"
        elif "q4" in quant_key or "iq4" in quant_key:
            precision = "int4"
        elif "q5" in quant_key:
            precision = "int8"  # between int4 and fp16
        elif "q6" in quant_key:
            precision = "int8"
        elif "q8" in quant_key:
            precision = "int8"
        else:
            precision = "fp16"

    # Find closest parameter count in table
    closest = min(_VRAM_TABLE.keys(), key=lambda x: abs(x - params_b))
    if abs(closest - params_b) > params_b * 0.3:
        # Too far, use linear scaling from nearest
        base_params = closest
        base_vram = _VRAM_TABLE[base_params][precision]
        scaled = base_vram * (params_b / base_params)
    else:
        scaled = _VRAM_TABLE[closest][precision]

    # Add KV cache estimation (rough: 2 bytes * 2 * layers * context * head_dim)
    # Approximate: ~0.5GB per 4K context for 7B, scale linearly
    kv_gb = (context_length / 4096) * (params_b / 7) * 0.5

    total = scaled + kv_gb + _FRAMEWORK_OVERHEAD
    return round(total, 1)


def _estimate_max_tokens(context_length: int, params_b: float, vram_gb: float) -> dict:
    """Estimate max input/output tokens based on VRAM and context."""
    if not context_length:
        context_length = 4096

    # Practical max context (accounting for KV cache memory pressure)
    practical_context = min(context_length, int(context_length * 0.85))

    return {
        "max_context": context_length,
        "practical_context": practical_context,
        "recommended_max_input": int(practical_context * 0.75),
        "recommended_max_output": int(practical_context * 0.25),
    }


class ModelManager:
    def __init__(self):
        self._download_tasks: dict[str, dict] = {}
        self._gpu_cache: dict = {}
        self._gpu_cache_time: float = 0

    def _get_gpu(self) -> dict:
        """Cached GPU info (refresh every 10s)."""
        import time
        now = time.time()
        if now - self._gpu_cache_time > 10:
            self._gpu_cache = _gpu_basic_info()
            self._gpu_cache_time = now
        return self._gpu_cache

    async def search_hf(
        self,
        query: str = "",
        limit: int = 20,
        task: Optional[str] = None,
        library: Optional[str] = None,
        license_filter: Optional[str] = None,
        framework: Optional[str] = None,
        language: Optional[str] = None,
        author: Optional[str] = None,
        sort_by: str = "downloads",
        sort_dir: int = -1,
        min_params: Optional[float] = None,
        max_params: Optional[float] = None,
        quantization: Optional[str] = None,
        format_filter: Optional[str] = None,
        fits_gpu: bool = False,
        multimodal: bool = False,
    ) -> dict:
        try:
            gpu = self._get_gpu()
            gpu_total = gpu.get("total_gb", 0)

            # Build kwargs for hf_api.list_models (huggingface_hub 1.17.0 API)
            kwargs = {
                "search": query or None,
                "sort": sort_by if sort_by in ("downloads", "likes", "lastModified") else "downloads",
                "limit": min(limit * 3, 200),
            }

            # Use dedicated filter params where available
            if task:
                kwargs["pipeline_tag"] = task
            if author:
                kwargs["author"] = author

            # Build general filter list for remaining filters (library, license, framework, language)
            filter_parts = []
            if library:
                filter_parts.append(f"library_name:{library}")
            if license_filter:
                filter_parts.append(f"license:{license_filter}")
            if framework:
                filter_parts.append(f"framework:{framework}")
            if language:
                filter_parts.append(f"language:{language}")
            if filter_parts:
                kwargs["filter"] = filter_parts

            models = hf_api.list_models(**kwargs)
            results = []
            for m in models:
                tags = list(getattr(m, "tags", []))
                model_id = m.modelId
                model_name = model_id.split("/")[-1] if "/" in model_id else model_id
                model_author = model_id.split("/")[0] if "/" in model_id else "unknown"
                library_name = getattr(m, "library_name", None)
                pipeline_tag = getattr(m, "pipeline_tag", None)

                # Author filter (post-filter since HF search is fuzzy)
                if author and author.lower() not in model_author.lower():
                    continue

                fmt = _detect_format(tags, library_name)

                # Format filter (post-filter)
                if format_filter and fmt != format_filter:
                    continue

                quant = _detect_quantization(tags, model_name)

                # Quantization filter (post-filter)
                if quantization:
                    if quantization == "none":
                        if quant:
                            continue
                    elif quantization.lower() not in (quant or "").lower():
                        continue

                params_b = _estimate_params_billions(tags, model_name, getattr(m, "config", None))

                # Get safetensors info if available
                safetensors = getattr(m, "safetensors", None)
                if safetensors and params_b is None:
                    total_params = safetensors.get("total", 0)
                    if total_params:
                        params_b = total_params / 1e9

                # Params range filter (post-filter)
                if min_params is not None and (params_b or 0) < min_params:
                    continue
                if max_params is not None and (params_b or 0) > max_params:
                    continue

                # Multimodal filter (post-filter)
                is_multimodal = pipeline_tag == "image-text-to-text" or any(
                    kw in " ".join(tags).lower()
                    for kw in ["vision", "multimodal", "image-text", "vl", "visual"]
                )
                if multimodal and not is_multimodal:
                    continue

                # Estimate VRAM
                context_length = 4096
                vram_gb = 0
                if params_b:
                    vram_gb = _estimate_vram_gb(params_b, quant, context_length)

                fits = gpu_total > 0 and vram_gb > 0 and vram_gb <= gpu_total

                # VRAM fits filter (post-filter)
                if fits_gpu and not fits:
                    continue

                tokens = _estimate_max_tokens(context_length, params_b or 0, vram_gb)

                # Detect MoE
                arch_str = " ".join(tags).lower() + " " + model_name.lower()
                is_moe = any(kw in arch_str for kw in ["moe", "mixtral", "deepseek", "qwen2_moe", "mixture"])

                results.append({
                    "repo_id": model_id,
                    "model_name": model_name,
                    "author": model_author,
                    "downloads": getattr(m, "downloads", 0),
                    "likes": getattr(m, "likes", 0),
                    "pipeline_tag": pipeline_tag,
                    "library_name": library_name,
                    "tags": tags,
                    "description": getattr(m, "description", ""),
                    "format": fmt,
                    "quantization": quant,
                    "params_billions": params_b,
                    "vram_estimate_gb": vram_gb,
                    "fits_in_gpu": fits,
                    "context_length": context_length,
                    "tokens": tokens,
                    "is_multimodal": is_multimodal,
                    "is_moe": is_moe,
                })

                if len(results) >= limit:
                    break

            return {"models": results, "total": len(results), "gpu": gpu}
        except Exception as e:
            return {"models": [], "total": 0, "error": str(e)}

    async def get_gpu_info(self) -> dict:
        return self._get_gpu()

    async def download_model(self, repo_id: str, revision: str = "main") -> dict:
        task_id = f"{repo_id}@{revision}"
        if task_id in self._download_tasks:
            info = self._download_tasks[task_id]
            if info.get("status") == "downloading":
                return {"status": "already_downloading", "task_id": task_id}

        self._download_tasks[task_id] = {
            "status": "downloading",
            "progress_pct": 0.0,
            "speed_mb": 0.0,
            "eta_seconds": 0,
            "downloaded_mb": 0.0,
            "total_mb": 0.0,
            "repo_id": repo_id,
        }

        # Spawn download background task
        asyncio.create_task(self._run_download(repo_id, revision, task_id))
        return {"status": "started", "task_id": task_id}

    async def _run_download(self, repo_id: str, revision: str, task_id: str):
        import time
        from tqdm.auto import tqdm
        from app.websocket.manager import ws_manager

        # Custom tqdm subclass that intercepts updates
        class WebsocketProgressTqdm(tqdm):
            _main_loop = None
            _callback = None

            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                desc = kwargs.get("desc", "")
                self.filename = desc if desc else "file"

            def update(self, n=1):
                super().update(n)
                if WebsocketProgressTqdm._main_loop and WebsocketProgressTqdm._callback:
                    WebsocketProgressTqdm._main_loop.call_soon_threadsafe(
                        WebsocketProgressTqdm._callback,
                        self.filename,
                        self.n
                    )

        loop = asyncio.get_running_loop()

        # Try to resolve total repo size in bytes first
        total_bytes = 0
        try:
            model_info = await asyncio.to_thread(
                hf_api.model_info, repo_id, revision=revision, files_metadata=True
            )
            total_bytes = sum(f.size for f in model_info.siblings if f.size)
        except Exception:
            pass

        file_progress = {}
        start_time = time.time()
        self._last_ws_broadcast = 0.0

        def on_progress(filename, downloaded_bytes):
            file_progress[filename] = downloaded_bytes
            total_downloaded = sum(file_progress.values())

            elapsed = time.time() - start_time
            speed = total_downloaded / elapsed if elapsed > 0 else 0

            eff_total = total_bytes if total_bytes > 0 else total_downloaded + 1024
            pct = min(99.9, (total_downloaded / eff_total) * 100)
            remaining = max(0, eff_total - total_downloaded)
            eta = remaining / speed if speed > 0 else 0

            self._download_tasks[task_id].update({
                "progress_pct": round(pct, 1),
                "speed_mb": round(speed / (1024 * 1024), 2),
                "eta_seconds": int(eta),
                "downloaded_mb": round(total_downloaded / (1024 * 1024), 1),
                "total_mb": round(eff_total / (1024 * 1024), 1),
            })

            # Throttle websocket updates to prevent frontend lockups
            now = time.time()
            if now - self._last_ws_broadcast > 0.5:
                self._last_ws_broadcast = now
                asyncio.run_coroutine_threadsafe(
                    ws_manager.broadcast({
                        "type": "model_download_progress",
                        "data": {
                            "repo_id": repo_id,
                            "progress_pct": round(pct, 1),
                            "speed_mb": round(speed / (1024 * 1024), 2),
                            "eta_seconds": int(eta),
                            "downloaded_mb": round(total_downloaded / (1024 * 1024), 1),
                            "total_mb": round(eff_total / (1024 * 1024), 1),
                            "status": "downloading"
                        }
                    }),
                    loop
                )

        WebsocketProgressTqdm._main_loop = loop
        WebsocketProgressTqdm._callback = on_progress

        try:
            path = await asyncio.to_thread(
                snapshot_download,
                repo_id=repo_id,
                revision=revision,
                local_dir_use_symlinks=False,
                resume_download=True,
                token=settings.huggingface_token,
                tqdm_class=WebsocketProgressTqdm
            )

            self._download_tasks[task_id].update({
                "status": "completed",
                "progress_pct": 100.0,
                "path": path,
            })

            await ws_manager.broadcast({
                "type": "model_download_progress",
                "data": {
                    "repo_id": repo_id,
                    "progress_pct": 100.0,
                    "speed_mb": 0.0,
                    "eta_seconds": 0,
                    "status": "completed",
                    "path": path
                }
            })
        except Exception as e:
            self._download_tasks[task_id].update({
                "status": "error",
                "error": str(e),
            })
            await ws_manager.broadcast({
                "type": "model_download_progress",
                "data": {
                    "repo_id": repo_id,
                    "status": "error",
                    "error": str(e)
                }
            })

    async def get_download_status(self, repo_id: str) -> dict:
        for task_id, info in self._download_tasks.items():
            if repo_id in task_id:
                return info
        return {"status": "not_found"}

    async def validate_token(self) -> dict:
        try:
            info = hf_api.whoami()
            return {"valid": True, "name": info.get("name"), "email": info.get("email")}
        except Exception as e:
            return {"valid": False, "error": str(e)}

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
                size_gb = repo.size_on_disk / 1e9
                models.append({
                    "repo_id": repo.repo_id,
                    "repo_type": repo.repo_type,
                    "size_bytes": repo.size_on_disk,
                    "size_gb": round(size_gb, 1),
                    "revisions": revisions,
                })
            return models
        except Exception:
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
            tags = list(getattr(info, "tags", []))
            model_name = repo_id.split("/")[-1]
            library_name = info.library_name

            fmt = _detect_format(tags, library_name)
            quant = _detect_quantization(tags, model_name)
            params_b = _estimate_params_billions(tags, model_name, config)

            context_length = (
                config.get("max_position_embeddings")
                or config.get("n_positions")
                or config.get("seq_length")
                or 4096
            )

            vram_gb = _estimate_vram_gb(params_b or 0, quant, context_length) if params_b else 0
            gpu = self._get_gpu()
            fits = gpu.get("total_gb", 0) > 0 and vram_gb > 0 and vram_gb <= gpu.get("total_gb", 0)

            return {
                "repo_id": repo_id,
                "pipeline_tag": info.pipeline_tag,
                "library_name": library_name,
                "architectures": config.get("architectures", []) if config else [],
                "context_length": context_length,
                "quantization_info": config.get("quantization_config", {}),
                "num_parameters": config.get("num_parameters", {}),
                "format": fmt,
                "quantization": quant,
                "params_billions": params_b,
                "vram_estimate_gb": vram_gb,
                "fits_in_gpu": fits,
                "tokens": _estimate_max_tokens(context_length, params_b or 0, vram_gb),
                "gpu": gpu,
            }
        except Exception as e:
            return {"error": str(e)}

    async def get_model_config(self, repo_id: str) -> dict:
        """Fetch full model config from HuggingFace with intelligent feature detection."""
        try:
            info = hf_api.model_info(repo_id, files_metadata=True)
            config = info.config if hasattr(info, "config") and info.config else {}
            tags = list(getattr(info, "tags", []))
            model_name = repo_id.split("/")[-1]
            library_name = info.library_name

            fmt = _detect_format(tags, library_name)
            quant = _detect_quantization(tags, model_name)
            params_b = _estimate_params_billions(tags, model_name, config)

            context_length = (
                config.get("max_position_embeddings")
                or config.get("n_positions")
                or config.get("seq_length")
                or 4096
            )

            # Check tags for context length hints (e.g., "32k", "128k", "16k")
            tags_lower = " ".join(tags).lower()
            if context_length == 4096:  # Only override if default
                if "128k" in tags_lower or "131072" in tags_lower:
                    context_length = 131072
                elif "64k" in tags_lower or "65536" in tags_lower:
                    context_length = 65536
                elif "32k" in tags_lower or "32768" in tags_lower:
                    context_length = 32768
                elif "16k" in tags_lower or "16384" in tags_lower:
                    context_length = 16384
                elif "8k" in tags_lower or "8192" in tags_lower:
                    context_length = 8192

            architectures = config.get("architectures", []) if config else []
            is_moe = any("moe" in a.lower() for a in architectures) if architectures else False

            # Fallback: Qwen 3.x / 3.5 / 3.6 models typically support 32k+ context
            if context_length == 4096:
                name_lower = model_name.lower()
                if any(kw in name_lower for kw in ["qwen3", "qwen-3", "qwen2.5", "qwen25", "qwen3.5", "qwen3.6", "qwopus"]):
                    context_length = 32768  # Qwen 3.x default

            # Detect multimodal
            is_vision = any("vision" in a.lower() or "clip" in a.lower() or "conditional" in a.lower() for a in architectures)
            is_multimodal = info.pipeline_tag == "image-text-to-text" or is_vision or any(
                kw in " ".join(tags).lower() for kw in ["vision", "multimodal", "image-text", "vl", "visual"]
            )

            # Detect MTP (Multi-Token Prediction) / Speculative decoding support
            has_mtp_head = False
            mtp_layer_count = 0
            tags_lower = " ".join(tags).lower()
            if "mtp" in model_name.lower() or "multi-token" in model_name.lower() or "speculative" in model_name.lower():
                has_mtp_head = True
            # Check tags for MTP
            if "multi-token-prediction" in tags_lower or "multi_token_prediction" in tags_lower:
                has_mtp_head = True
            # Check config for MTP-related keys
            if config.get("mtp") or config.get("multi_token_prediction") or config.get("speculative"):
                has_mtp_head = True
            # Some models have MTP head info in config
            if "num_mtp_layers" in config:
                mtp_layer_count = config.get("num_mtp_layers", 0)
                has_mtp_head = mtp_layer_count > 0

            # Detect tool calling capability from tags/architecture
            supports_tool_calling = any(
                kw in " ".join(tags).lower() for kw in ["tool", "function", "calling", "agent"]
            ) or any("llama3" in a.lower() or "qwen" in a.lower() for a in architectures)

            # Detect reasoning capability
            supports_reasoning = any(
                kw in " ".join(tags).lower() for kw in ["reasoning", "cot", "chain-of-thought"]
            ) or "qwen3" in model_name.lower() or "deepseek-r1" in model_name.lower()

            # Estimate VRAM
            vram_gb = _estimate_vram_gb(params_b or 0, quant, context_length) if params_b else 0
            gpu = self._get_gpu()
            fits = gpu.get("total_gb", 0) > 0 and vram_gb > 0 and vram_gb <= gpu.get("total_gb", 0)

            # Determine recommended settings
            recommended = {
                "tool_call_parser": "qwen3_coder" if "qwen3" in model_name.lower() else "qwen" if "qwen" in model_name.lower() else "",
                "reasoning_parser": "qwen3" if "qwen3" in model_name.lower() else "deepseek-r1" if "deepseek-r1" in model_name.lower() else "",
                "enable_multimodal": is_multimodal,
                "context_length": context_length,
                "speculative_algorithm": "EAGLE" if has_mtp_head else "",
                "speculative_num_steps": 3 if has_mtp_head else None,
                "load_format": "gguf" if fmt == "gguf" else "",
                "dtype": "float16" if "awq" in quant.lower() else "auto",
                "kv_cache_dtype": "fp8_e4m3" if params_b and params_b > 20 else "auto",
                "cpu_offload_gb": 0 if fits else max(1, int(vram_gb - gpu.get("total_gb", 0)) + 2),
            }

            return {
                "repo_id": repo_id,
                "model_name": model_name,
                "pipeline_tag": info.pipeline_tag,
                "library_name": library_name,
                "tags": tags,
                "architectures": architectures,
                "context_length": context_length,
                "quantization_config": config.get("quantization_config", {}),
                "num_parameters": config.get("num_parameters", {}),
                "format": fmt,
                "quantization": quant,
                "params_billions": params_b,
                "vram_estimate_gb": vram_gb,
                "fits_in_gpu": fits,
                "tokens": _estimate_max_tokens(context_length, params_b or 0, vram_gb),
                "is_multimodal": is_multimodal,
                "is_moe": is_moe,
                "has_mtp_head": has_mtp_head,
                "mtp_layer_count": mtp_layer_count,
                "supports_tool_calling": supports_tool_calling,
                "supports_reasoning": supports_reasoning,
                "gpu": gpu,
                "recommended": recommended,
                "config": config,
            }
        except Exception as e:
            return {"error": str(e)}

    async def get_deployment_recommendations(self, repo_id: str) -> dict:
        """Get intelligent deployment recommendations based on GPU VRAM and model requirements."""
        try:
            # Get model config
            model_info = await self.get_model_config(repo_id)
            if "error" in model_info:
                return model_info

            gpu = self._get_gpu()
            gpu_total = gpu.get("total_gb", 0)

            params_b = model_info.get("params_billions", 0) or 0
            quant = model_info.get("quantization", "fp16")
            context_length = model_info.get("context_length", 4096)
            is_moe = model_info.get("is_moe", False)
            has_mtp_head = model_info.get("has_mtp_head", False)
            is_multimodal = model_info.get("is_multimodal", False)

            recommendations = {
                "quantization": quant if quant else "awq" if params_b > 14 else "auto",
                "dtype": "float16" if "awq" in quant.lower() else "auto",
                "context_length": min(context_length, 32768) if gpu_total < 24 else context_length,
                "tensor_parallel_size": 1,
                "enable_multimodal": is_multimodal,
                "trust_remote_code": True,
                "kv_cache_dtype": "fp8_e4m3" if params_b > 20 else "auto",
                "cpu_offload_gb": 0,
                "mem_fraction_static": 0.85,
                "max_running_requests": 2 if params_b > 20 else 4,
                "speculative_algorithm": "EAGLE" if has_mtp_head else "",
                "speculative_num_steps": 3 if has_mtp_head else None,
                "speculative_draft_model_path": "",
                "enable_dp_attention": False,
            }

            # Calculate VRAM needed
            vram_gb = _estimate_vram_gb(params_b, quant, context_length)
            vram_with_overhead = vram_gb + 1.5  # framework overhead

            # Adjust for different scenarios
            if vram_with_overhead > gpu_total * 0.95:
                # Model won't fit - suggest aggressive quantization
                if quant.lower() not in ("awq", "gptq", "int4", "int8", "fp8", "gguf"):
                    recommendations["quantization"] = "awq"
                    vram_gb = _estimate_vram_gb(params_b, "awq", context_length)
                    vram_with_overhead = vram_gb + 1.5

            if vram_with_overhead > gpu_total * 0.95:
                # Still too big - suggest CPU offloading
                recommendations["cpu_offload_gb"] = min(int(vram_with_overhead - gpu_total * 0.85 + 2), 16)
                recommendations["mem_fraction_static"] = 0.80

            if vram_with_overhead > gpu_total * 0.95:
                # Still too big - suggest tensor parallelism (if multi-GPU)
                if gpu.get("count", 1) > 1:
                    recommendations["tensor_parallel_size"] = gpu.get("count", 1)
                else:
                    recommendations["max_running_requests"] = 1
                    recommendations["mem_fraction_static"] = 0.75

            # For MoE models on single GPU
            if is_moe and gpu.get("count", 1) == 1:
                recommendations["enable_dp_attention"] = False  # Can't use DP attention on single GPU

            # For very large models (>20B)
            if params_b > 20:
                recommendations["chunked_prefill_size"] = 2048
                recommendations["cuda_graph_max_bs"] = 256
                recommendations["max_prefill_tokens"] = min(context_length, 4096)

            # Add warnings
            warnings = []
            if vram_with_overhead > gpu_total:
                warnings.append(f"Model VRAM estimate ({vram_with_overhead:.1f}GB) exceeds GPU ({gpu_total}GB) - CPU offloading required")
            if params_b > 20 and gpu_total < 24:
                warnings.append("Large model on limited VRAM - expect slower inference")
            if is_moe and quant.lower() not in ("awq", "gptq", "fp8", "int4"):
                warnings.append("MoE model without quantization - high VRAM usage")

            return {
                "repo_id": repo_id,
                "model_name": model_info.get("model_name", repo_id.split("/")[-1]),
                "gpu": gpu,
                "model_info": {
                    "params_billions": params_b,
                    "quantization": quant,
                    "context_length": context_length,
                    "is_moe": is_moe,
                    "has_mtp_head": has_mtp_head,
                    "is_multimodal": is_multimodal,
                    "vram_estimate_gb": round(vram_with_overhead, 1),
                },
                "recommendations": recommendations,
                "warnings": warnings,
                "fits_without_offloading": vram_with_overhead <= gpu_total * 0.9,
            }
        except Exception as e:
            return {"error": str(e)}

    async def vram_advisor(self, repo_id: str, context_length: Optional[int] = None) -> dict:
        """Analyze VRAM requirements for a model across precisions and advise on GPU deployment."""
        try:
            model_info = await self.get_model_config(repo_id)
            if "error" in model_info:
                return model_info

            gpu = self._get_gpu()
            gpu_total = gpu.get("total_gb", 0)

            params_b = model_info.get("params_billions", 0) or 0
            if not params_b:
                # Fallback to estimate from repo_id
                params_b = _estimate_params_billions([], repo_id.split("/")[-1]) or 7.0

            ctx_len = context_length or model_info.get("context_length", 4096)

            precisions = ["fp16", "fp8", "int4"]
            options = {}
            best_fit = None

            for prec in precisions:
                est = _estimate_vram_gb(params_b, prec, ctx_len)
                fits = gpu_total > 0 and est <= gpu_total
                offload = max(0.0, round(est - gpu_total, 1))
                options[prec] = {
                    "vram_estimate_gb": est,
                    "fits_in_gpu": fits,
                    "required_cpu_offload_gb": offload
                }
                if fits and (best_fit is None or precisions.index(prec) < precisions.index(best_fit)):
                    best_fit = prec

            optimal_quant = best_fit or "int4"
            optimal_vram = options[optimal_quant]["vram_estimate_gb"]
            optimal_offload = options[optimal_quant]["required_cpu_offload_gb"]

            if best_fit:
                recommendation = (
                    f"Based on your GPU ({gpu.get('name', 'GPU')} with {gpu_total}GB VRAM), "
                    f"we recommend deploying this model in **{best_fit}** format. "
                    f"It will fit comfortably with an estimated VRAM usage of {optimal_vram}GB."
                )
            else:
                recommendation = (
                    f"Based on your GPU ({gpu.get('name', 'GPU')} with {gpu_total}GB VRAM), "
                    f"this model is too large to fit in GPU memory. We recommend using **int4** (or AWQ) format "
                    f"with {optimal_offload}GB CPU offloading."
                )

            return {
                "repo_id": repo_id,
                "gpu": gpu,
                "params_billions": round(params_b, 1),
                "context_length": ctx_len,
                "options": options,
                "optimal_quantization": optimal_quant,
                "recommendation": recommendation,
                "optimal_settings": {
                    "quantization": "awq" if optimal_quant == "int4" else "fp8" if optimal_quant == "fp8" else "",
                    "dtype": "float16" if optimal_quant == "int4" else "auto",
                    "cpu_offload_gb": int(optimal_offload),
                    "kv_cache_dtype": "fp8_e4m3" if optimal_quant == "fp16" and params_b > 20 else "auto"
                }
            }
        except Exception as e:
            return {"error": str(e)}

    async def get_quant_variants(self, repo_id: str) -> dict:
        """Search HuggingFace for quantized variants of a model."""
        try:
            model_name = repo_id.split("/")[-1] if "/" in repo_id else repo_id
            org = repo_id.split("/")[0] if "/" in repo_id else ""

            # Search for variants with quantization suffixes
            search_terms = [model_name]
            for suffix in ["-AWQ", "-GPTQ", "-FP8", "-int4", "-int8", "-GGUF"]:
                search_terms.append(f"{model_name}{suffix}")

            variants = []
            seen_ids = set()

            # Search by model name
            results = hf_api.list_models(search=model_name, limit=50)
            for m in results:
                mid = m.modelId
                if mid in seen_ids or mid == repo_id:
                    continue
                seen_ids.add(mid)

                # Check if it's a quantized variant of the same model
                mid_name = mid.split("/")[-1] if "/" in mid else mid
                tags = list(getattr(m, "tags", []))
                lib = getattr(m, "library_name", None)

                # Detect quantization from tags or name
                quant = _detect_quantization(tags, mid_name)
                fmt = _detect_format(tags, lib)

                is_variant = False
                quant_type = ""

                if quant:
                    quant_type = quant
                    is_variant = True
                elif "awq" in mid_name.lower():
                    quant_type = "awq"
                    is_variant = True
                elif "gptq" in mid_name.lower():
                    quant_type = "gptq"
                    is_variant = True
                elif "fp8" in mid_name.lower() or "eetq" in mid_name.lower():
                    quant_type = "fp8"
                    is_variant = True
                elif "gguf" in mid_name.lower() or fmt == "gguf":
                    quant_type = "gguf"
                    is_variant = True
                elif "int4" in mid_name.lower() or "int8" in mid_name.lower():
                    quant_type = mid_name.lower().split("model")[-1].split("-")[0] if "int" in mid_name.lower() else ""
                    is_variant = True

                # Also check if same org and similar name (fuzzy match)
                if not is_variant and org and mid.startswith(org + "/"):
                    # Check if the base name is similar
                    base = model_name.lower().replace("instruct", "").replace("chat", "").strip("-_ ")
                    variant_base = mid_name.lower().replace("instruct", "").replace("chat", "").strip("-_ ")
                    if base[:10] == variant_base[:10] and any(q in mid_name.lower() for q in ["awq", "gptq", "fp8", "int4", "int8", "gguf"]):
                        quant_type = next((q for q in ["awq", "gptq", "fp8", "int4", "int8", "gguf"] if q in mid_name.lower()), "unknown")
                        is_variant = True

                if is_variant:
                    params_b = _estimate_params_billions(tags, mid_name, getattr(m, "config", None))
                    variants.append({
                        "repo_id": mid,
                        "quantization": quant_type,
                        "downloads": getattr(m, "downloads", 0),
                        "likes": getattr(m, "likes", 0),
                        "params_billions": params_b,
                    })

            # Sort by downloads
            variants.sort(key=lambda v: v["downloads"], reverse=True)

            return {
                "base_model": repo_id,
                "variants": variants[:20],
                "total": len(variants),
            }
        except Exception as e:
            return {"variants": [], "total": 0, "error": str(e)}

    async def scan_local_models(self) -> dict:
        """Scan common directories for locally downloaded models."""
        gpu = self._get_gpu()
        gpu_total = gpu.get("total_gb", 0)
        models = []
        seen = set()

        # Also scan the huggingface cache via the hub library for accuracy
        try:
            from huggingface_hub import scan_cache_dir
            cache_info = scan_cache_dir()
            for repo in cache_info.repos:
                repo_id = repo.repo_id
                if repo_id in seen:
                    continue
                seen.add(repo_id)

                size_bytes = repo.size_on_disk
                size_gb = round(size_bytes / 1e9, 1) if size_bytes > 0 else 0
                if size_bytes == 0:
                    continue

                model_name = repo_id.split("/")[-1] if "/" in repo_id else repo_id

                # Find snapshot path and read config.json
                snapshot_path = ""
                config_data = None
                has_safetensors = False
                for rev in repo.revisions:
                    rev_path = rev.commit_hash or ""
                    # HF cache stores files directly in revision dir
                    for f in rev.files:
                        if f.file_name.endswith(".safetensors"):
                            has_safetensors = True
                    # Find the actual directory
                    if hasattr(rev, 'snapshot_path'):
                        snapshot_path = str(rev.snapshot_path)
                    elif rev_path:
                        candidate = os.path.join(
                            os.path.expanduser("~"), ".cache", "huggingface", "hub",
                            f"models--{repo_id.replace('/', '--')}",
                            "snapshots", rev_path
                        )
                        if os.path.isdir(candidate):
                            snapshot_path = candidate

                # Read config.json from snapshot
                if snapshot_path and os.path.isdir(snapshot_path):
                    config_path = os.path.join(snapshot_path, "config.json")
                    if os.path.isfile(config_path):
                        try:
                            with open(config_path, "r", encoding="utf-8") as fh:
                                config_data = json.load(fh)
                            for f in os.listdir(snapshot_path):
                                if f.endswith(".safetensors"):
                                    has_safetensors = True
                        except Exception:
                            pass

                # Extract model info
                params_b = None
                context_length = 4096
                architectures = []
                quant_config = {}
                is_moe = False

                if config_data:
                    num_params = config_data.get("num_parameters")
                    if num_params:
                        params_b = num_params / 1e9
                    context_length = (
                        config_data.get("max_position_embeddings")
                        or config_data.get("n_positions")
                        or config_data.get("seq_length")
                        or 4096
                    )
                    architectures = config_data.get("architectures", [])
                    quant_config = config_data.get("quantization_config", {})
                    # Detect MoE
                    arch_str = " ".join(architectures).lower() if architectures else ""
                    is_moe = "moe" in arch_str or "mixtral" in arch_str or "qwen2_moe" in arch_str

                if params_b is None:
                    params_b = _estimate_params_billions([], model_name)

                # Detect quantization
                quant = _detect_quantization([], model_name)
                if not quant and quant_config:
                    quant_method = quant_config.get("quant_method", "")
                    if quant_method:
                        quant = quant_method

                # Check compatibility issues
                warnings = []
                compatible = True
                quant_method_full = quant_config.get("quant_method", "") if quant_config else ""

                # Known incompatible: CompressedTensors WNA16 + Marlin on non-divisible dims
                if quant_method_full == "compressed_tensors" or "compressed_tensors" in str(quant_config):
                    warnings.append("CompressedTensors quantization may have Marlin tile compatibility issues with some MoE models")
                    # Don't mark incompatible outright, just warn

                if quant and "awq" in quant.lower() and is_moe:
                    # Check if it's actually compressed_tensors underneath
                    if quant_method_full and quant_method_full != "awq":
                        warnings.append(f"Model claims AWQ but config uses '{quant_method_full}' - may need --quantization {quant_method_full}")

                if is_moe and not quant:
                    warnings.append("MoE model - ensure enough VRAM for all experts or use quantization")

                # Estimate VRAM
                vram_gb = _estimate_vram_gb(params_b or 0, quant, context_length) if params_b else 0
                fits = gpu_total > 0 and vram_gb > 0 and vram_gb <= gpu_total

                fmt = "safetensors" if has_safetensors else "unknown"

                # Determine recommended quantization
                recommended_quant = quant
                if not quant and params_b and params_b > 14 and gpu_total < 24:
                    recommended_quant = "awq"
                    warnings.append(f"Model is {params_b}B with only {gpu_total}GB GPU - recommend AWQ quantization")

                models.append({
                    "repo_id": repo_id,
                    "model_name": model_name,
                    "local_path": snapshot_path,
                    "size_gb": size_gb,
                    "format": fmt,
                    "quantization": quant,
                    "quantization_method": quant_method_full,
                    "params_billions": round(params_b, 1) if params_b else None,
                    "vram_estimate_gb": vram_gb,
                    "fits_in_gpu": fits,
                    "context_length": context_length,
                    "architectures": architectures,
                    "is_moe": is_moe,
                    "compatible": compatible,
                    "warnings": warnings,
                    "recommended_quant": recommended_quant,
                    "tokens": _estimate_max_tokens(context_length, params_b or 0, vram_gb) if params_b else None,
                })

        except Exception:
            # Fallback: scan directories manually
            pass

        # Also scan extra directories that might not be in HF cache
        extra_dirs = [
            "/home/caio/models",
            "/data/models",
            "/mnt/models",
            os.path.expanduser("~/models"),
        ]
        for base_dir in extra_dirs:
            if not os.path.isdir(base_dir):
                continue
            for entry in os.listdir(base_dir):
                full_path = os.path.join(base_dir, entry)
                if not os.path.isdir(full_path):
                    continue
                # Check if it has model files
                has_model_files = any(
                    f.endswith(('.safetensors', '.bin', '.gguf'))
                    for f in os.listdir(full_path)[:50]
                )
                if not has_model_files:
                    continue

                repo_id = entry
                if repo_id in seen:
                    continue
                seen.add(repo_id)

                # Read config.json
                config_data = None
                config_path = os.path.join(full_path, "config.json")
                if os.path.isfile(config_path):
                    try:
                        with open(config_path, "r", encoding="utf-8") as fh:
                            config_data = json.load(fh)
                    except Exception:
                        pass

                size_bytes = 0
                has_safetensors = False
                try:
                    for root, dirs, files in os.walk(full_path):
                        for f in files:
                            fpath = os.path.join(root, f)
                            try:
                                size_bytes += os.path.getsize(fpath)
                            except OSError:
                                pass
                            if f.endswith(".safetensors"):
                                has_safetensors = True
                except Exception:
                    pass

                size_gb = round(size_bytes / 1e9, 1) if size_bytes > 0 else 0
                if size_bytes == 0:
                    continue

                params_b = None
                context_length = 4096
                architectures = []
                quant_config = {}
                is_moe = False

                if config_data:
                    num_params = config_data.get("num_parameters")
                    if num_params:
                        params_b = num_params / 1e9
                    context_length = (
                        config_data.get("max_position_embeddings")
                        or config_data.get("n_positions")
                        or config_data.get("seq_length")
                        or 4096
                    )
                    architectures = config_data.get("architectures", [])
                    quant_config = config_data.get("quantization_config", {})
                    arch_str = " ".join(architectures).lower() if architectures else ""
                    is_moe = "moe" in arch_str or "mixtral" in arch_str

                if params_b is None:
                    params_b = _estimate_params_billions([], entry)

                quant = _detect_quantization([], entry)
                if not quant and quant_config:
                    qm = quant_config.get("quant_method", "")
                    if qm:
                        quant = qm

                quant_method_full = quant_config.get("quant_method", "") if quant_config else ""
                warnings = []
                if quant_method_full == "compressed_tensors":
                    warnings.append("CompressedTensors quantization may have compatibility issues")

                vram_gb = _estimate_vram_gb(params_b or 0, quant, context_length) if params_b else 0
                fits = gpu_total > 0 and vram_gb > 0 and vram_gb <= gpu_total

                models.append({
                    "repo_id": repo_id,
                    "model_name": entry,
                    "local_path": full_path,
                    "size_gb": size_gb,
                    "format": "safetensors" if has_safetensors else "unknown",
                    "quantization": quant,
                    "quantization_method": quant_method_full,
                    "params_billions": round(params_b, 1) if params_b else None,
                    "vram_estimate_gb": vram_gb,
                    "fits_in_gpu": fits,
                    "context_length": context_length,
                    "architectures": architectures,
                    "is_moe": is_moe,
                    "compatible": True,
                    "warnings": warnings,
                    "recommended_quant": quant,
                    "tokens": _estimate_max_tokens(context_length, params_b or 0, vram_gb) if params_b else None,
                })

        # Sort: fitting models first, then by size descending
        models.sort(key=lambda m: (0 if m["fits_in_gpu"] else 1, -m["size_gb"]))

        return {
            "models": models,
            "total": len(models),
            "gpu": gpu,
            "scanned_dirs": _get_model_scan_dirs() + [d for d in extra_dirs if os.path.isdir(d)],
        }

    async def locate_model(self, repo_id: str) -> dict:
        """Find a model's location on disk, size, format, and key files."""
        # Check HF cache first
        try:
            cache_info = scan_cache_dir()
            for repo in cache_info.repos:
                if repo.repo_id == repo_id:
                    snapshot_path = ""
                    files = []
                    for rev in repo.revisions:
                        if hasattr(rev, 'snapshot_path'):
                            snapshot_path = str(rev.snapshot_path)
                        elif rev.commit_hash:
                            candidate = os.path.join(
                                os.path.expanduser("~"), ".cache", "huggingface", "hub",
                                f"models--{repo_id.replace('/', '--')}",
                                "snapshots", rev.commit_hash
                            )
                            if os.path.isdir(candidate):
                                snapshot_path = candidate
                        files = [f.file_name for f in rev.files]

                    if not snapshot_path and repo.revisions:
                        rev = repo.revisions[0]
                        if rev.commit_hash:
                            snapshot_path = os.path.join(
                                os.path.expanduser("~"), ".cache", "huggingface", "hub",
                                f"models--{repo_id.replace('/', '--')}",
                                "snapshots", rev.commit_hash
                            )

                    fmt = "unknown"
                    for f in files:
                        if f.endswith(".safetensors"):
                            fmt = "safetensors"
                            break
                        elif f.endswith(".gguf"):
                            fmt = "gguf"
                            break
                        elif f.endswith(".bin"):
                            fmt = "pytorch"
                            break

                    return {
                        "repo_id": repo_id,
                        "local_path": snapshot_path,
                        "size_gb": round(repo.size_on_disk / 1e9, 2),
                        "format": fmt,
                        "files": files[:50],
                    }
        except Exception:
            pass

        # Check extra directories
        extra_dirs = ["/home/caio/models", "/data/models", "/mnt/models", os.path.expanduser("~/models")]
        for base_dir in extra_dirs:
            full_path = os.path.join(base_dir, repo_id.split("/")[-1] if "/" in repo_id else repo_id)
            if os.path.isdir(full_path):
                files = []
                size_bytes = 0
                for root, dirs, fnames in os.walk(full_path):
                    for f in fnames:
                        fpath = os.path.join(root, f)
                        try:
                            size_bytes += os.path.getsize(fpath)
                        except OSError:
                            pass
                        rel = os.path.relpath(fpath, full_path)
                        files.append(rel)
                        if len(files) >= 200:
                            break

                fmt = "unknown"
                for f in files:
                    if f.endswith(".safetensors"):
                        fmt = "safetensors"
                        break
                    elif f.endswith(".gguf"):
                        fmt = "gguf"
                        break
                    elif f.endswith(".bin"):
                        fmt = "pytorch"
                        break

                return {
                    "repo_id": repo_id,
                    "local_path": full_path,
                    "size_gb": round(size_bytes / 1e9, 2),
                    "format": fmt,
                    "files": files[:50],
                }

        return {"error": f"Model {repo_id} not found locally"}

    async def delete_model(self, repo_id: str) -> dict:
        """Delete a model from HF cache or extra directories."""
        freed_bytes = 0
        deleted_path = ""
        import shutil

        # Try HF cache first – manually delete the directory
        cache_base = os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub")
        cache_dir = os.path.join(cache_base, f"models--{repo_id.replace('/', '--')}")

        if os.path.isdir(cache_dir):
            for root, dirs, fnames in os.walk(cache_dir):
                for f in fnames:
                    try:
                        fp = os.path.join(root, f)
                        if os.path.isfile(fp) and not os.path.islink(fp):
                            freed_bytes += os.path.getsize(fp)
                    except OSError:
                        pass
            deleted_path = cache_dir
            shutil.rmtree(cache_dir, ignore_errors=True)
            return {
                "repo_id": repo_id,
                "deleted_path": deleted_path,
                "freed_bytes": freed_bytes,
                "freed_gb": round(freed_bytes / 1e9, 2),
            }

        # Try extra directories
        extra_dirs = ["/home/caio/models", "/data/models", "/mnt/models", os.path.expanduser("~/models")]
        model_name = repo_id.split("/")[-1] if "/" in repo_id else repo_id
        for base_dir in extra_dirs:
            full_path = os.path.join(base_dir, model_name)
            if os.path.isdir(full_path):
                for root, dirs, fnames in os.walk(full_path):
                    for f in fnames:
                        try:
                            freed_bytes += os.path.getsize(os.path.join(root, f))
                        except OSError:
                            pass
                deleted_path = full_path
                shutil.rmtree(full_path, ignore_errors=True)
                return {
                    "repo_id": repo_id,
                    "deleted_path": deleted_path,
                    "freed_bytes": freed_bytes,
                    "freed_gb": round(freed_bytes / 1e9, 2),
                }

        return {"error": f"Model {repo_id} not found locally"}

    async def validate_model_config(self, model_path: str, quantization: str = "", dtype: str = "auto", extra: dict | None = None) -> dict:
        """Validate a model configuration before starting. Returns warnings/errors."""
        warnings = []
        errors = []
        suggestions = []
        config_data = None
        extra = extra or {}

        # Try to find and read config.json
        config_path = None
        search_paths = [
            os.path.join(model_path, "config.json"),
        ]
        # Also check HF cache format
        if "/" in model_path or model_path.startswith("models--"):
            hf_path = os.path.join(
                os.path.expanduser("~"), ".cache", "huggingface", "hub",
                f"models--{model_path.replace('/', '--')}",
            )
            if os.path.isdir(hf_path):
                snapshots_dir = os.path.join(hf_path, "snapshots")
                if os.path.isdir(snapshots_dir):
                    for rev in sorted(os.listdir(snapshots_dir), reverse=True):
                        candidate = os.path.join(snapshots_dir, rev, "config.json")
                        if os.path.isfile(candidate):
                            config_path = candidate
                            break

        for p in search_paths:
            if os.path.isfile(p):
                config_path = p
                break

        if config_path:
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    config_data = json.load(f)
            except Exception:
                pass

        if config_data:
            architectures = config_data.get("architectures", [])
            quant_config = config_data.get("quantization_config", {})
            num_params = config_data.get("num_parameters", 0)
            params_b = num_params / 1e9 if num_params else 0
            is_moe = any("moe" in a.lower() for a in architectures) if architectures else False

            quant_method = quant_config.get("quant_method", "")

            # Check 1: CompressedTensors + Marlin tile issue
            if quant_method == "compressed_tensors" or quant_method == "compressed-tensors":
                warnings.append(
                    "Model uses CompressedTensors quantization. This may cause "
                    "'size_n not divisible by tile_n_size' errors with MoE models. "
                    "If loading fails, try: --quantization bitsandbytes"
                )
                suggestions.append("Use --quantization bitsandbytes if Marlin fails")

            # Check 2: AWQ model but wrong quantization flag
            if quantization == "awq" and quant_method and quant_method != "awq":
                warnings.append(
                    f"Model config says quant_method='{quant_method}' but you selected AWQ. "
                    f"Try --quantization {quant_method} instead"
                )

            # Check 3: MoE + no quantization on small GPU
            gpu = self._get_gpu()
            gpu_total = gpu.get("total_gb", 0)
            if is_moe and not quantization and params_b > 20 and gpu_total < 24:
                warnings.append(
                    f"MoE model ({params_b}B params) without quantization on {gpu_total}GB GPU. "
                    f"This will likely OOM. Use AWQ/FP8 quantization."
                )
                suggestions.append("Add --quantization awq or --quantization fp8")

            # Check 4: dtype + quantization compatibility
            if quantization and "awq" in quantization.lower() and dtype in ("bfloat16", "bf16"):
                warnings.append("AWQ models require float16, not bfloat16. Forcing float16.")
                suggestions.append("--dtype float16 (auto-applied)")

            # Check 5: Vision/language hybrid without --enable-multimodal
            is_vision = any("vision" in a.lower() or "clip" in a.lower() or "conditional" in a.lower() for a in architectures)
            if is_vision:
                suggestions.append("This is a vision model - enable --enable-multimodal if using images")

            # Check 6: Gemma4 specific known issues
            if any("gemma4" in a.lower() or "gemma-4" in a.lower() for a in architectures):
                if quant_method == "compressed_tensors" or (quant_config and "compressed_tensors" in str(quant_config)):
                    errors.append(
                        "KNOWN ISSUE: Gemma4 + CompressedTensors AWQ crashes with "
                        "'gptq_marlin_repack: size_n not divisible by tile_n_size'. "
                        "This is a sglang bug. Workarounds:\n"
                        "  1. Use --quantization bitsandbytes\n"
                        "  2. Find a non-CompressedTensors AWQ version of this model\n"
                        "  3. Use the unquantized model with enough VRAM"
                    )

            # Check 7: VRAM estimate
            vram_gb = _estimate_vram_gb(params_b, quantization or quant_method or "fp16", 4096)
            if gpu_total > 0 and vram_gb > gpu_total:
                errors.append(
                    f"Estimated VRAM ({vram_gb}GB) exceeds GPU ({gpu_total}GB). "
                    f"Use quantization or a smaller model."
                )

            # Check 8: flag compatibility
            spec_algo = extra.get("speculative_algorithm")
            if spec_algo:
                model_arch = " ".join(architectures).lower() if architectures else ""
                if any(x in model_arch for x in ["mamba", "qwen3"]):
                    warnings.append(
                        f"Speculative decoding ({spec_algo}) with {architectures} needs "
                        f"--mamba-scheduler-strategy extra_buffer and SGLANG_ENABLE_SPEC_V2=1"
                    )
                    suggestions.append("SGLANG_ENABLE_SPEC_V2=1 and --mamba-scheduler-strategy extra_buffer will be auto-applied")

            dp_attention = extra.get("enable_dp_attention")
            ep_size = extra.get("ep_size", 0) or 0
            if dp_attention and is_moe and ep_size <= 1:
                warnings.append("--enable-dp-attention requires --ep-size > 1 for MoE models")

            tp = extra.get("tensor_parallel_size", 1) or 1
            pp = extra.get("pp_size", 1) or 1
            gpu_count = gpu.get("count", 1)
            if tp > gpu_count:
                errors.append(f"Tensor parallelism ({tp}) exceeds GPU count ({gpu_count})")
            if pp > gpu_count:
                errors.append(f"Pipeline parallelism ({pp}) exceeds GPU count ({gpu_count})")
            if tp * pp > gpu_count:
                errors.append(f"TP×PP ({tp}×{pp}={tp*pp}) exceeds GPU count ({gpu_count})")

            cpu_offload = extra.get("cpu_offload_gb", 0) or 0
            if cpu_offload > 0 and params_b > 0:
                model_est = params_b * 2  # fp16 rough
                max_useful = min(model_est, gpu_total * 0.9)
                if cpu_offload > max_useful:
                    warnings.append(
                        f"CPU offload ({cpu_offload}GB) exceeds useful amount (~{max_useful:.0f}GB)"
                    )

            mem_frac = extra.get("mem_fraction_static")
            if mem_frac is not None and mem_frac > 0.95:
                warnings.append(f"mem_fraction_static ({mem_frac}) leaves no headroom — risk of OOM")
            elif mem_frac is not None and mem_frac < 0.5:
                suggestions.append(f"Increase mem_fraction_static from {mem_frac} to 0.75-0.88 for better throughput")

            if quantization and "awq" in quantization.lower():
                suggestions.append("Use --quantization awq_marlin for ~2x faster inference than awq")

            return {
                "valid": len(errors) == 0,
                "warnings": warnings,
                "errors": errors,
                "suggestions": suggestions,
                "model_info": {
                    "architectures": architectures,
                    "params_billions": round(params_b, 1) if params_b else None,
                    "is_moe": is_moe,
                    "quantization_method": quant_method,
                    "vram_estimate_gb": vram_gb,
                },
            }

        return {"valid": True, "warnings": [], "errors": [], "suggestions": [], "model_info": None}

    async def get_gpu_processes(self) -> dict:
        result = _gpu_live_info()
        gpus = result.get("gpus", [])
        for g in gpus:
            g["utilization"] = round(g.get("used_mb", 0) / max(g.get("total_mb", 1), 1) * 100, 1)
            g["processes"] = []
        return result

    async def get_live_gpu_status(self) -> dict:
        result = _gpu_detailed_status()
        return result


model_manager = ModelManager()
