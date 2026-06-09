#!/usr/bin/env python3
"""
SGLang Commander - Main Entry Point

Usage:
    sglang-commander [server] [options]

Modes:
    server     Launch the FastAPI web server + React SPA (default)

The desktop PySide6 mode has been removed in v0.2.0.
Use the web interface instead — it works as a PWA for native-like experience.
"""
import sys
import os


def main():
    # Ensure backend is on sys.path for internal imports
    backend_dir = os.path.join(os.path.dirname(__file__), "backend")
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)

    # Parse simple flags
    args = sys.argv[1:]
    mode = "server"

    if args and args[0].lower() in ("server", "web"):
        mode = "server"
        args = args[1:]
    elif args and args[0] in ("--help", "-h"):
        print(__doc__)
        sys.exit(0)

    if mode == "server":
        print("Starting SGLang Commander in SERVER mode...")
        from backend.app.main import run as run_server
        run_server()
    else:
        print(f"Unknown mode: {mode}")
        print("Usage: sglang-commander [server]")
        sys.exit(1)


if __name__ == "__main__":
    main()
