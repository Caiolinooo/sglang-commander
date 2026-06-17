import asyncio
import time

import httpx

from app.services.server_manager import server_manager


class BenchmarkService:
    def __init__(self):
        self._running = False
        self._results: list[dict] = []
        self._progress: float = 0.0
        self._current_run: int = 0
        self._total_runs: int = 0

    @property
    def is_running(self) -> bool:
        return self._running

    async def run_benchmark(
        self,
        prompt: str = "What is the capital of France?",
        max_tokens: int = 100,
        temperature: float = 0.7,
        num_runs: int = 10,
        concurrency: int = 1,
    ) -> dict:
        if self._running:
            return {"status": "error", "message": "Benchmark already running"}

        status = await server_manager.get_status()
        if not status.get("running"):
            return {"status": "error", "message": "SGLang server is not running"}

        host = status.get("host", "127.0.0.1")
        port = status.get("port", 30000)
        model_path = status.get("model_path", "")
        model_name = model_path.split("/")[-1] if model_path else "default"

        self._running = True
        self._results = []
        self._progress = 0.0
        self._current_run = 0
        self._total_runs = num_runs
        base_url = f"http://{host}:{port}"

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                health = await client.get(f"{base_url}/health", timeout=5.0)
                if health.status_code != 200:
                    return {"status": "error", "message": f"Server health check failed: {health.status_code}"}

                latencies = []
                tokens_per_run = []
                errors_per_run = []

                async def run_single(i: int):
                    try:
                        payload = {
                            "model": model_name,
                            "messages": [{"role": "user", "content": prompt}],
                            "max_tokens": max_tokens,
                            "temperature": temperature,
                            "stream": False,
                        }
                        start = time.time()
                        r = await client.post(f"{base_url}/v1/chat/completions", json=payload)
                        elapsed = time.time() - start
                        if r.status_code == 200:
                            data = r.json()
                            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                            usage = data.get("usage", {})
                            tokens = usage.get("completion_tokens", len(content.split()))
                            return {"latency": elapsed, "tokens": tokens, "error": None}
                        else:
                            return {"latency": 0, "tokens": 0, "error": f"HTTP {r.status_code}"}
                    except Exception as e:
                        return {"latency": 0, "tokens": 0, "error": str(e)}

                if concurrency <= 1:
                    for i in range(num_runs):
                        if not self._running:
                            break
                        result = await run_single(i)
                        latencies.append(result["latency"])
                        tokens_per_run.append(result["tokens"])
                        errors_per_run.append(result["error"])
                        self._current_run = i + 1
                        self._progress = (i + 1) / num_runs * 100
                        await asyncio.sleep(0.05)
                else:
                    semaphore = asyncio.Semaphore(concurrency)
                    async def limited_run(i):
                        async with semaphore:
                            return await run_single(i)
                    tasks = [limited_run(i) for i in range(num_runs)]
                    results = await asyncio.gather(*tasks)
                    for i, result in enumerate(results):
                        latencies.append(result["latency"])
                        tokens_per_run.append(result["tokens"])
                        errors_per_run.append(result["error"])
                        self._current_run = i + 1
                        self._progress = (i + 1) / num_runs * 100

                valid_latencies = [x for x in latencies if x > 0]
                total_tokens = sum(tokens_per_run)
                total_time = sum(valid_latencies)
                error_count = sum(1 for e in errors_per_run if e is not None)

                self._results = [
                    {
                        "run": i + 1,
                        "latency_ms": round(latencies[i] * 1000, 2) if latencies[i] > 0 else 0,
                        "tokens_generated": tokens_per_run[i],
                        "error": errors_per_run[i],
                    }
                    for i in range(num_runs)
                ]

                result = {
                    "status": "completed",
                    "summary": {
                        "num_runs": num_runs,
                        "concurrency": concurrency,
                        "model": model_name,
                        "total_time_seconds": round(total_time, 2),
                        "avg_latency_ms": round(sum(valid_latencies) / len(valid_latencies) * 1000, 2) if valid_latencies else 0,
                        "min_latency_ms": round(min(valid_latencies) * 1000, 2) if valid_latencies else 0,
                        "max_latency_ms": round(max(valid_latencies) * 1000, 2) if valid_latencies else 0,
                        "p50_latency_ms": 0,
                        "p95_latency_ms": 0,
                        "p99_latency_ms": 0,
                        "total_tokens": total_tokens,
                        "tokens_per_second": round(total_tokens / total_time, 2) if total_time > 0 else 0,
                        "errors": error_count,
                    },
                    "runs": self._results,
                }

                if valid_latencies:
                    sorted_latencies = sorted(valid_latencies)
                    n = len(sorted_latencies)
                    result["summary"]["p50_latency_ms"] = round(
                        sorted_latencies[min(int(n * 0.5), n - 1)] * 1000, 2
                    ) if n > 0 else 0
                    result["summary"]["p95_latency_ms"] = round(
                        sorted_latencies[min(int(n * 0.95), n - 1)] * 1000, 2
                    ) if n > 0 else 0
                    result["summary"]["p99_latency_ms"] = round(
                        sorted_latencies[min(int(n * 0.99), n - 1)] * 1000, 2
                    ) if n > 0 else 0

                return result

        finally:
            self._running = False
            self._progress = 100.0

    async def get_status(self) -> dict:
        return {
            "running": self._running,
            "progress": self._progress,
            "current_run": self._current_run,
            "total_runs": self._total_runs,
            "results": self._results,
        }

    def cancel(self):
        self._running = False


benchmark_service = BenchmarkService()
