"""Universal GPU detector — works with NVIDIA, AMD, Intel, Apple Silicon.

Auto-detects GPU vendor at runtime and collects metrics using the
appropriate library for each platform. Returns a unified dict structure
so callers never need to know which vendor is underneath.

Vendor support:
  - NVIDIA: pynvml (NVML)
  - AMD:    amdsmi / rocm-smi (ROCm)
  - Intel:  pynvml (Intel GPU with Level Zero)
  - Apple:  pyobjc / Metal (macOS)
  - CPU:    fallback (no GPU)
"""

import shutil
import subprocess

GPU_VENDOR_UNKNOWN = "unknown"
GPU_VENDOR_NVIDIA = "nvidia"
GPU_VENDOR_AMD = "amd"
GPU_VENDOR_INTEL = "intel"
GPU_VENDOR_APPLE = "apple"


def detect_vendor() -> str:
    """Detect GPU vendor by probing available tools and libraries."""
    # 1. pynvml — NVIDIA (or Intel on some Linux)
    try:
        import pynvml
        pynvml.nvmlInit()
        count = pynvml.nvmlDeviceGetCount()
        if count > 0:
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            name = _decode_name(pynvml.nvmlDeviceGetName(handle)).lower()
            if "intel" in name:
                return GPU_VENDOR_INTEL
            return GPU_VENDOR_NVIDIA
    except Exception:
        pass

    # 2. amdsmi / rocm-smi — AMD
    try:
        import amdsmi
        amdsmi.amdsmi_init()
        return GPU_VENDOR_AMD
    except Exception:
        pass
    if shutil.which("rocm-smi"):
        return GPU_VENDOR_AMD

    # 3. torch — can work with CUDA (NVIDIA), ROCm (AMD), MPS (Apple)
    try:
        import torch
        if torch.backends.mps.is_available():
            return GPU_VENDOR_APPLE
        if torch.cuda.is_available():
            name = torch.cuda.get_device_name(0).lower()
            if "amd" in name or "hip" in name or "radeon" in name:
                return GPU_VENDOR_AMD
            return GPU_VENDOR_NVIDIA
    except Exception:
        pass

    return GPU_VENDOR_UNKNOWN


def _decode_name(name) -> str:
    if isinstance(name, bytes):
        return name.decode(errors="replace")
    return str(name)


def _gpu_count_pynvml():
    import pynvml
    pynvml.nvmlInit()
    return pynvml.nvmlDeviceGetCount()


def _gpu_info_nvidia(index: int = 0) -> dict:
    try:
        import pynvml
        pynvml.nvmlInit()
        count = pynvml.nvmlDeviceGetCount()
        if count == 0:
            return {"name": "Unknown", "total_gb": 0, "free_gb": 0, "used_gb": 0, "count": 0, "vendor": GPU_VENDOR_NVIDIA}
        handle = pynvml.nvmlDeviceGetHandleByIndex(min(index, count - 1))
        mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
        name = _decode_name(pynvml.nvmlDeviceGetName(handle))
        return {
            "name": name,
            "total_gb": round(mem.total / 1024 / 1024 / 1024, 1),
            "free_gb": round(mem.free / 1024 / 1024 / 1024, 1),
            "used_gb": round(mem.used / 1024 / 1024 / 1024, 1),
            "count": count,
            "vendor": GPU_VENDOR_NVIDIA,
        }
    except Exception:
        return _gpu_info_nvidia_torch(index)


def _gpu_info_nvidia_torch(index: int = 0) -> dict:
    try:
        import torch
        if not torch.cuda.is_available():
            return {"name": "Unknown", "total_gb": 0, "free_gb": 0, "used_gb": 0, "count": 0, "vendor": GPU_VENDOR_NVIDIA}
        count = torch.cuda.device_count()
        idx = min(index, count - 1)
        name = torch.cuda.get_device_name(idx)
        try:
            free, total = torch.cuda.mem_get_info(idx)
        except Exception:
            free, total = 0, 0
        return {
            "name": name,
            "total_gb": round(total / 1024 / 1024 / 1024, 1) if total else 0,
            "free_gb": round(free / 1024 / 1024 / 1024, 1) if free else 0,
            "used_gb": round((total - free) / 1024 / 1024 / 1024, 1) if total else 0,
            "count": count,
            "vendor": GPU_VENDOR_NVIDIA,
        }
    except Exception:
        return {"name": "Unknown", "total_gb": 0, "free_gb": 0, "used_gb": 0, "count": 0, "vendor": GPU_VENDOR_NVIDIA}


