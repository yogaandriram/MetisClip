"""Serve files under the data root (HTTP Range supported by FileResponse)."""
from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

from backend.api.dto import http_error
from backend.core.paths import PathOutsideRoot, get_paths

router = APIRouter(tags=["files"])

mimetypes.add_type("video/mp4", ".mp4")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/svg+xml", ".svg")

# Never serve engine-private files or the database
_BLOCKED_TOP = {".metisclip", "db"}


def serve_relative(rel: str, *, download_name: str | None = None) -> FileResponse:
    if not rel:
        raise http_error(404, "File tidak ditemukan")
    paths = get_paths()
    try:
        path: Path = paths.from_relative(rel)
        # Check the *resolved* location so 'library/../.metisclip/…' cannot sneak through
        parts = path.relative_to(paths.data_root.resolve()).parts
    except (PathOutsideRoot, ValueError):
        raise http_error(403, "Akses ditolak")
    if not parts or parts[0].lower() in _BLOCKED_TOP:
        raise http_error(403, "Akses ditolak")
    if not path.is_file():
        raise http_error(404, "File tidak ditemukan")
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(
        path,
        media_type=media_type,
        filename=download_name,
        headers={"Cache-Control": "no-cache", "Accept-Ranges": "bytes"},
    )


@router.get("/api/files/{rel_path:path}")
def get_file(rel_path: str):
    return serve_relative(rel_path)
