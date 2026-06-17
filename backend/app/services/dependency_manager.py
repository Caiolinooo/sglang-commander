import asyncio
import sys


class DependencyManager:
    REQUIRED_PACKAGES = [
        "fastapi>=0.115.0",
        "uvicorn[standard]>=0.34.0",
        "sqlalchemy[asyncio]>=2.0.0",
        "aiosqlite>=0.20.0",
        "python-jose[cryptography]>=3.3.0",
        "passlib[bcrypt]>=1.7.4",
        "pydantic>=2.0.0",
        "pydantic-settings>=2.0.0",
        "httpx>=0.28.0",
        "aiohttp>=3.14.0",
        "psutil>=7.1.0",
        "huggingface_hub>=0.27.0",
        "semver>=3.0.0",
        "python-multipart>=0.0.18",
    ]

    DESKTOP_PACKAGES = [
        "PySide6>=6.8.0",
        "pyqtgraph>=0.13.0",
    ]

    @property
    def GPU_PACKAGES(self) -> list[str]:
        from app.services.gpu_detector import get_gpu_packages
        return get_gpu_packages()

    async def check_package(self, package_spec: str) -> dict:
        import importlib.metadata

        name = package_spec.split(">=")[0].split("==")[0].split("[")[0].strip()
        required_version = None
        if ">=" in package_spec:
            required_version = package_spec.split(">=")[1].strip()
        elif "==" in package_spec:
            required_version = package_spec.split("==")[1].strip()

        try:
            installed = importlib.metadata.version(name)
            return {
                "name": name,
                "installed": installed,
                "required": required_version,
                "satisfied": True,
            }
        except importlib.metadata.PackageNotFoundError:
            return {
                "name": name,
                "installed": None,
                "required": required_version,
                "satisfied": False,
            }

    async def check_all(self, include_desktop: bool = False, include_gpu: bool = False) -> dict:
        results = []
        for pkg in self.REQUIRED_PACKAGES:
            results.append(await self.check_package(pkg))

        if include_desktop:
            for pkg in self.DESKTOP_PACKAGES:
                results.append(await self.check_package(pkg))

        if include_gpu:
            for pkg in self.GPU_PACKAGES:
                results.append(await self.check_package(pkg))

        missing = [r for r in results if not r["satisfied"]]
        return {
            "total": len(results),
            "satisfied": len(results) - len(missing),
            "missing": len(missing),
            "packages": results,
            "missing_packages": missing,
        }

    async def install_missing(self, packages: list[str], progress_callback=None) -> list[dict]:
        results = []
        for pkg in packages:
            result = await self.install_package(pkg, progress_callback)
            results.append(result)
        return results

    async def install_package(self, package_spec: str, progress_callback=None) -> dict:
        try:
            if progress_callback:
                progress_callback({"package": package_spec, "status": "installing", "progress": 0})

            proc = await asyncio.create_subprocess_exec(
                sys.executable, "-m", "pip", "install", package_spec,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()

            if proc.returncode == 0:
                if progress_callback:
                    progress_callback({"package": package_spec, "status": "installed", "progress": 100})
                return {"name": package_spec, "status": "installed", "success": True}
            else:
                if progress_callback:
                    progress_callback({"package": package_spec, "status": "error", "progress": 0})
                return {
                    "name": package_spec,
                    "status": "error",
                    "success": False,
                    "error": stderr.decode(errors="replace")[-500:],
                }
        except Exception as e:
            return {"name": package_spec, "status": "error", "success": False, "error": str(e)}


dependency_manager = DependencyManager()
