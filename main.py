#!/usr/bin/env python3
"""
SGLang Commander - Main Entry Point

Usage:
    sglang-commander [desktop|server] [options]

Modes:
    desktop    Launch the PySide6 desktop GUI (default)
    server     Launch the FastAPI web server + React SPA
"""
import sys
import os


def main():
    mode = "desktop"

    if len(sys.argv) > 1:
        mode = sys.argv[1].lower()

    # Ensure backend is on sys.path for internal imports
    backend_dir = os.path.join(os.path.dirname(__file__), "backend")
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)

    if mode == "server":
        print("Starting SGLang Commander in SERVER mode...")
        from backend.app.main import run as run_server
        run_server()
    elif mode == "desktop":
        print("Starting SGLang Commander in DESKTOP mode...")
        try:
            from desktop.app import run_desktop
            run_desktop()
        except ImportError as e:
            print(f"Desktop mode requires PySide6 and pyqtgraph.")
            print(f"Error: {e}")
            print(f"Install with: pip install PySide6 pyqtgraph")
            print(f"Or use 'server' mode instead.")
            sys.exit(1)
    else:
        print(f"Unknown mode: {mode}")
        print("Usage: sglang-commander [desktop|server]")
        sys.exit(1)


if __name__ == "__main__":
    main()
