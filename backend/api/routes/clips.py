from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from supabase import Client
from backend.api.deps import get_current_user, get_user_supabase_client, get_supabase_client
import os
import requests
import tempfile
import uuid
from backend.core.config import settings
import logging

logger = logging.getLogger(__name__)

# Setup export pipeline logger
export_logger = logging.getLogger("export_pipeline")
export_logger.setLevel(logging.DEBUG)
if not export_logger.handlers:
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    export_log_path = os.path.join(root_dir, "export_pipeline.log")
    fh = logging.FileHandler(export_log_path, mode='a', encoding='utf-8')
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    fh.setFormatter(formatter)
    export_logger.addHandler(fh)

router = APIRouter(prefix="/api/clips", tags=["Clips"])

from fastapi import Request, Response
from fastapi.responses import FileResponse, StreamingResponse

class SubtitleUpdate(BaseModel):
    words: Optional[List[Dict[str, Any]]] = None
    style: Optional[Dict[str, Any]] = None
    reset_style: Optional[bool] = False

from fastapi.responses import RedirectResponse
from backend.core.storage import get_r2_client

@router.get("/proxy-media")
def proxy_media(url: str):
    """
    Proxy R2 public URLs to bypass ISP blocks on .r2.dev domains by redirecting to a short-lived
    presigned URL using the unblocked .cloudflarestorage.com endpoint.
    """
    if not url or not settings.R2_PUBLIC_URL or not url.startswith(settings.R2_PUBLIC_URL):
        # If it's not our R2 public URL, just redirect to the original URL
        response = RedirectResponse(url=url)
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response
        
    # Extract object key
    base_url = settings.R2_PUBLIC_URL.rstrip("/")
    object_key = url[len(base_url)+1:]
    object_key = object_key.split("?")[0]
    
    client = get_r2_client()
    if not client:
        response = RedirectResponse(url=url)
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response
        
    try:
        presigned_url = client.generate_presigned_url(
            'get_object',
            Params={'Bucket': settings.R2_BUCKET_NAME, 'Key': object_key},
            ExpiresIn=3600
        )
        response = RedirectResponse(url=presigned_url)
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response
    except Exception as e:
        response = RedirectResponse(url=url)
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response

@router.get("/media/{clip_id}")
def serve_local_media(clip_id: str, request: Request):
    """Serve the downloaded raw video to Remotion over localhost with HTTP Range support for Chromium"""
    local_raw_path = os.path.abspath(os.path.join(settings.TEMP_DIR, f"raw_{clip_id}.mp4")).replace("\\", "/")
    if not os.path.exists(local_raw_path):
        raise HTTPException(status_code=404, detail="Media not found")
        
    file_size = os.path.getsize(local_raw_path)
    range_header = request.headers.get("range")
    
    if range_header:
        try:
            byte_range = range_header.replace("bytes=", "").split("-")
            start = int(byte_range[0])
            end = int(byte_range[1]) if len(byte_range) > 1 and byte_range[1] else file_size - 1
        except Exception:
            start = 0
            end = file_size - 1
            
        if start >= file_size:
            return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}"})
            
        chunk_size = end - start + 1
        
        def file_iterator():
            with open(local_raw_path, "rb") as f:
                f.seek(start)
                bytes_to_read = chunk_size
                while bytes_to_read > 0:
                    chunk = f.read(min(bytes_to_read, 1024 * 1024))
                    if not chunk:
                        break
                    yield chunk
                    bytes_to_read -= len(chunk)
                    
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(chunk_size),
            "Content-Type": "video/mp4",
        }
        return StreamingResponse(file_iterator(), status_code=206, headers=headers)
        
    return FileResponse(local_raw_path, media_type="video/mp4", headers={"Accept-Ranges": "bytes"})
def list_clips(
    current_user: dict = Depends(get_current_user),
    supabase_client: Client = Depends(get_user_supabase_client)
):
    """
    List all processed and generated clips for the user.
    """
    try:
        res = supabase_client.table("clips").select("*").order("created_at", desc=True).execute()
        return {"clips": res.data}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch clips: {str(e)}"
        )