def _gpu_info_amd(index: int = 0) -> dict:
    try:
        import amdsmi
        amdsmi.amdsmi_init()
        devices = amdsmi.amdsmi_get_processor_handles()
        if not devices:
            return _gpu_info_amd_fallback()
        idx = min(index, len(devices) - 1)
        info = amdsmi.amdsmi_get_gpu_memory_total(devices[idx], amdsmi.AmdSmiMemoryType.VRAM)
        usage = amdsmi.amdsmi_get_gpu_memory_usage(devices[idx], amdsmi.AmdSmiMemoryType.VRAM)
        name = amdsmi.amdsmi_get_gpu_device_name(devices[idx])
        return {
            "name": _decode_name(name),
            "total_gb": round(info / 1024 / 1024 / 1024, 1),
            "free_gb": round((info - usage) / 1024 / 1024 / 1024, 1),
            "used_gb": round(usage / 1024 / 1024 / 1024, 1),
            "count": len(devices),
            "vendor": GPU_VENDOR_AMD,
        }
    except Exception:
        return _gpu_info_amd_fallback()


def _gpu_info_amd_fallback() -> dict:
    try:
        out = subprocess.check_output(
            ["rocm-smi", "--showmeminfo", "vram", "--json"],
            timeout=5, stderr=subprocess.DEVNULL,
        )
        import json
        data = json.loads(out)
        cards = list(data.keys())
        if cards:
            card = data[cards[0]]
            total = float(card.get("VRAM Total", "0").replace("GB", "").strip())
            used = float(card.get("VRAM Used", "0").replace("GB", "").strip())
            return {
                "name": cards[0],
                "total_gb": total,
                "free_gb": round(total - used, 1),
                "used_gb": used,
                "count": len(cards),
                "vendor": GPU_VENDOR_AMD,
            }
    except Exception:
        pass
    return {"name": "AMD GPU", "total_gb": 0, "free_gb": 0, "used_gb": 0, "count": 0, "vendor": GPU_VENDOR_AMD}


def _gpu_info_apple() -> dict:
    try:
        import torch
        if torch.backends.mps.is_available():
            total_gb = 0
            free_gb = 0
            try:
                import subprocess
                out = subprocess.check_output(
                    ["sysctl", "hw.memsize"],
                    timeout=3, stderr=subprocess.DEVNULL,
                ).decode().strip()
                total_bytes = int(out.split(":")[1].strip())
                total_gb = round(total_bytes / 1024 / 1024 / 1024, 1)
                free_gb = round(total_gb * 0.5, 1)
            except Exception:
                pass
            return {
                "name": "Apple Silicon (MPS)",
                "total_gb": total_gb,
                "free_gb": free_gb,
                "used_gb": round(total_gb - free_gb, 1) if total_gb else 0,
                "count": 1,
                "vendor": GPU_VENDOR_APPLE,
            }
    except Exception:
        pass
    return {"name": "Apple GPU", "total_gb": 0, "free_gb": 0, "used_gb": 0, "count": 0, "vendor": GPU_VENDOR_APPLE}


def get_basic_info(index: int = 0) -> dict:
    """Get unified basic GPU info (name, VRAM, vendor)."""
    vendor = detect_vendor()
    if vendor == GPU_VENDOR_NVIDIA:
        return _gpu_info_nvidia(index)
    if vendor == GPU_VENDOR_AMD:
        return _gpu_info_amd(index)
    if vendor == GPU_VENDOR_INTEL:
        result = _gpu_info_nvidia(index)
        result["vendor"] = GPU_VENDOR_INTEL
        return result
    if vendor == GPU_VENDOR_APPLE:
        return _gpu_info_apple()
    return {"name": "No GPU detected", "total_gb": 0, "free_gb": 0, "used_gb": 0, "count": 0, "vendor": GPU_VENDOR_UNKNOWN}


def _get_live_nvidia() -> dict:
    try:
        import pynvml
        pynvml.nvmlInit()
        count = pynvml.nvmlDeviceGetCount()
        gpus = []
        for i in range(count):
            handle = pynvml.nvmlDeviceGetHandleByIndex(i)
            mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
            name = _decode_name(pynvml.nvmlDeviceGetName(handle))
            gpus.append({
                "index": i,
                "name": name,
                "total_mb": round(mem.total / 1024 / 1024, 1),
                "used_mb": round(mem.used / 1024 / 1024, 1),
                "free_mb": round(mem.free / 1024 / 1024, 1),
                "vendor": GPU_VENDOR_NVIDIA,
            })
        return {"gpus": gpus, "count": count}
    except Exception:
        return _get_live_nvidia_torch()


