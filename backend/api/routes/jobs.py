from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from supabase import Client
from backend.api.deps import get_current_user, get_supabase_client, get_user_supabase_client
from backend.agents.graph import execute_autoclip_pipeline

router = APIRouter(prefix="/api/jobs", tags=["Jobs"])

class JobCreate(BaseModel):
    keywords: Optional[List[str]] = Field(default=[], description="Keywords to search YouTube for")
    youtube_url: Optional[str] = Field(default=None, description="Direct YouTube URL to process")
    video_types: List[str] = Field(default=["podcast"], description="Types of video (podcast, interview, speech, etc)")
    clip_duration: str = Field(default="45-60", description="Clip duration range (30-45, 45-60, 60-75, 75-90)")
    max_clips: int = Field(default=3, ge=0, le=100, description="Max clips to extract per video")

def run_pipeline_task(
    job_id: str,
    user_id: str,
    keywords: List[str],
    youtube_url: str,
    video_types: List[str],
    clip_duration: str,
    max_clips: int
):
    """
    Background Task to run the LangGraph pipeline asynchronously.
    """
    try:
        execute_autoclip_pipeline(
            job_id=job_id,
            user_id=user_id,
            keywords=keywords,
            youtube_url=youtube_url,
            video_types=video_types,
            clip_duration=clip_duration,
            max_clips=max_clips
        )
    except Exception as e:
        # In production, we'd log this to an error tracker (e.g. Sentry)
        # And update the job status to 'failed' in the database
        print(f"Background Pipeline Task Failed for job {job_id}: {str(e)}")
        try:
            supabase = get_supabase_client()
            supabase.table("discovery_jobs").update({"status": "failed"}).eq("id", job_id).execute()
        except Exception:
            pass

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_job(
    payload: JobCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    supabase_client: Client = Depends(get_supabase_client)
):
    """
    Creates a new discovery job configuration in Supabase and triggers the
    LangGraph agentic pipeline asynchronously as a background task.
    """
    user_id = current_user["id"]

    try:
        # 1. Save Job Configuration to Database (applying RLS since we use user client)
        job_res = supabase_client.table("discovery_jobs").insert({
            "user_id": user_id,
            "keywords": payload.keywords,
            "youtube_url": payload.youtube_url,
            "video_types": payload.video_types,
            "clip_duration": payload.clip_duration,
            "max_clips_per_video": payload.max_clips,
            "status": "pending"
        }).execute()
        
        if not job_res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to register job in database."
            )
            
        job_data = job_res.data[0]
        job_id = job_data["id"]

        # 2. Trigger the LangGraph Agentic Pipeline in the background
        background_tasks.add_task(
            run_pipeline_task,
            job_id=job_id,
            user_id=user_id,
            keywords=payload.keywords,
            youtube_url=payload.youtube_url,
            video_types=payload.video_types,
            clip_duration=payload.clip_duration,
            max_clips=payload.max_clips
        )

        return {
            "message": "MetisClip Agentic Pipeline started successfully",
            "job": job_data
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred while creating discovery job: {str(e)}"
        )

@router.get("")
def list_jobs(
    current_user: dict = Depends(get_current_user),
    supabase_client: Client = Depends(get_user_supabase_client)
):
    """
    Lists all jobs registered by the authenticated user.
    """
    try:
        res = supabase_client.table("discovery_jobs").select("*").order("created_at", desc=True).execute()
        return {"jobs": res.data}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch jobs: {str(e)}"
        )