@router.get("/{clip_id}")
def get_clip_details(
    clip_id: str,
    current_user: dict = Depends(get_current_user),
    supabase_client: Client = Depends(get_user_supabase_client)
):
    """
    Fetch full clip details including subtitle JSON and styling specifications.
    """
    try:
        res = supabase_client.table("clips").select("*").eq("id", clip_id).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Clip not found"
            )
        return {"clip": res.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve clip details: {str(e)}"
        )

@router.put("/{clip_id}/subtitles")
def update_clip_subtitles(
    clip_id: str,
    payload: SubtitleUpdate,
    current_user: dict = Depends(get_current_user),
    supabase_client: Client = Depends(get_user_supabase_client)
):
    """
    Updates the subtitle text, timestamps, or visual design styling configurations
    in the database. This acts as the direct persistence layer for the frontend editor.
    """
    try:
        # Check if clip exists and belongs to the user
        check_res = supabase_client.table("clips").select("id").eq("id", clip_id).execute()
        if not check_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Clip not found or unauthorized access"
            )
            
        update_data = {}
        if payload.words is not None:
            update_data["subtitle_data"] = {"clip_id": clip_id, "words": payload.words}
            
        if payload.reset_style:
            update_data["subtitle_style"] = {}
        elif payload.style is not None:
            update_data["subtitle_style"] = payload.style
            
        if not update_data:
            return {"message": "No changes requested", "clip": check_res.data[0]}
            
        res = supabase_client.table("clips").update(update_data).eq("id", clip_id).execute()
        return {
            "message": "Subtitles saved successfully",
            "clip": res.data[0]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save subtitles: {str(e)}"
        )

