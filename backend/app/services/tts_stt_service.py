import io
import json
from typing import Optional

import httpx


class TTSService:
    async def synthesize(
        self,
        text: str,
        voice: str = "default",
        speed: float = 1.0,
        endpoint_url: str = "http://127.0.0.1:30000",
    ) -> bytes:
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                r = await client.post(
                    f"{endpoint_url}/v1/audio/speech",
                    json={
                        "input": text,
                        "voice": voice,
                        "speed": speed,
                        "response_format": "wav",
                    },
                )
                if r.status_code == 200:
                    return r.content
            except Exception:
                pass
            from app.services.model_manager import model_manager
            local_models = await model_manager.list_local_models()
            tts_model = None
            for m in local_models:
                if "tts" in m.get("repo_id", "").lower() or "speech" in m.get("repo_id", "").lower():
                    tts_model = m["repo_id"]
                    break
            if not tts_model:
                tts_model = "suno/bark"
            try:
                r2 = await client.post(
                    f"{endpoint_url}/v1/completions",
                    json={
                        "text": text,
                        "sampling_params": {"max_new_tokens": 512},
                        "model": tts_model,
                    },
                )
                if r2.status_code == 200:
                    return r2.content
            except Exception:
                pass
            raise ValueError("No TTS model available")


class STTService:
    async def transcribe(
        self,
        audio_data: bytes,
        language: Optional[str] = None,
        endpoint_url: str = "http://127.0.0.1:30000",
    ) -> str:
        async with httpx.AsyncClient(timeout=120.0) as client:
            files = {"file": ("audio.wav", audio_data, "audio/wav")}
            params = {"response_format": "json"}
            if language:
                params["language"] = language
            try:
                r = await client.post(
                    f"{endpoint_url}/v1/audio/transcriptions",
                    files=files,
                    params=params,
                )
                if r.status_code == 200:
                    data = r.json()
                    return data.get("text", "")
            except Exception:
                pass
            from app.services.model_manager import model_manager
            local_models = await model_manager.list_local_models()
            stt_model = "Systran/faster-whisper-base.en"
            for m in local_models:
                if "whisper" in m.get("repo_id", "").lower():
                    stt_model = m["repo_id"]
                    break
            raise ValueError(f"No STT model available. Install a Whisper model like {stt_model}")


tts_service = TTSService()
stt_service = STTService()
