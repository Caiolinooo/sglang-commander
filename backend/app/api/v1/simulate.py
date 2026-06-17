from fastapi import APIRouter, Query

router = APIRouter()


@router.get("/moe-split")
async def simulate_moe(
    params_b: float = Query(..., description="Total parameters in billions"),
    num_experts: int = Query(8, description="Total number of MoE experts"),
    active_experts: int = Query(2, description="Experts activated per token"),
    quantization: str = Query("fp16", description="Quantization format"),
    cpu_offload_gb: float = Query(0, description="GB to offload to CPU"),
):
    from app.services.performance_simulator import simulate_moe_split
    result = simulate_moe_split(
        total_params_b=params_b,
        num_experts=num_experts,
        active_experts=active_experts,
        quantization=quantization,
        cpu_offload_gb=cpu_offload_gb,
    )
    return result


@router.get("/find-best")
async def find_best(
    params_b: float = Query(..., description="Total parameters in billions"),
    num_experts: int = Query(8, description="Total number of MoE experts"),
    active_experts: int = Query(2, description="Experts activated per token"),
):
    from app.services.performance_simulator import find_best_config
    results = find_best_config(
        total_params_b=params_b,
        num_experts=num_experts,
        active_experts=active_experts,
    )
    return {"configurations": results, "count": len(results)}


@router.get("/dense-model")
async def simulate_dense(
    params_b: float = Query(..., description="Total parameters in billions"),
    quantization: str = Query("fp16"),
    context_length: int = Query(4096),
    cpu_offload_gb: float = Query(0),
):
    from app.services.performance_simulator import simulate_generic_model
    return simulate_generic_model(
        params_b=params_b,
        quantization=quantization,
        context_length=context_length,
        cpu_offload_gb=cpu_offload_gb,
    )
