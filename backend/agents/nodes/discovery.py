import logging
from typing import Dict, Any
from supabase import create_client, Client
from backend.core.config import settings
from backend.agents.state import PipelineState
from backend.agents.tools.youtube_api import search_youtube_videos
import re

logger = logging.getLogger(__name__)

def run_discovery_agent(state: PipelineState) -> Dict[str, Any]:
    """
    Discovery Agent: Finds long-form YouTube videos based on user-defined keywords
    and video types, scores them, and saves them to the database.
    """
    logger.info("=" * 60)
    logger.info(f"🚀 [START] DISCOVERY AGENT (Job: {state.get('job_id')})")
    logger.info("=" * 60)
    
    keywords = state.get("keywords", [])
    youtube_url = state.get("youtube_url")
    video_types = state.get("video_types", ["podcast"])
    job_id = state.get("job_id")
    user_id = state.get("user_id")
    
    if not keywords and not youtube_url:
        error_msg = "No keywords or youtube_url provided for discovery."
        logger.error(error_msg)
        return {
            "errors": state.get("errors", []) + [error_msg],
            "current_step": "discovery",
            "progress_pct": 20.0
        }

    # Initialize Supabase client
    try:
        supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        has_supabase = True
    except Exception as e:
        logger.warning(f"Failed to connect to Supabase: {str(e)}")
        supabase = None
        has_supabase = False

    # Update job status in DB
    if has_supabase:
        try:
            supabase.table("discovery_jobs").update({"status": "running"}).eq("id", job_id).execute()
        except Exception as e:
            logger.warning(f"Could not update job status: {str(e)}")

    all_found_videos = []
    
    if youtube_url:
        logger.info(f"Processing direct YouTube URL: {youtube_url}")
        
        # Extract video ID
        yt_id_match = re.search(r'(?:v=|\/)([0-9A-Za-z_-]{11}).*', youtube_url)
        yt_id = yt_id_match.group(1) if yt_id_match else "unknown_id"
        
        # In a real app, we'd fetch details for this specific video here using youtube_api.py
        # For now, we mock the metadata since we don't have the API key setup yet (per user request)
        all_found_videos.append({
            "youtube_id": yt_id,
            "title": f"Video from URL ({yt_id})",
            "channel_name": "Target Channel",
            "duration_seconds": 3600,
            "view_count": 100000,
            "like_count": 5000,
            "video_type": video_types[0] if video_types else "podcast",
            "quality_score": 85.0,
            "job_id": job_id
        })
    else:
        # Run search for each keyword-type pair
        for keyword in keywords:
            for v_type in video_types:
                logger.info(f"Searching YouTube for '{keyword}' as type '{v_type}'")
                videos = search_youtube_videos(query=keyword, max_results=3, video_type=v_type)
                
                for video in videos:
                    # Add job relation
                    video["job_id"] = job_id
                    
                    # Check for duplicates in our current run list
                    if not any(v["youtube_id"] == video["youtube_id"] for v in all_found_videos):
                        all_found_videos.append(video)

    logger.info(f"Discovered {len(all_found_videos)} potential source videos.")
    
    # Save discovered source videos to Supabase
    saved_videos = []
    for video in all_found_videos:
        try:
            if has_supabase:
                # Insert and get the newly created record containing our local database UUID
                res = supabase.table("source_videos").insert({
                    "job_id": job_id,
                    "youtube_id": video["youtube_id"],
                    "title": video["title"],
                    "channel_name": video["channel_name"],
                    "duration_seconds": video["duration_seconds"],
                    "view_count": video["view_count"],
                    "like_count": video["like_count"],
                    "video_type": video["video_type"],
                    "quality_score": video["quality_score"],
                    "status": "pending"
                }).execute()
                
                if res.data:
                    saved_videos.append(res.data[0])
            else:
                raise Exception("No Supabase connection")
                
        except Exception as e:
            logger.error(f"Error inserting video {video['youtube_id']} to DB: {str(e)}")
            # Even if DB fails, keep the in-memory video metadata with a temporary ID for local sandbox stability
            video["id"] = f"temp-uuid-{video['youtube_id']}"
            saved_videos.append(video)

    # If no videos saved, we make sure we have at least memory items for safety
    if not saved_videos:
        saved_videos = all_found_videos

    return {
        "source_videos": saved_videos,
        "current_step": "discovery",
        "progress_pct": 20.0
    }