def _get_live_nvidia_torch() -> dict:
    try:
        import torch
        if not torch.cuda.is_available():
            return {"gpus": [], "count": 0}
        count = torch.cuda.device_count()
        gpus = []
        for i in range(count):
            name = torch.cuda.get_device_name(i)
            try:
                free, total = torch.cuda.mem_get_info(i)
            except Exception:
                free, total = 0, 0
            gpus.append({
                "index": i,
                "name": name,
                "total_mb": round(total / 1024 / 1024, 1) if total else 0,
                "used_mb": round((total - free) / 1024 / 1024, 1) if total else 0,
                "free_mb": round(free / 1024 / 1024, 1) if free else 0,
                "vendor": GPU_VENDOR_NVIDIA,
            })
        return {"gpus": gpus, "count": count}
    except Exception:
        return {"gpus": [], "count": 0}


def _get_live_amd() -> dict:
    gpus = []
    try:
        import amdsmi
        amdsmi.amdsmi_init()
        devices = amdsmi.amdsmi_get_processor_handles()
        for i, dev in enumerate(devices):
            total = amdsmi.amdsmi_get_gpu_memory_total(dev, amdsmi.AmdSmiMemoryType.VRAM)
            usage = amdsmi.amdsmi_get_gpu_memory_usage(dev, amdsmi.AmdSmiMemoryType.VRAM)
            name = amdsmi.amdsmi_get_gpu_device_name(dev)
            gpus.append({
                "index": i,
                "name": _decode_name(name),
                "total_mb": round(total / 1024 / 1024, 1),
                "used_mb": round(usage / 1024 / 1024, 1),
                "free_mb": round((total - usage) / 1024 / 1024, 1),
                "vendor": GPU_VENDOR_AMD,
            })
    except Exception:
        pass
    return {"gpus": gpus, "count": len(gpus)}


def _get_live_apple() -> dict:
    try:
        import torch
        if torch.backends.mps.is_available():
            info = get_basic_info(0)
            return {
                "gpus": [{"index": 0, "name": info["name"], "total_mb": round(info["total_gb"] * 1024, 1),
                          "used_mb": round(info["used_gb"] * 1024, 1), "free_mb": round(info["free_gb"] * 1024, 1),
                          "vendor": GPU_VENDOR_APPLE}],
                "count": 1,
            }
    except Exception:
        pass
    return {"gpus": [], "count": 0}


def get_live_info() -> dict:
    """Get list of all GPUs with memory info (fast, no util/temp)."""
    vendor = detect_vendor()
    if vendor == GPU_VENDOR_NVIDIA:
        return _get_live_nvidia()
    if vendor == GPU_VENDOR_INTEL:
        return _get_live_nvidia()
    if vendor == GPU_VENDOR_AMD:
        return _get_live_amd()
    if vendor == GPU_VENDOR_APPLE:
        return _get_live_apple()
    return {"gpus": [], "count": 0}


def get_detailed_status(index: int = 0) -> dict:
    """Get detailed GPU status including temperature, utilization, power.

    Returns a dict with unified keys (vendor-agnostic). Omits fields
    that the vendor does not support.
    """
    vendor = detect_vendor()
    result = {"index": index, "vendor": vendor}

    if vendor in (GPU_VENDOR_NVIDIA, GPU_VENDOR_INTEL):
        try:
            import pynvml
            pynvml.nvmlInit()
            count = pynvml.nvmlDeviceGetCount()
            if count == 0:
                return result
            handle = pynvml.nvmlDeviceGetHandleByIndex(min(index, count - 1))

            try:
                mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
                result["total_mb"] = round(mem.total / 1024 / 1024, 1)
                result["used_mb"] = round(mem.used / 1024 / 1024, 1)
                result["free_mb"] = round(mem.free / 1024 / 1024, 1)
            except Exception:
                pass

            try:
                util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                result["gpu_util_pct"] = util.gpu
                result["memory_util_pct"] = util.memory
            except Exception:
                pass

            try:
                result["temperature_c"] = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            except Exception:
                pass

            try:
                result["power_w"] = round(pynvml.nvmlDeviceGetPowerUsage(handle) / 1000, 1)
            except Exception:
                pass

            try:
                result["power_limit_w"] = round(pynvml.nvmlDeviceGetPowerManagementLimit(handle) / 1000, 1)
            except Exception:
                pass

            procs = []
            try:
                for proc in pynvml.nvmlDeviceGetComputeRunningProcesses_v2(handle):
                    procs.append({
                        "pid": proc.pid,
                        "used_mb": round(proc.usedGpuMemory / 1024 / 1024, 1) if proc.usedGpuMemory else 0,
                    })
            except Exception:
                pass
            result["processes"] = procs
            result["name"] = _decode_name(pynvml.nvmlDeviceGetName(handle))
            result["count"] = count
        except Exception:
            info = _gpu_info_nvidia_torch(index)
            result["name"] = info["name"]
            result["total_mb"] = round(info["total_gb"] * 1024, 1) if info["total_gb"] else 0
            result["used_mb"] = round(info["used_gb"] * 1024, 1) if info["used_gb"] else 0
            result["free_mb"] = round(info["free_gb"] * 1024, 1) if info["free_gb"] else 0
            result["count"] = info["count"]
            result["processes"] = []

    elif vendor == GPU_VENDOR_AMD:
        try:
            import amdsmi
            amdsmi.amdsmi_init()
            devices = amdsmi.amdsmi_get_processor_handles()
            if devices:
                dev = devices[min(index, len(devices) - 1)]
                total = amdsmi.amdsmi_get_gpu_memory_total(dev, amdsmi.AmdSmiMemoryType.VRAM)
                usage = amdsmi.amdsmi_get_gpu_memory_usage(dev, amdsmi.AmdSmiMemoryType.VRAM)
                result["total_mb"] = round(total / 1024 / 1024, 1)
                result["used_mb"] = round(usage / 1024 / 1024, 1)
                result["free_mb"] = round((total - usage) / 1024 / 1024, 1)
                result["name"] = _decode_name(amdsmi.amdsmi_get_gpu_device_name(dev))
                result["count"] = len(devices)
                try:
                    result["temperature_c"] = amdsmi.amdsmi_get_gpu_temp_metric(dev, amdsmi.AmdSmiTemperatureType.EDGE)
                except Exception:
                    pass
                result["processes"] = []
        except Exception:
            pass

    elif vendor == GPU_VENDOR_APPLE:
        info = get_basic_info(index)
        result["name"] = info["name"]
        result["total_mb"] = round(info["total_gb"] * 1024, 1)
        result["used_mb"] = round(info["used_gb"] * 1024, 1)
        result["free_mb"] = round(info["free_gb"] * 1024, 1)
        result["count"] = 1
        result["processes"] = []

    return result


