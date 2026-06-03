from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from pydantic import BaseModel, Field
from typing import Optional

from app.core.deps import get_current_user
from app.models.user import User
from app.services.tts_stt_service import tts_service, stt_service

router = APIRouter()


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    voice: str = Field(default="default")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    endpoint_url: str = Field(default="http://127.0.0.1:30000")


@router.post("/tts")
async def text_to_speech(
    req: TTSRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        audio_data = await tts_service.synthesize(
            text=req.text,
            voice=req.voice,
            speed=req.speed,
            endpoint_url=req.endpoint_url,
        )
        from fastapi.responses import Response
        return Response(content=audio_data, media_type="audio/wav")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS failed: {str(e)}")


@router.post("/stt")
async def speech_to_text(
    file: UploadFile = File(...),
    language: Optional[str] = Form(default=None),
    endpoint_url: str = Form(default="http://127.0.0.1:30000"),
    current_user: User = Depends(get_current_user),
):
    audio_data = await file.read()
    try:
        text = await stt_service.transcribe(
            audio_data=audio_data,
            language=language,
            endpoint_url=endpoint_url,
        )
        return {"text": text}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"STT failed: {str(e)}")
