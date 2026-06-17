import os

import httpx
import semver

from app import __version__
from app.config import settings


class Updater:
    def __init__(self):
        self._current_version = __version__
        self._download_progress: dict = {"status": "idle", "progress": 0.0}

    async def check_github(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    settings.update_check_url_github,
                    headers={"Accept": "application/vnd.github.v3+json"},
                )
                if r.status_code != 200:
                    return {"update_available": False, "error": f"HTTP {r.status_code}"}

                data = r.json()
                latest_tag = data.get("tag_name", "").lstrip("v")
                current = self._current_version.lstrip("v")

                update_available = semver.compare(latest_tag, current) > 0 if latest_tag and current else False

                return {
                    "update_available": update_available,
                    "current_version": self._current_version,
                    "latest_version": data.get("tag_name", ""),
                    "download_url": data.get("assets", [{}])[0].get("browser_download_url") if data.get("assets") else None,
                    "changelog": data.get("body", ""),
                    "release_date": data.get("published_at", ""),
                    "source": "github",
                }
        except Exception as e:
            return {"update_available": False, "error": str(e)}

    async def check_selfhosted(self) -> dict:
        url = settings.update_check_url_selfhosted
        if not url:
            return {"update_available": False, "error": "No self-hosted URL configured"}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(url)
                if r.status_code != 200:
                    return {"update_available": False, "error": f"HTTP {r.status_code}"}

                data = r.json()
                latest_tag = data.get("version", "").lstrip("v")
                current = self._current_version.lstrip("v")

                update_available = semver.compare(latest_tag, current) > 0 if latest_tag and current else False

                return {
                    "update_available": update_available,
                    "current_version": self._current_version,
                    "latest_version": data.get("version", ""),
                    "download_url": data.get("download_url"),
                    "changelog": data.get("changelog", ""),
                    "source": "selfhosted",
                }
        except Exception as e:
            return {"update_available": False, "error": str(e)}

    async def check_all(self) -> dict:
        result = await self.check_github()
        if not result.get("update_available") and settings.update_check_url_selfhosted:
            result = await self.check_selfhosted()
        return result

    async def download_update(self, url: str) -> dict:
        self._download_progress = {"status": "downloading", "progress": 0.0, "downloaded_bytes": 0, "total_bytes": 0}

        try:
            async with httpx.AsyncClient(timeout=300.0, follow_redirects=True) as client:
                async with client.stream("GET", url) as r:
                    total = int(r.headers.get("content-length", 0))
                    downloaded = 0

                    temp_path = "sglang_commander_update.tmp"
                    with open(temp_path, "wb") as f:
                        async for chunk in r.aiter_bytes(chunk_size=8192):
                            f.write(chunk)
                            downloaded += len(chunk)
                            progress = (downloaded / total * 100) if total > 0 else 0
                            self._download_progress = {
                                "status": "downloading",
                                "progress": progress,
                                "downloaded_bytes": downloaded,
                                "total_bytes": total,
                            }

                    self._download_progress = {"status": "done", "progress": 100.0, "path": temp_path}
                    return {"status": "downloaded", "path": temp_path}
        except Exception as e:
            self._download_progress = {"status": "error", "error": str(e)}
            return {"status": "error", "error": str(e)}

    async def get_status(self) -> dict:
        return self._download_progress


    async def apply_update(self) -> dict:
        status = self._download_progress
        if status.get("status") != "done" or not status.get("path"):
            return {"status": "error", "message": "No downloaded update to apply"}

        self._download_progress = {"status": "applying", "progress": 100.0}
        update_path = status["path"]

        try:
            import sys
            import subprocess
            import shutil

            if sys.platform == "win32":
                installer = shutil.which("sglang-commander-installer.exe") or update_path
                subprocess.Popen([installer, "/S"], shell=True)
            else:
                os.chmod(update_path, 0o755)
                subprocess.Popen([update_path, "--apply"])

            self._download_progress = {"status": "applied", "progress": 100.0, "path": update_path}
            return {"status": "applied", "message": "Update will be applied on next restart"}
        except Exception as e:
            self._download_progress = {"status": "error", "error": str(e)}
            return {"status": "error", "error": str(e)}

    async def cancel_download(self) -> dict:
        temp_path = self._download_progress.get("path")
        self._download_progress = {"status": "cancelled", "progress": 0.0}
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
        return {"status": "cancelled"}


updater = Updater()
