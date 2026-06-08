import asyncio
import logging
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import __version__
from app.api.v1.router import router as api_router
from app.config import settings
from app.core.database import init_db
from app.services.metrics_collector import metrics_collector
from app.websocket.manager import ws_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except (StarletteHTTPException) as ex:
            if ex.status_code == 404:
                return await super().get_response("index.html", scope)
            raise ex


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.app_name} v{__version__}")
    await init_db()
    from app.services.auth_service import auth_service
    await auth_service.ensure_default_admin()
    await metrics_collector.start()
    asyncio.create_task(_metrics_broadcaster())

    frontend_path = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
    frontend_path = os.path.abspath(frontend_path)
    if os.path.exists(frontend_path):
        app.mount("/", SPAStaticFiles(directory=frontend_path, html=True), name="frontend")
        logger.info(f"Serving frontend from {frontend_path}")
    else:
        logger.info(f"No frontend build found at {frontend_path}, API only")

    yield

    await metrics_collector.stop()


app = FastAPI(
    title=settings.app_name,
    version=__version__,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/api/health")
async def root_health():
    return {
        "app": settings.app_name,
        "version": __version__,
        "status": "ok",
    }


@app.websocket("/ws/metrics")
async def metrics_websocket(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)


async def _metrics_broadcaster():
    while True:
        await asyncio.sleep(2)
        snapshot = metrics_collector.get_latest()
        if snapshot:
            await ws_manager.broadcast(snapshot)


def run():
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="info",
    )


if __name__ == "__main__":
    run()
