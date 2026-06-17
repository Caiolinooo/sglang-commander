from fastapi import APIRouter

from app.api.v1 import auth, server, chat, models, metrics, zerotier, settings, updates, server_profiles, benchmark, tts_stt, diagnostics, templates, batch, connections, rag, dependencies, simulate

router = APIRouter(prefix="/api/v1")

router.include_router(auth.router, prefix="/auth", tags=["Auth"])
router.include_router(server.router, prefix="/server", tags=["Server"])
router.include_router(server_profiles.router, prefix="/server-profiles", tags=["Server Profiles"])
router.include_router(chat.router, prefix="/chat", tags=["Chat"])
router.include_router(models.router, prefix="/models", tags=["Models"])
router.include_router(metrics.router, prefix="/metrics", tags=["Metrics"])
router.include_router(zerotier.router, prefix="/zerotier", tags=["ZeroTier"])
router.include_router(settings.router, prefix="/settings", tags=["Settings"])
router.include_router(updates.router, prefix="/update", tags=["Updates"])
router.include_router(benchmark.router, prefix="/benchmark", tags=["Benchmark"])
router.include_router(tts_stt.router, prefix="/audio", tags=["Audio"])
router.include_router(diagnostics.router, prefix="/diagnostics", tags=["Diagnostics"])
router.include_router(templates.router, prefix="/templates", tags=["Templates"])
router.include_router(batch.router, prefix="/batch", tags=["Batch"])
router.include_router(connections.router, prefix="/connections", tags=["Connections"])
router.include_router(rag.router, prefix="/rag", tags=["RAG"])
router.include_router(dependencies.router, prefix="/dependencies", tags=["Dependencies"])
router.include_router(simulate.router, prefix="/simulate", tags=["Simulate"])
