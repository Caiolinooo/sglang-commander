from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.server import ServerStartRequest, ServerStatusResponse
from app.services.server_manager import server_manager
from app.services.model_manager import model_manager, _estimate_vram_gb
from app.services.model_manager import model_manager

router = APIRouter()


@router.post("/start")
async def start_server(
    req: ServerStartRequest,
    current_user: User = Depends(get_current_user),
):
    # Run pre-start validation
    validation = await model_manager.validate_model_config(
        model_path=req.model_path,
        quantization=req.quantization or "",
        dtype=req.dtype or "auto",
    )
    if req.backend_type == "sglang" and validation.get("errors"):
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Model configuration has errors",
                "errors": validation["errors"],
                "warnings": validation.get("warnings", []),
                "suggestions": validation.get("suggestions", []),
                "model_info": validation.get("model_info"),
            }
        )

    result = await server_manager.start(req.model_dump())
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.post("/validate")
async def validate_model(
    req: ServerStartRequest,
    current_user: User = Depends(get_current_user),
):
    """Validate a model configuration without starting the server."""
    return await model_manager.validate_model_config(
        model_path=req.model_path,
        quantization=req.quantization or "",
        dtype=req.dtype or "auto",
        extra={
            "context_length": req.context_length,
            "tensor_parallel_size": req.tensor_parallel_size,
            "ep_size": req.ep_size,
            "pp_size": req.pp_size,
            "speculative_algorithm": req.speculative_algorithm,
            "enable_dp_attention": req.enable_dp_attention,
            "cpu_offload_gb": req.cpu_offload_gb,
            "mem_fraction_static": req.mem_fraction_static,
        },
    )


@router.post("/stop")
async def stop_server(current_user: User = Depends(get_current_user)):
    return await server_manager.stop()


@router.post("/vram-estimate")
async def vram_estimate(req: dict):
    """Calculate detailed VRAM estimate from config without starting the server."""
    params_b = req.get("params_billions", 0)
    quant = req.get("quantization", "")
    context_length = req.get("context_length", 4096)
    dtype = req.get("dtype", "auto")
    cpu_offload_gb = req.get("cpu_offload_gb", 0)
    tp = req.get("tensor_parallel_size", 1)
    ep = req.get("ep_size", 1)
    kv_cache_dtype = req.get("kv_cache_dtype", "auto")
    max_running = req.get("max_running_requests", 2)
    mem_fraction = req.get("mem_fraction_static", 0.88)
    enable_multimodal = req.get("enable_multimodal", False)
    speculative_algorithm = req.get("speculative_algorithm", "")
    speculative_draft_model_path = req.get("speculative_draft_model_path", "")

    # Get GPU info
    gpu = model_manager._get_gpu()
    total_gb = gpu.get("total_gb", 0)
    free_gb = gpu.get("free_gb", 0)

    # Model weights
    bytes_per_param = 2.0
    q = quant.lower()
    if any(x in q for x in ["awq", "gptq", "int4"]):
        bytes_per_param = 0.5
    elif "fp8" in q or "int8" in q:
        bytes_per_param = 1.0
    elif q in ("fp16", "bf16", "half", ""):
        bytes_per_param = 2.0
    elif "fp32" in q:
        bytes_per_param = 4.0
    if dtype == "float32":
        bytes_per_param = 4.0

    raw_weights = params_b * bytes_per_param
    model_weights = raw_weights / max(1, tp) / max(1, ep)
    cpu_offloaded = min(cpu_offload_gb, model_weights)
    weights_on_gpu = max(0, model_weights - cpu_offloaded)

    # KV Cache
    kv_bytes = 2.0
    if "fp4" in kv_cache_dtype.lower():
        kv_bytes = 0.5
    elif "fp8" in kv_cache_dtype.lower():
        kv_bytes = 1.0
    kv_base = 2.0
    kv_cache = kv_base * (max(1, context_length) / 4096) * (max(1, params_b) / 7) * (kv_bytes / 2.0) / max(1, tp)
    kv_cache = min(kv_cache, total_gb * mem_fraction)

    # Activations
    act = 0.5 * max(1, max_running) * (max(1, params_b) / 7) / max(1, tp)

    # Vision Tower (Multimodal)
    vision_tower_vram = 1.5 if enable_multimodal else 0.0

    # Speculative Decoding
    speculative_vram = 0.0
    if speculative_algorithm:
        if speculative_draft_model_path:
            draft_params = 1.0  # default fallback
            import re
            match = re.search(r"(\d+(\.\d+)?)[bB]", speculative_draft_model_path)
            if match:
                try:
                    draft_params = float(match.group(1))
                except Exception:
                    pass
            draft_raw_weights = draft_params * bytes_per_param
            speculative_vram = draft_raw_weights / max(1, tp)
        elif speculative_algorithm.upper() == "EAGLE":
            speculative_vram = max(1.0, model_weights * 0.15)
        elif speculative_algorithm.upper() == "NGRAM":
            speculative_vram = 0.2

    # Overhead
    overhead = 1.5

    total = weights_on_gpu + kv_cache + act + overhead + vision_tower_vram + speculative_vram
    fits = total <= free_gb * 0.95

    return {
        "gpu": gpu,
        "weights": round(weights_on_gpu, 2),
        "weights_raw": round(raw_weights, 2),
        "cpu_offloaded": round(cpu_offloaded, 2),
        "kv_cache": round(kv_cache, 2),
        "activations": round(act, 2),
        "vision_tower": round(vision_tower_vram, 2),
        "speculative": round(speculative_vram, 2),
        "overhead": overhead,
        "total": round(total, 2),
        "free_before": round(free_gb, 2),
        "free_after": round(total_gb - total, 2),
        "fits": fits,
        "bytes_per_param": bytes_per_param,
        "kv_bytes_per_elem": kv_bytes,
        "warnings": [],
    }
async def restart_server(
    req: dict | None = None,
    current_user: User = Depends(get_current_user),
):
    return await server_manager.restart(req)


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

@router.get("/args-registry")
async def get_args_registry():
    from shared.args_registry import ARGS_REGISTRY
    return {"args": ARGS_REGISTRY}
