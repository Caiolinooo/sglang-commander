#!/usr/bin/env python3
"""
SGLang Commander - Dependency Installer
Auto-installs all required packages with progress display.
"""
import subprocess
import sys
import time


REQUIRED = [
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
    "websockets>=14.0",
]

DESKTOP = [
    "PySide6>=6.8.0",
    "pyqtgraph>=0.13.0",
]

ALL_PACKAGES = REQUIRED + DESKTOP


def check_installed() -> list[str]:
    import importlib.metadata
    missing = []
    for spec in ALL_PACKAGES:
        name = spec.split(">=")[0].split("==")[0].split("[")[0].strip()
        try:
            importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            missing.append(spec)
    return missing


def install_packages(packages: list[str]):
    total = len(packages)
    for i, pkg in enumerate(packages):
        print(f"[{i+1}/{total}] Installing {pkg}...")
        start = time.time()
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", pkg],
            capture_output=True, text=True,
        )
        elapsed = time.time() - start
        if result.returncode == 0:
            print(f"  \u2713 Installed in {elapsed:.1f}s")
        else:
            error = result.stderr[-200:] if result.stderr else "Unknown error"
            print(f"  \u2717 Failed: {error}")


if __name__ == "__main__":
    print("=" * 60)
    print("  SGLang Commander - Dependency Installer")
    print("=" * 60)

    missing = check_installed()
    if not missing:
        print("\nAll dependencies are already installed!")
        sys.exit(0)

    print(f"\n{len(missing)} packages need to be installed:")
    for pkg in missing:
        print(f"  - {pkg}")

    print("\nInstalling...\n")
    install_packages(missing)

    still_missing = check_installed()
    if still_missing:
        print(f"\n\u26a0\ufe0f {len(still_missing)} packages still missing:")
        for pkg in still_missing:
            print(f"  - {pkg}")
        sys.exit(1)
    else:
        print("\n\u2705 All dependencies installed successfully!")
