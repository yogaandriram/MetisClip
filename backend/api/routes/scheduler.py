from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any
from datetime import datetime
from supabase import Client
from backend.api.deps import get_current_user, get_user_supabase_client
from backend.services.youtube_upload import upload_clip_to_youtube_shorts

router = APIRouter(prefix="/api/schedule", tags=["Scheduler"])

class PostScheduleCreate(BaseModel):
    clip_id: str
    scheduled_at: str
    timezone: str = "Asia/Jakarta"
    title: str
    description: str
    tags: List[str]

@router.get("")
def list_schedules(
    current_user: dict = Depends(get_current_user),
    supabase_client: Client = Depends(get_user_supabase_client)
):
    """
    List all upcoming and published posts scheduled by the user.
    """
    try:
        res = supabase_client.table("scheduled_posts").select("*").order("scheduled_at", desc=False).execute()
        return {"scheduled_posts": res.data}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch scheduled posts: {str(e)}"
        )

@router.post("")
def schedule_post(
    payload: PostScheduleCreate,
    current_user: dict = Depends(get_current_user),
    supabase_client: Client = Depends(get_user_supabase_client)
):
    """
    Schedules a vertical clip for automated publication on YouTube Shorts.
    """
    try:
        post_data = {
            "clip_id": payload.clip_id,
            "user_id": current_user["id"],
            "platform": "youtube_shorts",
            "scheduled_at": payload.scheduled_at,
            "timezone": payload.timezone,
            "title": payload.title,
            "description": payload.description,
            "tags": payload.tags,
            "status": "scheduled"
        }
        
        res = supabase_client.table("scheduled_posts").insert(post_data).execute()
        return {
            "message": "Post successfully scheduled",
            "scheduled_post": res.data[0]
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to schedule post: {str(e)}"
        )

@router.post("/{post_id}/publish")
def publish_post_immediately(
    post_id: str,
    current_user: dict = Depends(get_current_user),
    supabase_client: Client = Depends(get_user_supabase_client)
):
    """
    Triggers immediate upload/publication to YouTube Shorts (bypassing schedule timing).
    Downloads vertical MP4 from Supabase Storage and calls upload_clip_to_youtube_shorts.
    """
    try:
        # Fetch scheduled post record
        post_res = supabase_client.table("scheduled_posts").select("*, clips(*)").eq("id", post_id).execute()
        if not post_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Scheduled post not found"
            )
            
        post = post_res.data[0]
        clip = post.get("clips")
        
        if not clip:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Associated video clip not found"
            )

        # Update status to uploading
        supabase_client.table("scheduled_posts").update({"status": "uploading"}).eq("id", post_id).execute()

        # In production, we fetch Google refresh tokens from profiles, call refresh_google_oauth_token()
        # and then call upload_clip_to_youtube_shorts().
        # Here we simulate with sandbox token
        mock_token = "mock_youtube_token_yogaandrian"
        
        yt_id = upload_clip_to_youtube_shorts(
            video_path_or_url=clip.get("storage_path"),
            title=post.get("title", "AI Shorts"),
            description=post.get("description", ""),
            tags=post.get("tags", []),
            access_token=mock_token
        )

        if not yt_id:
            supabase_client.table("scheduled_posts").update({"status": "failed"}).eq("id", post_id).execute()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="YouTube Shorts publishing failed"
            )

        # Update post status as published
        update_res = supabase_client.table("scheduled_posts").update({
            "status": "published",
            "youtube_video_id": yt_id,
            "published_at": datetime.utcnow().isoformat()
        }).eq("id", post_id).execute()

        return {
            "message": "Post successfully published to YouTube Shorts",
            "post": update_res.data[0]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Immediate publishing failed: {str(e)}"
        )