def get_all_detailed_status() -> dict:
    """Get detailed status for ALL GPUs."""
    vendor = detect_vendor()
    gpus = []

    if vendor in (GPU_VENDOR_NVIDIA, GPU_VENDOR_INTEL):
        try:
            try:
                import pynvml
                pynvml.nvmlInit()
                count = pynvml.nvmlDeviceGetCount()
            except Exception:
                import torch
                count = torch.cuda.device_count() if torch.cuda.is_available() else 0
            for i in range(count):
                gpus.append(get_detailed_status(i))
        except Exception:
            pass

    elif vendor == GPU_VENDOR_AMD:
        try:
            import amdsmi
            amdsmi.amdsmi_init()
            devices = amdsmi.amdsmi_get_processor_handles()
            for i in range(len(devices)):
                gpus.append(get_detailed_status(i))
        except Exception:
            pass

    elif vendor == GPU_VENDOR_APPLE:
        gpus.append(get_detailed_status(0))

    return {"gpus": gpus, "count": len(gpus), "vendor": vendor}


def get_gpu_count() -> int:
    """Get number of available GPUs."""
    vendor = detect_vendor()
    if vendor in (GPU_VENDOR_NVIDIA, GPU_VENDOR_INTEL):
        try:
            return _gpu_count_pynvml()
        except Exception:
            try:
                import torch
                return torch.cuda.device_count()
            except Exception:
                return 0
    if vendor == GPU_VENDOR_AMD:
        try:
            import amdsmi
            amdsmi.amdsmi_init()
            return len(amdsmi.amdsmi_get_processor_handles())
        except Exception:
            return 1 if shutil.which("rocm-smi") else 0
    if vendor == GPU_VENDOR_APPLE:
        try:
            import torch
            return 1 if torch.backends.mps.is_available() else 0
        except Exception:
            return 0
    return 0


def has_gpu() -> bool:
    return detect_vendor() != GPU_VENDOR_UNKNOWN


def get_vendor_name() -> str:
    return detect_vendor()


def get_vendor_display() -> str:
    names = {
        GPU_VENDOR_NVIDIA: "NVIDIA (CUDA)",
        GPU_VENDOR_AMD: "AMD (ROCm)",
        GPU_VENDOR_INTEL: "Intel (Level Zero)",
        GPU_VENDOR_APPLE: "Apple (MPS)",
        GPU_VENDOR_UNKNOWN: "No GPU detected",
    }
    return names.get(detect_vendor(), "Unknown")


def get_gpu_packages() -> list[str]:
    """Return the GPU monitoring package(s) needed for the current vendor."""
    vendor = detect_vendor()
    if vendor == GPU_VENDOR_NVIDIA:
        return ["pynvml>=11.5.0"]
    if vendor == GPU_VENDOR_AMD:
        return ["amdsmi>=6.0.0"]
    if vendor == GPU_VENDOR_INTEL:
        return ["pynvml>=11.5.0"]
    if vendor == GPU_VENDOR_APPLE:
        return []
    return []
