"""Performance simulator — predicts model runtime behavior for different configs.

Supports:
  - MoE CPU/GPU split simulation (expert offloading)
  - VRAM vs performance tradeoff predictions
  - Recommended configs based on real-time system state
  - Live-updating estimate as system load changes
"""

from typing import Optional

from app.services.gpu_detector import (
    get_basic_info as _gpu_info,
)
from app.services.model_manager import _estimate_vram_gb

# Empirical throughput baselines (tokens/sec per GB of GPU compute)
# These are calibrated estimates used for simulation
_VENDOR_THROUGHPUT_BASELINE = {
    "nvidia": {
        "fp16": 2.8, "int8": 4.2, "int4": 6.0, "fp8": 5.0,
    },
    "amd": {
        "fp16": 2.2, "int8": 3.5, "int4": 5.0, "fp8": 4.0,
    },
    "intel": {
        "fp16": 1.8, "int8": 3.0, "int4": 4.5, "fp8": 3.5,
    },
    "apple": {
        "fp16": 1.5, "int8": 2.5, "int4": 3.5, "fp8": 2.8,
    },
}

# CPU throughput baseline (tokens/sec when running on CPU)
_CPU_THROUGHPUT_BASELINE = 0.15  # Very rough: ~1 token per 6-7 seconds per expert

# Default latency penalty per offloaded expert (seconds)
_CPU_EXPERT_LATENCY_PENALTY = {
    1: 0.05, 2: 0.12, 4: 0.25, 8: 0.50, 16: 1.0, 32: 2.0,
}


def _quant_key(q: str) -> str:
    ql = q.lower()
    if "int4" in ql or "awq" in ql or "gptq" in ql:
        return "int4"
    if "int8" in ql:
        return "int8"
    if "fp8" in ql:
        return "fp8"
    return "fp16"


def _estimate_cpu_offload_penalty(num_experts_offloaded: int, cpu_ram_gb: float) -> float:
    """Estimate latency penalty in seconds per token from CPU offloading.

    Based on PCIe bandwidth and CPU RAM speed. More offloaded experts
    means more CPU<->GPU transfers per token.
    """
    base = _CPU_EXPERT_LATENCY_PENALTY
    for k in sorted(base.keys(), reverse=True):
        if num_experts_offloaded >= k:
            latency = base[k]
            break
    else:
        latency = 0.02

    ram_factor = max(0.5, min(2.0, 32.0 / max(cpu_ram_gb, 1)))
    return latency * ram_factor


