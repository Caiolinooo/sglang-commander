import asyncio
import re
import time
from typing import Optional

import aiohttp
import psutil

from app.config import settings


class MetricsCollector:
    def __init__(self):
        self._history: list[dict] = []
        self._max_history = 3600
        self._running = False
        self._listeners: list = []

    async def start(self):
        self._running = True
        asyncio.create_task(self._collect_loop())

    async def stop(self):
        self._running = False

    def add_listener(self, callback):
        self._listeners.append(callback)

    def remove_listener(self, callback):
        if callback in self._listeners:
            self._listeners.remove(callback)

    async def _collect_loop(self):
        while self._running:
            try:
                snapshot = await self._collect_snapshot()
                self._history.append(snapshot)
                if len(self._history) > self._max_history:
                    self._history = self._history[-self._max_history:]

                for cb in self._listeners:
                    try:
                        if asyncio.iscoroutinefunction(cb):
                            await cb(snapshot)
                        else:
                            cb(snapshot)
                    except Exception:
                        pass
            except Exception:
                pass
            await asyncio.sleep(2)

    async def _collect_snapshot(self) -> dict:
        base = {
            "timestamp": time.time(),
            **await self._scrape_sglang_metrics(),
            **self._get_system_metrics(),
        }
        # Add GPU live status with processes
        try:
            from app.services.model_manager import model_manager
            gpu_status = await model_manager.get_live_gpu_status()
            base["gpu_live"] = gpu_status
        except Exception:
            pass
        return base

    async def _scrape_sglang_metrics(self) -> dict:
        metrics = {}

        # Always collect GPU metrics via pynvml (works without sglang)
        try:
            import pynvml
            pynvml.nvmlInit()
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
            temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            power = pynvml.nvmlDeviceGetPowerUsage(handle)
            metrics["gpu_util"] = util.gpu
            metrics["gpu_mem_used_mb"] = mem.used / 1024 / 1024
            metrics["gpu_mem_total_mb"] = mem.total / 1024 / 1024
            metrics["gpu_temp_c"] = float(temp)
            metrics["gpu_power_w"] = power / 1000.0
        except Exception:
            pass

        # Scrape sglang Prometheus metrics if server is running
        from app.services.server_manager import server_manager
        status = await server_manager.get_status()
        if not status.get("running"):
            return metrics

        host = status.get("host", settings.sglang_default_host)
        port = status.get("port", settings.sglang_default_port)

        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3)) as session:
                async with session.get(f"http://{host}:{port}/metrics") as resp:
                    if resp.status == 200:
                        text = await resp.text()
                        sglang_metrics = self._parse_prometheus(text)
                        metrics.update(sglang_metrics)
        except Exception:
            pass

        return metrics

    def _parse_prometheus(self, text: str) -> dict:
        metrics = {}
        patterns = [
            (r'sglang:gen_throughput\{[^}]*\}\s+([\d.e+\-]+)', "gen_throughput", float),
            (r'sglang:num_running_reqs\{[^}]*\}\s+([\d.e+\-]+)', "num_running_reqs", int),
            (r'sglang:num_queue_reqs\{[^}]*\}\s+([\d.e+\-]+)', "num_queue_reqs", int),
            (r'sglang:token_usage\{[^}]*\}\s+([\d.e+\-]+)', "token_usage", float),
            (r'sglang:cache_hit_rate\{[^}]*\}\s+([\d.e+\-]+)', "cache_hit_rate", float),
            (r'sglang:time_to_first_token_seconds_sum\{[^}]*\}\s+([\d.e+\-]+)', "ttft_sum", float),
            (r'sglang:time_to_first_token_seconds_count\{[^}]*\}\s+([\d.e+\-]+)', "ttft_count", int),
            (r'sglang:e2e_request_latency_seconds_sum\{[^}]*\}\s+([\d.e+\-]+)', "e2e_sum", float),
            (r'sglang:e2e_request_latency_seconds_count\{[^}]*\}\s+([\d.e+\-]+)', "e2e_count", int),
            (r'sglang:prompt_tokens_histogram_sum\{[^}]*\}\s+([\d.e+\-]+)', "prompt_tokens_total", float),
            (r'sglang:generation_tokens_histogram_sum\{[^}]*\}\s+([\d.e+\-]+)', "generation_tokens_total", float),
            (r'sglang:queue_time_seconds_sum\{[^}]*\}\s+([\d.e+\-]+)', "queue_time_sum", float),
            (r'sglang:queue_time_seconds_count\{[^}]*\}\s+([\d.e+\-]+)', "queue_time_count", int),
            (r'sglang:context_len\{[^}]*\}\s+([\d.e+\-]+)', "context_len", int),
            (r'sglang:max_total_num_tokens\{[^}]*\}\s+([\d.e+\-]+)', "max_total_num_tokens", int),
            (r'sglang:num_used_tokens\{[^}]*\}\s+([\d.e+\-]+)', "num_used_tokens", int),
            (r'sglang:kv_available_tokens\{[^}]*\}\s+([\d.e+\-]+)', "kv_available_tokens", int),
            (r'sglang:num_grammar_queue_reqs\{[^}]*\}\s+([\d.e+\-]+)', "num_grammar_queue_reqs", int),
            (r'sglang:utilization\{[^}]*\}\s+([\d.e+\-]+)', "utilization", float),
            (r'sglang:num_retracted_reqs\{[^}]*\}\s+([\d.e+\-]+)', "num_retracted_reqs", int),
            (r'sglang:num_paused_reqs\{[^}]*\}\s+([\d.e+\-]+)', "num_paused_reqs", int),
            (r'sglang:new_token_ratio\{[^}]*\}\s+([\d.e+\-]+)', "new_token_ratio", float),
        ]
        for pattern, key, converter in patterns:
            match = re.search(pattern, text)
            if match:
                try:
                    metrics[key] = converter(match.group(1))
                except (ValueError, OverflowError):
                    pass

        if "ttft_sum" in metrics and metrics.get("ttft_count", 0) > 0:
            metrics["ttft_avg_ms"] = (metrics["ttft_sum"] / metrics["ttft_count"]) * 1000
        if "e2e_sum" in metrics and metrics.get("e2e_count", 0) > 0:
            metrics["e2e_latency_avg_ms"] = (metrics["e2e_sum"] / metrics["e2e_count"]) * 1000
        if "queue_time_sum" in metrics and metrics.get("queue_time_count", 0) > 0:
            metrics["queue_time_avg_ms"] = (metrics["queue_time_sum"] / metrics["queue_time_count"]) * 1000

        return metrics

    def _get_system_metrics(self) -> dict:
        cpu = psutil.cpu_percent(interval=None)
        ram = psutil.virtual_memory()
        return {
            "cpu_percent": cpu,
            "ram_percent": ram.percent,
            "ram_used_gb": ram.used / 1024 / 1024 / 1024,
            "ram_total_gb": ram.total / 1024 / 1024 / 1024,
        }

    def get_latest(self) -> dict:
        return self._history[-1] if self._history else {}

    def get_history(self, seconds: int = 300) -> list[dict]:
        cutoff = time.time() - seconds
        return [m for m in self._history if m.get("timestamp", 0) > cutoff]

    def get_history_all(self) -> list[dict]:
        return self._history


metrics_collector = MetricsCollector()
