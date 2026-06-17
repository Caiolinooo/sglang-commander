import asyncio
import re
import time

import aiohttp
import psutil
from sqlalchemy import select

from app.config import settings
from app.services.gpu_detector import (
    get_all_detailed_status as _gpu_all_detailed,
    detect_vendor as _gpu_vendor,
)


class MetricsCollector:
    def __init__(self):
        self._history: list[dict] = []
        self._max_history = 3600
        self._running = False
        self._prev_disk = psutil.disk_io_counters()
        self._prev_net = psutil.net_io_counters()
        self._prev_time = time.time()

    async def start(self):
        self._running = True
        self._prev_disk = psutil.disk_io_counters()
        self._prev_net = psutil.net_io_counters()
        self._prev_time = time.time()
        asyncio.create_task(self._collect_loop())

    async def stop(self):
        self._running = False

    async def _collect_loop(self):
        while self._running:
            try:
                snapshot = await self._collect_snapshot()
                self._history.append(snapshot)
                if len(self._history) > self._max_history:
                    self._history = self._history[-self._max_history:]
            except Exception:
                pass
            await asyncio.sleep(2)

    async def _collect_snapshot(self) -> dict:
        base = {
            "timestamp": time.time(),
            **self._get_system_metrics(),
            **await self._scrape_sglang_metrics(),
        }
        gpu_status = _gpu_all_detailed()
        base["gpu"] = gpu_status.get("gpus", [])
        base["gpu_count"] = gpu_status.get("count", 0)
        base["gpu_vendor"] = _gpu_vendor()
        return base

    def _get_system_metrics(self) -> dict:
        now = time.time()
        dt = max(now - self._prev_time, 0.1)

        cpu_percent = psutil.cpu_percent(interval=None)
        cpu_cores = []
        for i, p in enumerate(psutil.cpu_percent(interval=None, percpu=True)):
            freq = 0.0
            try:
                freq = psutil.cpu_freq(percpu=True)[i].current if hasattr(psutil.cpu_freq(percpu=True), '__iter__') else 0.0
            except Exception:
                pass
            cpu_cores.append({"index": i, "percent": p, "frequency_mhz": freq})

        cpu_freq = psutil.cpu_freq()
        load_avg = getattr(psutil, "getloadavg", lambda: (0, 0, 0))()

        mem = psutil.virtual_memory()
        swap = psutil.swap_memory()

        disk = psutil.disk_io_counters()
        net = psutil.net_io_counters()

        disk_read_s = (disk.read_bytes - self._prev_disk.read_bytes) / dt if dt > 0 else 0
        disk_write_s = (disk.write_bytes - self._prev_disk.write_bytes) / dt if dt > 0 else 0
        disk_read_count_s = (disk.read_count - self._prev_disk.read_count) / dt if dt > 0 else 0
        disk_write_count_s = (disk.write_count - self._prev_disk.write_count) / dt if dt > 0 else 0
        net_sent_s = (net.bytes_sent - self._prev_net.bytes_sent) / dt if dt > 0 else 0
        net_recv_s = (net.bytes_recv - self._prev_net.bytes_recv) / dt if dt > 0 else 0
        net_packets_sent_s = (net.packets_sent - self._prev_net.packets_sent) / dt if dt > 0 else 0
        net_packets_recv_s = (net.packets_recv - self._prev_net.packets_recv) / dt if dt > 0 else 0

        self._prev_disk = disk
        self._prev_net = net
        self._prev_time = now

        top_procs = []
        try:
            for p in sorted(psutil.process_iter(["pid", "name", "cpu_percent", "memory_info"]),
                            key=lambda p: p.info["cpu_percent"] or 0, reverse=True)[:10]:
                pid = p.info["pid"]
                name = p.info["name"] or "?"
                cpu_pct = p.info["cpu_percent"] or 0
                mem_mb = (p.info["memory_info"].rss / 1024 / 1024) if p.info["memory_info"] else 0
                top_procs.append({"pid": pid, "name": name, "cpu_percent": round(cpu_pct, 1),
                                  "memory_mb": round(mem_mb, 1), "gpu_memory_mb": 0})
        except Exception:
            pass

        disk_pct = 0.0
        try:
            for part in psutil.disk_partitions():
                usage = psutil.disk_usage(part.mountpoint)
                disk_pct = max(disk_pct, usage.percent)
        except Exception:
            pass

        return {
            "cpu_percent": cpu_percent,
            "cpu_cores": cpu_cores,
            "cpu_freq_mhz": round(cpu_freq.current, 1) if cpu_freq else 0.0,
            "cpu_count_logical": psutil.cpu_count(logical=True) or 0,
            "cpu_count_physical": psutil.cpu_count(logical=False) or 0,
            "cpu_load_1m": round(load_avg[0], 2) if load_avg else 0.0,
            "cpu_load_5m": round(load_avg[1], 2) if load_avg else 0.0,
            "cpu_load_15m": round(load_avg[2], 2) if load_avg else 0.0,
            "ram_percent": mem.percent,
            "ram_used_gb": round(mem.used / 1024 / 1024 / 1024, 2),
            "ram_total_gb": round(mem.total / 1024 / 1024 / 1024, 2),
            "ram_available_gb": round(mem.available / 1024 / 1024 / 1024, 2),
            "swap": {
                "percent": swap.percent,
                "used_gb": round(swap.used / 1024 / 1024 / 1024, 2),
                "total_gb": round(swap.total / 1024 / 1024 / 1024, 2),
            },
            "disk": {
                "read_bytes_s": round(disk_read_s, 1),
                "write_bytes_s": round(disk_write_s, 1),
                "read_count_s": round(disk_read_count_s, 1),
                "write_count_s": round(disk_write_count_s, 1),
                "percent": round(disk_pct, 1),
            },
            "network": {
                "bytes_sent_s": round(net_sent_s, 1),
                "bytes_recv_s": round(net_recv_s, 1),
                "packets_sent_s": round(net_packets_sent_s, 1),
                "packets_recv_s": round(net_packets_recv_s, 1),
            },
            "processes_top": top_procs,
        }

    async def _scrape_sglang_metrics(self) -> dict:
        metrics = {}
        from app.services.server_manager import server_manager
        status = await server_manager.get_status()

        host = None
        port = None
        if status.get("running"):
            host = status.get("host", settings.sglang_default_host)
            port = status.get("port", settings.sglang_default_port)
        else:
            from app.services.connection_manager import connection_manager
            from app.models.connection import ConnectionProfile
            from app.core.database import async_session_factory
            active_ids = list(connection_manager._connections.keys())
            if active_ids:
                async with async_session_factory() as db:
                    result = await db.execute(
                        select(ConnectionProfile).where(ConnectionProfile.id == active_ids[0])
                    )
                    profile = result.scalar_one_or_none()
                    if profile:
                        host = "127.0.0.1"
                        port = profile.local_bind_port

        if not host or not port:
            return metrics

        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3)) as session:
                async with session.get(f"http://{host}:{port}/metrics") as resp:
                    if resp.status == 200:
                        text = await resp.text()
                        parsed = self._parse_prometheus(text)
                        metrics.update(parsed)
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

    def get_latest(self) -> dict:
        return self._history[-1] if self._history else {}

    def get_history(self, seconds: int = 300) -> list[dict]:
        cutoff = time.time() - seconds
        return [m for m in self._history if m.get("timestamp", 0) > cutoff]

    def get_history_all(self) -> list[dict]:
        return self._history


metrics_collector = MetricsCollector()
