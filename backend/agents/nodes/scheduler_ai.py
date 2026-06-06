import logging
from datetime import datetime, timedelta
import pytz
from typing import Dict, Any, List
from supabase import create_client, Client
from backend.core.config import settings
from backend.agents.state import PipelineState

logger = logging.getLogger(__name__)

def determine_optimal_posting_time(timezone_str: str, index: int) -> datetime:
    """
    Simulates AI analytics to find the optimal posting window.
    Usually, peak traffic is late afternoon / early evening (5:00 PM to 8:00 PM).
    We distribute scheduled clips across peak windows starting tomorrow.
    """
    tz = pytz.timezone(timezone_str)
    now_tz = datetime.now(tz)
    
    # Schedule starting tomorrow
    target_date = now_tz + timedelta(days=1 + (index // 2)) # 2 posts per day max
    
    # Peak slots: slot 0 is 17:30 (5:30 PM), slot 1 is 19:45 (7:45 PM)
    if index % 2 == 0:
        posting_time = target_date.replace(hour=17, minute=30, second=0, microsecond=0)
    else:
        posting_time = target_date.replace(hour=19, minute=45, second=0, microsecond=0)
        
    return posting_time

def run_scheduler_ai_agent(state: PipelineState) -> Dict[str, Any]:
    """
    Scheduler AI Agent: Analyzes post content, determines the optimal posting times
    by checking timezone and traffic peaks, generates high-converting titles/descriptions,
    and registers scheduled uploads in the database.
    """
    logger.info("=" * 60)
    logger.info(f"🚀 [START] SCHEDULER AI AGENT (Job: {state.get('job_id')})")
    logger.info("=" * 60)
    
    subtitled_clips = state.get("subtitled_clips", [])
    user_id = state.get("user_id")
    job_id = state.get("job_id")
    
    if not subtitled_clips:
        error_msg = "No subtitled clips found to schedule."
        logger.error(error_msg)
        return {
            "errors": state.get("errors", []) + [error_msg],
            "current_step": "scheduling",
            "progress_pct": 100.0
        }

    # Initialize Supabase client
    try:
        supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        has_supabase = True
    except Exception as e:
        logger.warning(f"Could not connect to Supabase: {str(e)}")
        has_supabase = False
        supabase = None

    scheduled_posts = []
    default_timezone = "Asia/Jakarta"

    for i, clip in enumerate(subtitled_clips):
        clip_id = clip.get("id")
        tags = clip.get("tags", ["AI", "future"])
        hook_text = clip.get("hook_text", "")
        viral_score = clip.get("viral_score", 90)
        
        logger.info(f"AI Scheduling analysis for clip {i+1}/{len(subtitled_clips)} (ID: {clip_id})")

        # Determine optimal time
        scheduled_time = determine_optimal_posting_time(default_timezone, i)

        # AI Title & Description generation (optimized for high click-through-rate on Shorts)
        raw_title = hook_text[:50].strip(".,!?\"'") + " 🚀"
        title = f"THE TRUTH ABOUT AI... #shorts" if "controversial" in tags else f"{raw_title} #ai #tech"
        
        description = (
            f"This 45-second clip reveals a shocking insight. {clip.get('rationale', '')}\n\n"
            "What are your thoughts on this? Comment down below!\n\n"
            "Subscribe for daily cutting-edge AI discussions."
        )

        post_data = {
            "clip_id": clip_id,
            "user_id": user_id,
            "platform": "youtube_shorts",
            "scheduled_at": scheduled_time.isoformat(),
            "timezone": default_timezone,
            "title": title,
            "description": description,
            "tags": tags + ["shorts", "ytshorts", "autoclip"],
            "status": "scheduled"
        }

        if has_supabase and clip_id:
            try:
                res = supabase.table("scheduled_posts").insert(post_data).execute()
                if res.data:
                    post_data = res.data[0]
                    logger.info(f"Scheduled post saved to DB at {scheduled_time} for clip {clip_id}")
            except Exception as e:
                logger.error(f"Failed to insert scheduled post to DB: {str(e)}")

        scheduled_posts.append(post_data)

    # Finally update the Discovery Job status to 'completed'
    if has_supabase and job_id:
        try:
            supabase.table("discovery_jobs").update({"status": "completed"}).eq("id", job_id).execute()
            logger.info(f"Job {job_id} marked as fully completed.")
        except Exception as e:
            logger.warning(f"Could not update final job status: {str(e)}")

    logger.info(f"Scheduler AI Agent completed. Scheduled {len(scheduled_posts)} posts.")
    logger.info("=" * 60)
    logger.info(f"✅ [END] SCHEDULER AI AGENT (Job: {job_id})")
    logger.info("=" * 60)
    
    return {
        "scheduled_posts": scheduled_posts,
        "current_step": "scheduling",
        "progress_pct": 100.0
    }
