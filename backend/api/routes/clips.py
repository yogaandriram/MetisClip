from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any
from supabase import Client
from backend.api.deps import get_current_user, get_user_supabase_client, get_supabase_client
import os
import requests
import tempfile
import uuid
from backend.core.config import settings
from backend.agents.tools.subtitle_renderer import generate_ass_file, burn_subtitles_to_video

router = APIRouter(prefix="/api/clips", tags=["Clips"])

class SubtitleUpdate(BaseModel):
    words: List[Dict[str, Any]]
    style: Dict[str, Any]

@router.get("")
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
            
        update_data = {
            "subtitle_data": {"clip_id": clip_id, "words": payload.words},
            "subtitle_style": payload.style
        }
        
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
    current_user: dict = Depends(get_current_user),
    supabase_client: Client = Depends(get_supabase_client)
):
    """
    Triggers re-rendering of the video to burn the edited dynamic subtitles into the final MP4 file.
    Since we need to deliver it on click, this runs synchronously (for fast 10-15s rendering).
    """
    try:
        # Fetch clip for reference
        res = supabase_client.table("clips").select("*").eq("id", clip_id).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Clip not found"
            )
            
        clip = res.data[0]
        
        # 1. Download the raw video
        storage_path = clip.get("storage_path")
        if not storage_path:
            raise HTTPException(status_code=400, detail="Raw video not found in storage")
            
        # Get public URL
        url_res = supabase_client.storage.from_("clips").get_public_url(storage_path)
        raw_video_url = url_res
        
        # Download locally
        os.makedirs(settings.TEMP_DIR, exist_ok=True)
        local_raw = os.path.join(settings.TEMP_DIR, f"raw_{clip_id}.mp4").replace("\\", "/")
        response = requests.get(raw_video_url)
        with open(local_raw, "wb") as f:
            f.write(response.content)
            
        # 2. Get Subtitles and Style
        sub_data = clip.get("subtitle_data", {})
        if isinstance(sub_data, str):
            import json
            sub_data = json.loads(sub_data)
        words = sub_data.get("words", [])
        
        sub_style = clip.get("subtitle_style", {})
        if isinstance(sub_style, str):
            import json
            sub_style = json.loads(sub_style)
            
        # 3. Prepare Props for Remotion
        props_data = {
            "videoUrl": local_raw,
            "words": words,
            "style": sub_style
        }
        props_path = os.path.join(settings.TEMP_DIR, f"props_{clip_id}.json").replace("\\", "/")
        with open(props_path, "w", encoding="utf-8") as f:
            import json
            json.dump(props_data, f)
            
        # 4. Render Video via Remotion CLI
        local_subbed = os.path.join(settings.TEMP_DIR, f"subbed_{clip_id}.mp4").replace("\\", "/")
        # Calculate root dir from current file path
        root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        render_engine_path = os.path.join(root_dir, "render-engine")
        
        duration_sec = clip.get("duration_seconds", 15)
        frames = int(duration_sec * 30)
        
        npx_cmd = "npx.cmd" if os.name == "nt" else "npx"
        cmd = [
            npx_cmd, "remotion", "render",
            "src/index.ts",
            "SubtitleOverlay",
            local_subbed,
            f"--props={props_path}",
            f"--frames={frames}"
        ]
        
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Running Remotion Render: {' '.join(cmd)}")
        
        import subprocess
        result = subprocess.run(cmd, cwd=render_engine_path, capture_output=True, text=True)
        if result.returncode != 0:
            logger.error(f"Remotion error: {result.stderr}")
            raise HTTPException(status_code=500, detail=f"Remotion render failed: {result.stderr[-200:] if result.stderr else 'Unknown Error'}")
            
        # 5. Upload Subbed Video to Supabase Storage
        subbed_storage_path = f"{current_user['id']}/{clip_id}_subbed.mp4"
        
        # Upload using the exact string path to avoid storage3 async I/O crashes
        supabase_client.storage.from_("clips").upload(
            path=subbed_storage_path,
            file=local_subbed,
            file_options={"content-type": "video/mp4", "x-upsert": "true"}
        )
        
        # 6. Return the new Public URL
        import time
        final_url_res = supabase_client.storage.from_("clips").get_public_url(subbed_storage_path)
        final_url_res = f"{final_url_res}?t={int(time.time())}"
        
        # Clean up temp files
        try:
            os.remove(local_raw)
            os.remove(props_path)
            os.remove(local_subbed)
        except:
            pass

        return {
            "message": "Render completed successfully",
            "clip_id": clip_id,
            "status": "ready",
            "url": final_url_res
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        with open("error_log.txt", "w") as f:
            f.write(traceback.format_exc())
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Rendering pipeline execution failed: {str(e)}"
        )
