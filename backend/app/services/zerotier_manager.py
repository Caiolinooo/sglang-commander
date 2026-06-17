import asyncio
from typing import Optional




class ZeroTierManager:
    def __init__(self):
        self._node_id: Optional[str] = None

    async def _run_cli(self, *args: str) -> tuple[int, str, str]:
        try:
            proc = await asyncio.create_subprocess_exec(
                "zerotier-cli", *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
            return proc.returncode or 0, stdout.decode(errors="replace"), stderr.decode(errors="replace")
        except FileNotFoundError:
            return -1, "", "zerotier-cli not found"

    def _is_installed(self) -> bool:
        import shutil
        return shutil.which("zerotier-cli") is not None

    async def get_status(self) -> dict:
        if not self._is_installed():
            return {"installed": False, "running": False, "online": False, "networks": []}

        code, out, err = await self._run_cli("info")
        if code != 0:
            return {"installed": True, "running": False, "online": False, "networks": []}

        parts = out.split()
        node_id = parts[0] if parts else None
        online = "ONLINE" in out.upper()

        code2, out2, _ = await self._run_cli("listnetworks")
        networks = []
        for line in out2.strip().split("\n"):
            if not line.strip():
                continue
            parts = line.split()
            if len(parts) >= 4:
                networks.append({
                    "network_id": parts[0],
                    "name": parts[1] if len(parts) > 1 else "",
                    "status": parts[2] if len(parts) > 2 else "",
                    "assigned_ips": parts[3].split(",") if len(parts) > 3 else [],
                })

        return {
            "installed": True,
            "running": True,
            "node_id": node_id,
            "online": online,
            "networks": networks,
        }

    async def join_network(self, network_id: str) -> dict:
        code, out, err = await self._run_cli("join", network_id)
        if code == 0:
            return {"status": "joined", "network_id": network_id}
        return {"status": "error", "message": err}

    async def leave_network(self, network_id: str) -> dict:
        code, out, err = await self._run_cli("leave", network_id)
        if code == 0:
            return {"status": "left", "network_id": network_id}
        return {"status": "error", "message": err}

    async def list_networks(self) -> list[dict]:
        status = await self.get_status()
        return status.get("networks", [])

    async def get_connection_string(self, host: str, port: int, api_key: str) -> str:
        return (
            f"# SGLang Commander - Remote Connection\n"
            f"API_URL=http://{host}:{port}/api/v1\n"
            f"API_KEY={api_key}\n"
            f"\n# Example with curl:\n"
            f'curl -H "Authorization: Bearer {api_key}" http://{host}:{port}/api/v1/server/status'
        )


zerotier_manager = ZeroTierManager()