def simulate_moe_split(
    total_params_b: float,
    num_experts: int,
    active_experts: int,
    quantization: str = "fp16",
    cpu_offload_gb: float = 0.0,
    gpu_info: Optional[dict] = None,
    system_metrics: Optional[dict] = None,
) -> dict:
    """Simulate MoE model performance with optional CPU expert offloading.

    Args:
        total_params_b: Total model parameters in billions
        num_experts: Total number of experts in MoE
        active_experts: Experts activated per token
        quantization: Model quantization format
        cpu_offload_gb: GB of model to offload to CPU (0 = full GPU)
        gpu_info: Current GPU info dict (from gpu_detector)
        system_metrics: Current system metrics (CPU load, RAM, etc.)

    Returns:
        dict with performance predictions
    """
    gpu = gpu_info or _gpu_info()
    system = system_metrics or {}

    total_vram = gpu.get("total_gb", 0) or 0
    free_vram = gpu.get("free_gb", 0) or 0
    count = gpu.get("count", 0) or 1
    vendor = gpu.get("vendor", "nvidia")
    cpu_ram_gb = system.get("ram_total_gb", 16) or 16
    cpu_load = system.get("cpu_percent", 0) or 0

    qk = _quant_key(quantization)
    vram_per_param = {"fp16": 2, "int8": 1, "int4": 0.5, "fp8": 1}.get(qk, 2)
    model_vram_gb = total_params_b * vram_per_param

    gpu_throughput = _VENDOR_THROUGHPUT_BASELINE.get(vendor, _VENDOR_THROUGHPUT_BASELINE["nvidia"]).get(qk, 2.8)
    params_per_expert = total_params_b / max(num_experts, 1)

    # Experts that fit in VRAM after reserving framework overhead
    framework_overhead = 2.0
    usable_vram = free_vram - framework_overhead - cpu_offload_gb
    if usable_vram < 0:
        usable_vram = 0

    # Non-expert weights (dense parameters that must stay on GPU)
    dense_ratio = 0.3  # ~30% of params are dense (attention, embeddings, etc.)
    dense_gb = total_params_b * dense_ratio * vram_per_param

    experts_in_gpu = 0
    experts_in_cpu = 0
    vram_for_experts = max(0, usable_vram - dense_gb)
    vram_per_expert = params_per_expert * vram_per_param

    if vram_per_expert > 0:
        experts_in_gpu = min(int(vram_for_experts / vram_per_expert), num_experts)
        experts_in_cpu = num_experts - experts_in_gpu

    # Throughput simulation
    if experts_in_cpu > 0:
        cpu_penalty = _estimate_cpu_offload_penalty(experts_in_cpu, cpu_ram_gb)
        cpu_load_factor = max(0.3, 1.0 - cpu_load / 200.0)
        cpu_penalty *= (1.0 + (1.0 - cpu_load_factor))

        # Active experts that hit CPU per token
        active_cpu_experts = min(active_experts, experts_in_cpu)
        latency_penalty_ms = active_cpu_experts * cpu_penalty * 1000

        total_active = max(active_experts, 1)
        gpu_experts_active = max(active_experts - active_cpu_experts, 1)
        gpu_ratio = gpu_experts_active / total_active
        cpu_ratio = active_cpu_experts / total_active

        est_tokens_per_sec = (
            gpu_ratio * gpu_throughput * min(count, 2) * (1 + 1 / max(active_experts, 1))
            + cpu_ratio * _CPU_THROUGHPUT_BASELINE * cpu_load_factor
        )
        est_latency_ms = (1.0 / max(est_tokens_per_sec, 0.01)) * 1000 + latency_penalty_ms
    else:
        est_tokens_per_sec = gpu_throughput * count
        est_latency_ms = (1.0 / max(est_tokens_per_sec, 0.01)) * 1000
        latency_penalty_ms = 0
        active_cpu_experts = 0

    vram_used = dense_gb + experts_in_gpu * vram_per_expert + framework_overhead + cpu_offload_gb

    return {
        "model": {
            "params_billions": total_params_b,
            "num_experts": num_experts,
            "active_experts": active_experts,
            "quantization": quantization,
            "model_vram_estimate_gb": round(model_vram_gb, 1),
            "dense_weights_gb": round(dense_gb, 1),
        },
        "config": {
            "cpu_offload_gb": cpu_offload_gb,
            "experts_on_gpu": experts_in_gpu,
            "experts_on_cpu": experts_in_cpu,
            "active_cpu_experts_per_token": active_cpu_experts,
        },
        "performance": {
            "estimated_tokens_per_sec": round(est_tokens_per_sec, 1),
            "estimated_latency_ms": round(est_latency_ms, 1),
            "cpu_penalty_ms_per_token": round(latency_penalty_ms, 1),
            "vram_used_gb": round(vram_used, 1),
            "vram_free_gb": round(free_vram - vram_used + cpu_offload_gb, 1),
            "vram_total_gb": total_vram,
        },
        "gpu": {
            "vendor": vendor,
            "name": gpu.get("name", "Unknown"),
            "count": count,
        },
        "grade": _grade_simulation(est_tokens_per_sec, latency_penalty_ms, experts_in_cpu),
    }


