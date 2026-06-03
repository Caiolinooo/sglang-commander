import asyncio
import json
import time
from typing import Optional

import httpx


class BenchmarkService:
    def __init__(self):
        self._running = False
        self._results: list[dict] = []
        self._progress: float = 0.0

    @property
    def is_running(self) -> bool:
        return self._running

    async def run_benchmark(
        self,
        host: str = "127.0.0.1",
        port: int = 30000,
        prompt: str = "What is the capital of France?",
        max_tokens: int = 100,
        temperature: float = 0.7,
        num_runs: int = 10,
        concurrency: int = 1,
    ) -> dict:
        if self._running:
            return {"status": "error", "message": "Benchmark already running"}

        self._running = True
        self._results = []
        self._progress = 0.0
        base_url = f"http://{host}:{port}"

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                latencies = []
                tokens_per_run = []

                for i in range(num_runs):
                    if not self._running:
                        break

                    start = time.time()
                    try:
                        payload = {
                            "text": prompt,
                            "sampling_params": {
                                "max_new_tokens": max_tokens,
                                "temperature": temperature,
                            },
                        }
                        r = await client.post(f"{base_url}/v1/completions", json=payload)
                        elapsed = time.time() - start
                        if r.status_code == 200:
                            data = r.json()
                            tokens = len(data.get("text", "").split())
                            tokens_per_run.append(tokens)
                        else:
                            elapsed = 0
                            tokens_per_run.append(0)
                        latencies.append(elapsed)
                    except Exception as e:
                        latencies.append(0)
                        tokens_per_run.append(0)

                    self._progress = (i + 1) / num_runs * 100
                    await asyncio.sleep(0.1)

                valid_latencies = [l for l in latencies if l > 0]
                total_tokens = sum(tokens_per_run)
                total_time = sum(valid_latencies)

                self._results = [
                    {
                        "run": i + 1,
                        "latency_ms": round(latencies[i] * 1000, 2) if latencies[i] > 0 else 0,
                        "tokens_generated": tokens_per_run[i],
                    }
                    for i in range(num_runs)
                ]

                result = {
                    "status": "completed",
                    "summary": {
                        "num_runs": num_runs,
                        "concurrency": concurrency,
                        "total_time_seconds": round(total_time, 2),
                        "avg_latency_ms": round(sum(valid_latencies) / len(valid_latencies) * 1000, 2) if valid_latencies else 0,
                        "min_latency_ms": round(min(valid_latencies) * 1000, 2) if valid_latencies else 0,
                        "max_latency_ms": round(max(valid_latencies) * 1000, 2) if valid_latencies else 0,
                        "p50_latency_ms": 0,
                        "p95_latency_ms": 0,
                        "p99_latency_ms": 0,
                        "total_tokens": total_tokens,
                        "tokens_per_second": round(total_tokens / total_time, 2) if total_time > 0 else 0,
                    },
                    "runs": self._results,
                }

                if valid_latencies:
                    sorted_latencies = sorted(valid_latencies)
                    n = len(sorted_latencies)
                    result["summary"]["p50_latency_ms"] = round(
                        sorted_latencies[int(n * 0.5)] * 1000, 2
                    ) if n > 0 else 0
                    result["summary"]["p95_latency_ms"] = round(
                        sorted_latencies[int(n * 0.95)] * 1000, 2
                    ) if n > 0 else 0
                    result["summary"]["p99_latency_ms"] = round(
                        sorted_latencies[int(n * 0.99)] * 1000, 2
                    ) if n > 0 else 0

                return result

        finally:
            self._running = False
            self._progress = 100.0

    async def get_status(self) -> dict:
        return {
            "running": self._running,
            "progress": self._progress,
            "results": self._results,
        }

    def cancel(self):
        self._running = False


benchmark_service = BenchmarkService()
