import logging
from backend.core.storage import delete_from_r2

logger = logging.getLogger(__name__)

def enforce_clip_limit(user_id: str, supabase_client, limit: int = 50):
    """
    Enforces a maximum number of clips per user.
    If the user has more than 'limit' clips, the oldest clips are deleted 
    from both Cloudflare R2 storage and the Supabase database.
    """
    try:
        # Fetch all clips for the user, ordered by newest first
        res = supabase_client.table("clips") \
            .select("id, storage_path, thumbnail_path") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .execute()
            
        clips = res.data
        if not clips:
            return
            
        if len(clips) > limit:
            logger.info(f"User {user_id} has {len(clips)} clips. Enforcing limit of {limit}...")
            
            # The clips are ordered newest first, so anything after index `limit-1` is excess
            excess_clips = clips[limit:]
            
            for clip in excess_clips:
                clip_id = clip.get("id")
                video_url = clip.get("storage_path")
                thumb_url = clip.get("thumbnail_path")
                
                logger.info(f"Deleting excess clip {clip_id}...")
                
                # 1. Delete physical files from R2
                if video_url:
                    delete_from_r2(video_url)
                if thumb_url:
                    delete_from_r2(thumb_url)
                    
                # 2. Delete database record
                supabase_client.table("clips").delete().eq("id", clip_id).execute()
                
            logger.info(f"Successfully cleaned up {len(excess_clips)} excess clips.")
            
    except Exception as e:
        logger.error(f"Failed to enforce clip limit for user {user_id}: {str(e)}")