def _grade_simulation(tps: float, latency_penalty: float, experts_on_cpu: int) -> dict:
    """Assign a qualitative grade to the simulation result."""
    if experts_on_cpu > 0:
        if latency_penalty < 0.1:
            quality = "good"
            note = "Minor CPU offload, minimal impact"
        elif latency_penalty < 0.3:
            quality = "fair"
            note = "Some CPU offload, expect moderate slowdown"
        elif latency_penalty < 0.8:
            quality = "poor"
            note = "Heavy CPU offload, significant latency expected"
        else:
            quality = "unusable"
            note = "Too many experts on CPU, will be very slow"
    else:
        quality = "excellent"
        note = "All experts fit on GPU — optimal"

    if tps < 1:
        quality = "unusable"
        note = "Throughput too low for practical use"

    level = {"excellent": 5, "good": 4, "fair": 3, "poor": 2, "unusable": 1}
    return {"quality": quality, "score": level.get(quality, 1), "note": note}


def find_best_config(
    total_params_b: float,
    num_experts: int,
    active_experts: int,
    quantizations: Optional[list[str]] = None,
    gpu_info: Optional[dict] = None,
    system_metrics: Optional[dict] = None,
) -> list[dict]:
    """Try multiple configurations and return sorted by quality.

    Tests different quantization + CPU offload combinations
    to find the best setup for the current hardware.
    """
    if quantizations is None:
        quantizations = ["fp16", "int8", "int4"]

    gpu = gpu_info or _gpu_info()
    total_vram = gpu.get("total_gb", 0) or 0

    results = []
    for q in quantizations:
        vpu = {"fp16": 2, "int8": 1, "int4": 0.5}.get(_quant_key(q), 2)
        model_gb = total_params_b * vpu + 2.0

        # Try different CPU offload amounts
        offload_options = [0, 2, 4, 8, 16, 24]
        if model_gb <= total_vram * 0.9:
            offload_options = [0]

        for offload in offload_options:
            if offload > model_gb:
                continue
            sim = simulate_moe_split(
                total_params_b, num_experts, active_experts,
                quantization=q, cpu_offload_gb=offload,
                gpu_info=gpu, system_metrics=system_metrics,
            )
            results.append(sim)

    results.sort(key=lambda r: (r["grade"]["score"], r["performance"]["estimated_tokens_per_sec"]), reverse=True)
    return results


def simulate_generic_model(
    params_b: float,
    quantization: str = "fp16",
    context_length: int = 4096,
    cpu_offload_gb: float = 0.0,
) -> dict:
    """Simulate any dense model (non-MoE) performance."""
    qk = _quant_key(quantization)
    vram_info = _estimate_vram_gb(params_b, quantization, context_length)
    vram_gb = vram_info["total"]
    gpu = _gpu_info()
    total_vram = gpu.get("total_gb", 0) or 0
    free_vram = gpu.get("free_gb", 0) or 0
    vendor = gpu.get("vendor", "nvidia")

    tps = _VENDOR_THROUGHPUT_BASELINE.get(vendor, _VENDOR_THROUGHPUT_BASELINE["nvidia"]).get(qk, 2.8)
    count = max(gpu.get("count", 0), 1)

    fits = vram_gb <= free_vram * 0.9
    est_tps = tps * count if fits else tps * count * 0.3
    est_latency = (1.0 / max(est_tps, 0.01)) * 1000

    return {
        "model": {"params_billions": params_b, "quantization": quantization, "vram_estimate_gb": round(vram_gb, 1)},
        "config": {"cpu_offload_gb": cpu_offload_gb, "fits_in_gpu": fits},
        "performance": {
            "estimated_tokens_per_sec": round(est_tps, 1),
            "estimated_latency_ms": round(est_latency, 1),
            "vram_required_gb": round(vram_gb, 1),
            "vram_free_gb": round(free_vram, 1),
            "vram_total_gb": total_vram,
        },
        "grade": "excellent" if fits else "offload_required",
    }
