"""Speech-to-text status and the local Whisper models (Pengaturan → Transkripsi)."""
from __future__ import annotations

from fastapi import APIRouter
from starlette.concurrency import run_in_threadpool

from backend.agents.tools import whisper, whisper_local
from backend.api.dto import http_error
from backend.core.secrets import get_secret

router = APIRouter(prefix="/api/whisper", tags=["whisper"])


def _status() -> dict:
    physical, logical, ram_gb = whisper_local._hardware()
    models = []
    for m in whisper_local.MODELS.values():
        models.append({
            "id": m.id,
            "label": m.label,
            "description": m.description,
            "size_bytes": m.size_bytes,
            "installed": whisper_local.installed(m),
            "download": whisper_local.download_state(m.id),
        })
    return {
        "provider": whisper.provider(),
        "groq_key_set": bool(get_secret("groq_api_key")),
        "local": {
            "available": whisper_local.binary() is not None,
            "version": whisper_local.version(),
            "busy": whisper_local.busy(),
            "threads": whisper_local.threads(),
            "model_setting": whisper_local.model_setting(),
            # The model each task uses with the current setting
            "transcript_model": whisper_local.chosen_model(words=False).id,
            "subtitle_model": whisper_local.chosen_model(words=True).id,
            # What "auto" picks on this PC, for the hint next to the model setting
            "auto_models": {"transcript": whisper_local.recommended_model_id(words=False),
                            "subtitle": whisper_local.recommended_model_id(words=True)},
            "models_dir": str(whisper_local.models_dir()),
        },
        "models": models,
        "cpu_cores": physical,
        "cpu_threads": logical,
        "ram_gb": round(ram_gb, 1),
    }


def _model_or_404(model_id: str) -> None:
    if model_id not in whisper_local.MODELS:
        raise http_error(404, "Model Whisper tidak dikenal")


@router.get("/status")
async def status():
    return await run_in_threadpool(_status)


@router.post("/models/{model_id}/download", status_code=202)
def download_model(model_id: str):
    _model_or_404(model_id)
    started = whisper_local.start_download(model_id)
    return {"ok": True, "started": started}


@router.post("/models/{model_id}/cancel")
def cancel_download(model_id: str):
    _model_or_404(model_id)
    return {"ok": whisper_local.cancel_download(model_id)}


@router.delete("/models/{model_id}")
def delete_model(model_id: str):
    _model_or_404(model_id)
    try:
        whisper_local.delete_model(model_id)
    except whisper_local.LocalWhisperError as exc:
        raise http_error(409, str(exc))
    return {"ok": True}