@router.post("/{clip_id}/render")
def trigger_clip_rendering(
    clip_id: str,
    agent_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    supabase_client: Client = Depends(get_supabase_client)
):
    """
    Triggers re-rendering of the video to burn the edited dynamic subtitles into the final MP4 file.
    Returns a StreamingResponse (SSE) that emits progress events.
    """
    # Fetch clip for reference (do this before streaming to validate early)
    res = supabase_client.table("clips").select("*").eq("id", clip_id).execute()
    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clip not found"
        )
        
    clip = res.data[0]

    def event_stream():
        import json
        import subprocess
        import re
        import time
        import traceback
        import shutil
        
        export_logger.info(f"=== Starting export pipeline for clip_id: {clip_id} ===")
        
        try:
            yield f"data: {json.dumps({'status': 'starting', 'progress': 0})}\n\n"
            
            # 1. Download the raw video
            storage_path = clip.get("storage_path")
            export_logger.info(f"[{clip_id}] Raw video storage_path: {storage_path}")
            if not storage_path:
                export_logger.error(f"[{clip_id}] Raw video not found in storage.")
                raise Exception("Raw video not found in storage")
                
            # Get public URL
            if storage_path.startswith("http://") or storage_path.startswith("https://"):
                raw_video_url = storage_path
                
                # Bypass Internet Positif (ISP block) for R2 public URLs by generating a presigned URL
                if settings.R2_PUBLIC_URL and raw_video_url.startswith(settings.R2_PUBLIC_URL):
                    from backend.core.storage import get_r2_client
                    client = get_r2_client()
                    if client:
                        base_url = settings.R2_PUBLIC_URL.rstrip("/")
                        object_key = raw_video_url[len(base_url)+1:].split("?")[0]
                        presigned = client.generate_presigned_url(
                            'get_object',
                            Params={'Bucket': settings.R2_BUCKET_NAME, 'Key': object_key},
                            ExpiresIn=3600
                        )
                        raw_video_url = presigned
                        export_logger.info(f"[{clip_id}] Bypassed R2 public URL with presigned URL to avoid ISP blocks.")
                        
            else:
                raw_video_url = supabase_client.storage.from_("clips").get_public_url(storage_path)
            
            # Download locally to render-engine/public/tmp_videos
            root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
            render_engine_path = os.path.join(root_dir, "render-engine")
            public_tmp_dir = os.path.join(render_engine_path, "public", "tmp_videos")
            os.makedirs(public_tmp_dir, exist_ok=True)
            
            local_raw_path = os.path.abspath(os.path.join(public_tmp_dir, f"raw_{clip_id}.mp4")).replace("\\", "/")
            export_logger.info(f"[{clip_id}] Downloading raw video from {raw_video_url} to {local_raw_path}")
            # Disable SSL warnings for this specific request
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            
            response = requests.get(raw_video_url, verify=False)
            if not response.ok:
                export_logger.error(f"[{clip_id}] Failed to download raw video. Status: {response.status_code}, Response: {response.text}")
                raise Exception(f"Failed to download raw video: HTTP {response.status_code}")
                
            with open(local_raw_path, "wb") as f:
                f.write(response.content)
            export_logger.info(f"[{clip_id}] Raw video downloaded successfully. Size: {os.path.getsize(local_raw_path)} bytes.")
                
            # Use relative path so Remotion reads directly from local file via staticFile()
            local_video_url = f"tmp_videos/raw_{clip_id}.mp4"
            
            yield f"data: {json.dumps({'status': 'starting', 'progress': 2})}\n\n"
                
            # 2. Get Subtitles and Style
            export_logger.info(f"[{clip_id}] Parsing subtitle data and styles...")
            sub_data = clip.get("subtitle_data", {})
            if isinstance(sub_data, str):
                sub_data = json.loads(sub_data)
            words = sub_data.get("words", [])
            
            sub_style = clip.get("subtitle_style", {})
            if isinstance(sub_style, str):
                sub_style = json.loads(sub_style)
                
            # Fetch Brand Settings & Caption Settings
            brand_settings = {}
            caption_settings = {}
            try:
                if agent_id:
                    bt_res = supabase_client.table("brand_templates").select("brand_settings, caption_settings").eq("agent_id", agent_id).limit(1).execute()
                else:
                    bt_res = supabase_client.table("brand_templates").select("brand_settings, caption_settings").eq("user_id", current_user["id"]).limit(1).execute()
                    
                if bt_res.data:
                    bt = bt_res.data[0]
                    if bt.get("brand_settings"):
                        brand_settings = bt["brand_settings"]
                    if bt.get("caption_settings"):
                        caption_settings = bt["caption_settings"]
            except Exception as e:
                pass

            merged_style = {**caption_settings, **sub_style}
            export_logger.debug(f"[{clip_id}] Merged subtitle style: {json.dumps(merged_style)}")
            
            duration_sec = clip.get("duration_seconds", 15)
            frames = int(duration_sec * 30)
            export_logger.info(f"[{clip_id}] Video duration: {duration_sec}s, Frames: {frames}")
            
            # 3. Prepare Props
            props_data = {
                "videoUrl": local_video_url,
                "words": words,
                "style": merged_style,
                "brandSettings": brand_settings,
                "durationInFrames": max(1, frames)
            }
            props_path = os.path.abspath(os.path.join(settings.TEMP_DIR, f"props_{clip_id}.json")).replace("\\", "/")
            export_logger.info(f"[{clip_id}] Writing Remotion props to {props_path}")
            with open(props_path, "w", encoding="utf-8") as f:
                json.dump(props_data, f)
                
            yield f"data: {json.dumps({'status': 'starting', 'progress': 5})}\n\n"
            
            # 4. Render Video via Remotion CLI
            export_logger.info(f"[{clip_id}] Starting Remotion render process...")
            local_subbed = os.path.abspath(os.path.join(settings.TEMP_DIR, f"subbed_{clip_id}.mp4")).replace("\\", "/")
            
            npx_cmd = "npx.cmd" if os.name == "nt" else "npx"
            cmd = [
                npx_cmd, "remotion", "render",
                "src/index.ts",
                "SubtitleOverlay",
                local_subbed,
                f"--props={props_path}",
                "--timeout=600000",
                "--concurrency=4",
                "--crf=26",
                "--image-format=jpeg",
                "--jpeg-quality=85",
                "--gl=angle",
                "--log=info"
            ]
            
            process = subprocess.Popen(
                cmd,
                cwd=render_engine_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                bufsize=1
            )
            
            # Read character by character to handle \r without blocking
            buffer = ""
            full_log = ""
            last_logged_percent = -1
            if process.stdout:
                while True:
                    char = process.stdout.read(1)
                    if not char:
                        break
                    buffer += char
                    full_log += char
                    if char in ['\r', '\n']:
                        # Try matching (X%) format
                        match_pct = re.search(r'\((\d+)%\)', buffer)
                        # Try matching X/Y frames format
                        match_frames = re.search(r'(\d+)\s*/\s*(\d+)', buffer)
                        
                        percent = -1
                        if match_pct:
                            percent = int(match_pct.group(1))
                        elif match_frames:
                            done = int(match_frames.group(1))
                            total = int(match_frames.group(2))
                            if total > 0:
                                percent = int((done / total) * 100)
                                
                        if percent >= 0:
                            # Scale 0-100% from remotion to 5-90% for overall progress
                            scaled = 5 + int(percent * 0.85)
                            
                            # Only log every 10% to avoid flooding the log file
                            if percent % 10 == 0 and percent != last_logged_percent:
                                export_logger.debug(f"[{clip_id}] Remotion rendering progress: {percent}%")
                                last_logged_percent = percent
                                
                            yield f"data: {json.dumps({'status': 'rendering', 'progress': scaled})}\n\n"
                            
                        # Also log any explicit errors from remotion
                        lower_buf = buffer.lower()
                        is_false_positive = "type errors and feature incompatibilities" in lower_buf or "failed renders and unclear errors" in lower_buf
                        if ("error" in lower_buf or "failed" in lower_buf) and not is_false_positive:
                            export_logger.error(f"[{clip_id}] Remotion log: {buffer.strip()}")
                            
                        buffer = ""
                
                process.stdout.close()
            
            return_code = process.wait()
            export_logger.info(f"[{clip_id}] Remotion process finished with exit code {return_code}")
            
            if return_code != 0:
                error_summary = "\n".join(full_log.strip().split("\n")[-10:])
                export_logger.error(f"[{clip_id}] Remotion failed. Exit Code: {return_code}. Summary: {error_summary}")
                raise Exception(f"Remotion render failed with exit code {return_code}. Error: {error_summary}")
                
            export_logger.info(f"[{clip_id}] Render completed successfully. Starting upload to R2...")
            yield f"data: {json.dumps({'status': 'uploading', 'progress': 92})}\n\n"
                
            # 5. Upload Subbed Video
            from backend.core.storage import upload_to_r2
            subbed_storage_path = f"{current_user['id']}/{clip_id}_subbed.mp4"
            export_logger.info(f"[{clip_id}] Uploading to R2 path: {subbed_storage_path}")
            final_url_res = upload_to_r2(local_subbed, subbed_storage_path, "video/mp4")
            
            if not final_url_res:
                export_logger.error(f"[{clip_id}] Failed to upload subbed video to R2. Falling back to local URL.")
                logger.error("Failed to upload subbed video to R2")
                # Fallback to local
                final_url_res = local_subbed
            else:
                export_logger.info(f"[{clip_id}] Successfully uploaded to R2: {final_url_res}")
            
            yield f"data: {json.dumps({'status': 'uploading', 'progress': 98})}\n\n"
            
            final_url_res = f"{final_url_res}?t={int(time.time())}"
            
            # Auto-Save
            downloads_dir = os.path.join(os.path.expanduser('~'), 'Downloads')
            os.makedirs(downloads_dir, exist_ok=True)
            final_output_path = os.path.join(downloads_dir, f"metisclip_{clip_id}.mp4")
            export_logger.info(f"[{clip_id}] Auto-saving to local Downloads: {final_output_path}")
            shutil.copy2(local_subbed, final_output_path)
            
            # Clean up temp files
            export_logger.debug(f"[{clip_id}] Cleaning up temporary files...")
            try:
                os.remove(local_raw_path)
                os.remove(props_path)
                os.remove(local_subbed)
                export_logger.debug(f"[{clip_id}] Cleanup successful.")
            except Exception as cleanup_err:
                export_logger.warning(f"[{clip_id}] Cleanup failed: {str(cleanup_err)}")
                pass

            export_logger.info(f"=== Export pipeline completed successfully for clip_id: {clip_id} ===")
            yield f"data: {json.dumps({'status': 'completed', 'progress': 100, 'url': final_url_res})}\n\n"

        except Exception as e:
            export_logger.error(f"[{clip_id}] Export pipeline failed with error: {str(e)}\n{traceback.format_exc()}")
            traceback.print_exc()
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
