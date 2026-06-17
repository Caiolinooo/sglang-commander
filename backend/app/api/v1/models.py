from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.models import DeployModelRequest, DownloadModelRequest
from app.services.model_manager import model_manager
from app.services.server_manager import server_manager

router = APIRouter()


@router.get("/search")
async def search_models(
    query: str = Query(default="", max_length=200),
    limit: int = Query(default=20, ge=1, le=100),
    task: str = Query(default=None),
    library: str = Query(default=None),
    license: str = Query(default=None),
    framework: str = Query(default=None),
    language: str = Query(default=None),
    author: str = Query(default=None),
    sort_by: str = Query(default="downloads"),
    sort_dir: int = Query(default=-1),
    min_params: float = Query(default=None),
    max_params: float = Query(default=None),
    quantization: str = Query(default=None),
    format: str = Query(default=None),
    fits_gpu: bool = Query(default=False),
    multimodal: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
):
    return await model_manager.search_hf(
        query=query,
        limit=limit,
        task=task or None,
        library=library or None,
        license_filter=license or None,
        framework=framework or None,
        language=language or None,
        author=author or None,
        sort_by=sort_by,
        sort_dir=sort_dir,
        min_params=min_params,
        max_params=max_params,
        quantization=quantization or None,
        format_filter=format or None,
        fits_gpu=fits_gpu,
        multimodal=multimodal,
    )


@router.get("/gpu")
async def get_gpu_info(current_user: User = Depends(get_current_user)):
    return await model_manager.get_gpu_info()


@router.get("/validate-token")
async def validate_hf_token(current_user: User = Depends(get_current_user)):
    return await model_manager.validate_token()


@router.post("/download")
async def download_model(
    req: DownloadModelRequest,
    current_user: User = Depends(get_current_user),
):
    return await model_manager.download_model(req.repo_id, req.revision)


@router.get("/download-status/{repo_id:path}")
async def download_status(repo_id: str):
    from urllib.parse import unquote
    decoded = unquote(repo_id)
    status = await model_manager.get_download_status(decoded)
    if status.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Download task not found")
    return status


@router.get("/local")
async def list_local_models():
    return await model_manager.list_local_models()


@router.get("/local-scan")
async def scan_local_models():
    return await model_manager.scan_local_models()


@router.get("/locate/{repo_id:path}")
async def locate_model(repo_id: str, current_user: User = Depends(get_current_user)):
    result = await model_manager.locate_model(repo_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.delete("/local/{repo_id:path}")
async def delete_model(repo_id: str, current_user: User = Depends(get_current_user)):
    result = await model_manager.delete_model(repo_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.post("/deploy")
async def deploy_model(
    req: DeployModelRequest,
    current_user: User = Depends(get_current_user),
):
    config = {
        "model_path": req.repo_id,
        "host": req.host,
        "port": req.port,
        "tensor_parallel_size": req.tensor_parallel_size,
        "trust_remote_code": req.trust_remote_code,
    }
    if req.quantization:
        config["quantization"] = req.quantization
    if req.dtype:
        config["dtype"] = req.dtype
    if req.context_length:
        config["context_length"] = req.context_length
    if req.tool_call_parser:
        config["tool_call_parser"] = req.tool_call_parser
    if req.reasoning_parser:
        config["reasoning_parser"] = req.reasoning_parser
    if req.enable_multimodal is not None:
        config["enable_multimodal"] = req.enable_multimodal
    if req.load_format:
        config["load_format"] = req.load_format
    if req.speculative_algorithm:
        config["speculative_algorithm"] = req.speculative_algorithm
    if req.speculative_num_steps is not None:
        config["speculative_num_steps"] = req.speculative_num_steps
    if req.speculative_draft_model_path:
        config["speculative_draft_model_path"] = req.speculative_draft_model_path
    if req.kv_cache_dtype:
        config["kv_cache_dtype"] = req.kv_cache_dtype
    if req.cpu_offload_gb is not None:
        config["cpu_offload_gb"] = req.cpu_offload_gb
    if req.mem_fraction_static is not None:
        config["mem_fraction_static"] = req.mem_fraction_static
    if req.max_running_requests is not None:
        config["max_running_requests"] = req.max_running_requests

    result = await server_manager.start(config)
    return result


@router.get("/card/{repo_id:path}")
async def model_card(repo_id: str):
    return await model_manager.get_model_card(repo_id)


@router.get("/info/{repo_id:path}")
async def model_info_endpoint(repo_id: str):
    return await model_manager.get_model_architecture(repo_id)


@router.get("/variants/{repo_id:path}")
async def get_quant_variants(repo_id: str, current_user: User = Depends(get_current_user)):
    return await model_manager.get_quant_variants(repo_id)


@router.get("/config/{repo_id:path}")
async def get_model_config(repo_id: str, current_user: User = Depends(get_current_user)):
    return await model_manager.get_model_config(repo_id)


@router.get("/recommendations/{repo_id:path}")
async def get_deployment_recommendations(repo_id: str, current_user: User = Depends(get_current_user)):
    return await model_manager.get_deployment_recommendations(repo_id)


@router.get("/advisor/{repo_id:path}")
async def get_vram_advisor(
    repo_id: str,
    context_length: int = Query(default=None),
    current_user: User = Depends(get_current_user),
):
    return await model_manager.vram_advisor(repo_id, context_length)


@router.get("/gpu-processes")
async def get_gpu_processes(current_user: User = Depends(get_current_user)):
    return await model_manager.get_gpu_processes()


@router.get("/gpu-live")
async def get_gpu_live(current_user: User = Depends(get_current_user)):
    return await model_manager.get_live_gpu_status()
