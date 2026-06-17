import asyncio
import json
import sys
import shutil
import os
from typing import Dict, List

class DependencyUpdater:
    def __init__(self):
        self.target_packages = ["sglang", "vllm", "llama-cpp-python", "ollama", "torch", "transformers", "accelerate", "flashinfer", "outlines"]
        self.update_status = {"status": "idle", "logs": []}

    def _resolve_python(self) -> str:
        """Return the Python interpreter inside the active venv."""
        if hasattr(sys, "prefix") and sys.prefix != getattr(sys, "base_prefix", sys.prefix):
            candidate = os.path.join(sys.prefix, "bin", "python")
            if os.path.isfile(candidate):
                return candidate
            candidate_win = os.path.join(sys.prefix, "Scripts", "python.exe")
            if os.path.isfile(candidate_win):
                return candidate_win
        return shutil.which("python3") or shutil.which("python") or sys.executable

    async def check_updates(self) -> List[Dict]:
        """Check for updates for the target packages using pip list --outdated."""
        python_cmd = self._resolve_python()
        try:
            proc = await asyncio.create_subprocess_exec(
                python_cmd, "-m", "pip", "list", "--outdated", "--format=json",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()
            if proc.returncode != 0:
                print(f"Error checking updates: {stderr.decode()}")
                return []
            
            outdated_packages = json.loads(stdout.decode())
            results = []
            for pkg in outdated_packages:
                name = pkg.get("name", "").lower()
                if name in self.target_packages:
                    results.append({
                        "name": pkg["name"],
                        "current_version": pkg["version"],
                        "latest_version": pkg["latest_version"]
                    })
            return results
        except Exception as e:
            print(f"Failed to check updates: {e}")
            return []

    async def _run_upgrade(self, packages: List[str]) -> bool:
        """Run pip install --upgrade for given packages with a dry-run check first if supported."""
        python_cmd = self._resolve_python()
        self.update_status["logs"] = []
        self.update_status["status"] = "running"
        
        # We simulate a dry-run to ensure compatibility and that it won't break dependencies.
        # pip install --dry-run
        try:
            self.update_status["logs"].append("Running compatibility dry-run...")
            dry_proc = await asyncio.create_subprocess_exec(
                python_cmd, "-m", "pip", "install", "--upgrade", "--dry-run", *packages,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout_dry, stderr_dry = await dry_proc.communicate()
            if dry_proc.returncode != 0:
                err = stderr_dry.decode()
                # Some older pips don't support --dry-run. If so, we just proceed.
                if "no such option: --dry-run" not in err.lower():
                    self.update_status["logs"].append(f"Dry-run failed. Compatibility check blocked the update:\n{err}")
                    self.update_status["status"] = "error"
                    return False
                else:
                    self.update_status["logs"].append("Dry-run not supported by this pip version. Proceeding directly.")
            else:
                self.update_status["logs"].append("Compatibility check passed.")

            self.update_status["logs"].append(f"Installing updates for: {', '.join(packages)}...")
            
            proc = await asyncio.create_subprocess_exec(
                python_cmd, "-m", "pip", "install", "--upgrade", *packages,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT
            )
            
            # Read streaming output
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                decoded = line.decode(errors="replace").rstrip()
                self.update_status["logs"].append(decoded)
            
            await proc.wait()
            
            if proc.returncode == 0:
                self.update_status["status"] = "success"
                self.update_status["logs"].append("Update completed successfully.")
                return True
            else:
                self.update_status["status"] = "error"
                self.update_status["logs"].append(f"Process exited with code {proc.returncode}")
                return False
                
        except Exception as e:
            self.update_status["status"] = "error"
            self.update_status["logs"].append(f"Exception during update: {e}")
            return False

    async def upgrade_packages(self, packages: List[str]) -> Dict:
        """Start upgrade process asynchronously."""
        if self.update_status["status"] == "running":
            return {"status": "error", "message": "An update is already in progress."}
        
        asyncio.create_task(self._run_upgrade(packages))
        return {"status": "started", "message": "Update process started."}

    def get_status(self) -> Dict:
        return self.update_status

dependency_updater = DependencyUpdater()
