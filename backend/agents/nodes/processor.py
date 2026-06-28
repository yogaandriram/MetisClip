import os
import uuid
import logging
import subprocess
from typing import Dict, Any, List
from supabase import create_client, Client
from backend.core.config import settings
from backend.agents.state import PipelineState
from backend.agents.tools.ffmpeg_ops import crop_local_segment

logger = logging.getLogger(__name__)

def ensure_uuid(val: str) -> str:
    if not val:
        return str(uuid.uuid4())
    try:
        uuid.UUID(val)
        return val
    except ValueError:
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, val))

def generate_mock_word_level_subtitles(hook_text: str, duration: float) -> List[Dict[str, Any]]:
    """
    Generates word-level timestamps from the hook text to act as sandbox data.
    """
    words = hook_text.split()
    if not words:
        words = ["Here's", "what", "nobody", "tells", "you", "about", "AI"]
        
    num_words = len(words)
    time_per_word = min(0.5, duration / max(1, num_words))
    
    words_data = []
    current_time = 0.0
    
    for i, word in enumerate(words):
        clean_word = word.strip(".,!?\"'")
        words_data.append({
            "word": clean_word,
            "start": round(current_time, 2),
            "end": round(current_time + time_per_word, 2),
            "confidence": 0.99
        })
        current_time += time_per_word + 0.05
        
    return words_data

def run_processor_agent(state: PipelineState) -> Dict[str, Any]:
    """
    Processor Agent (Stream Processing): 
    Downloads segments, crops them vertically, generates dynamic subtitles via Whisper,
    uploads everything, and saves to the Database as a fully 'ready' clip in a single loop per segment.
    """
    logger.info("=" * 60)
    logger.info(f"🚀 [START] PROCESSOR AGENT (Job: {state.get('job_id')})")
    logger.info("=" * 60)
    
    viral_segments = state.get("viral_segments", [])
    user_id = state.get("user_id")
    job_id = state.get("job_id")
    
    if not viral_segments:
        error_msg = "No viral segments found to extract."
        logger.error(error_msg)
        return {
            "errors": state.get("errors", []) + [error_msg],
            "current_step": "processing",
            "progress_pct": 80.0
        }

    # Initialize Supabase client
    supabase: Client | None = None
    try:
        supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        has_supabase = True
    except Exception as e:
        logger.warning(f"Could not connect to Supabase: {str(e)}")
        has_supabase = False

    # Fetch user's custom Groq API Key and Agent ID
    groq_api_key = None
    agent_id = None
    if supabase is not None and user_id:
        try:
            agent_res = supabase.table("super_agents").select("id, groq_api_key").eq("user_id", user_id).execute()
            if agent_res.data:
                groq_api_key = agent_res.data[0].get("groq_api_key")
                agent_id = agent_res.data[0].get("id")
        except Exception as e:
            logger.warning(f"Failed to fetch user's agent info: {e}")

    has_groq = bool(groq_api_key and groq_api_key != "your_groq_api_key")

    # Fetch Brand Template settings for the agent
    brand_template_settings = None
    if supabase is not None and agent_id:
        try:
            bt_res = supabase.table("brand_templates").select("caption_settings").eq("agent_id", agent_id).execute()
            if bt_res.data and bt_res.data[0].get("caption_settings"):
                brand_template_settings = bt_res.data[0].get("caption_settings")
        except Exception as e:
            logger.warning(f"Failed to fetch brand templates: {e}")


    processed_clips = []
    video_types = state.get("video_types", ["talking_head"])
    video_type = video_types[0] if video_types else "talking_head"

    import concurrent.futures

    youtube_id = viral_segments[0].get("youtube_id")
    if not youtube_id:
        error_msg = "No youtube_id found in segments."
        logger.error(error_msg)
        return {"errors": state.get("errors", []) + [error_msg], "current_step": "processing", "progress_pct": 80.0}

    def process_single_clip(i, segment):
        clip_uuid = str(uuid.uuid4())
        logger.info(f"Processing clip {i+1}/{len(viral_segments)} (ID: {clip_uuid})")
        
        # --- 1. CLIP & CROP ---
        local_video = os.path.join(settings.TEMP_DIR, f"{clip_uuid}.mp4").replace("\\", "/")
        local_thumb = os.path.join(settings.TEMP_DIR, f"{clip_uuid}.png").replace("\\", "/")
        
        success = crop_local_segment(
            youtube_id=youtube_id,
            start_time=segment["start_time"],
            end_time=segment["end_time"],
            output_path=local_video,
            thumbnail_path=local_thumb,
            video_type=video_type
        )
        
        if not success:
            logger.error(f"❌ [GAGAL] Sistem gagal memotong klip {i+1} (Mulai: {segment['start_time']}s - Selesai: {segment['end_time']}s). Silakan cek log FFmpeg di atas untuk detail error.")
            return None
            
        logger.info(f"✅ [SUKSES] Sistem berhasil memotong dan merender klip {i+1} (ID: {clip_uuid})")

        # --- 2. UPLOAD TO STORAGE ---
        video_storage_path = f"{user_id}/{clip_uuid}.mp4"
        thumb_storage_path = f"{user_id}/{clip_uuid}.png"
        uploaded_video_url = None
        uploaded_thumb_url = None
        
        if supabase is not None:
            import time
            from backend.core.storage import upload_to_r2
            
            # Robust uploader with retry logic
            def upload_with_retry(local_path, storage_path, content_type, max_retries=3):
                for attempt in range(max_retries):
                    try:
                        # upload_to_r2 internally uses boto3 which is thread-safe
                        public_url = upload_to_r2(local_path, storage_path, content_type)
                        if public_url:
                            return public_url
                        else:
                            raise Exception("upload_to_r2 returned None")
                    except Exception as e:
                        if attempt == max_retries - 1:
                            logger.error(f"Failed to upload {local_path} after {max_retries} attempts. Error: {str(e)}")
                            return None
                        logger.warning(f"Upload failed for {local_path}. Retrying in {2 ** attempt}s... ({str(e)})")
                        time.sleep(2 ** attempt)
                return None

            uploaded_video_url = upload_with_retry(local_video, video_storage_path, "video/mp4")
            uploaded_thumb_url = upload_with_retry(local_thumb, thumb_storage_path, "image/png")
            
            if not uploaded_video_url or not uploaded_thumb_url:
                logger.warning("One or more assets failed to upload. The UI may fallback to local placeholders.")

        # --- 3. SUBTITLE GENERATION (WHISPER) ---
        hook_text = segment.get("hook_text", "Here's what nobody tells you about AI right now.")
        duration = segment.get("duration_seconds", 45.0)
        words_timestamps = []

        if has_groq and supabase is not None and uploaded_video_url:
            try:
                from groq import Groq
                
                logger.info("Extracting audio and calling Whisper transcription API...")
                
                # Use R2 public URL directly for transcription processing
                video_url = uploaded_video_url
                
                os.makedirs(settings.TEMP_DIR, exist_ok=True)
                temp_audio = os.path.join(settings.TEMP_DIR, f"temp_{clip_uuid}_audio.mp3")
                ffmpeg_cmd = [
                    settings.FFMPEG_PATH, "-y", "-i", video_url,
                    "-vn", "-acodec", "libmp3lame", "-q:a", "2", temp_audio
                ]
                subprocess.run(ffmpeg_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                
                client = Groq(api_key=groq_api_key)
                with open(temp_audio, "rb") as f:
                    transcription = client.audio.transcriptions.create(
                        file=(os.path.basename(temp_audio), f.read()),
                        model=settings.WHISPER_MODEL,
                        response_format="verbose_json",
                        timestamp_granularities=["word", "segment"],
                    )
                
                if os.path.exists(temp_audio):
                    os.remove(temp_audio)
                
                if hasattr(transcription, "model_dump") and callable(getattr(transcription, "model_dump")):
                    trans_data = getattr(transcription, "model_dump")()
                else:
                    trans_data = transcription
                    
                if isinstance(trans_data, str):
                    import json
                    trans_data = json.loads(trans_data)
                
                if isinstance(trans_data, dict) and "words" in trans_data and trans_data["words"]:
                    words_timestamps = trans_data["words"]
                elif isinstance(trans_data, dict) and "segments" in trans_data and trans_data["segments"]:
                    for seg in trans_data["segments"]:
                        seg_start = seg.get("start", 0.0)
                        seg_end = seg.get("end", seg_start + 1.0)
                        seg_text = seg.get("text", "").strip()
                        seg_words = seg_text.split()
                        
                        if not seg_words: continue
                            
                        time_per_word = (seg_end - seg_start) / len(seg_words)
                        current_t = seg_start
                        
                        for w in seg_words:
                            words_timestamps.append({
                                "word": w, "start": round(current_t, 2), "end": round(current_t + time_per_word, 2), "confidence": 0.99
                            })
                            current_t += time_per_word
                else:
                    raw_text = getattr(transcription, "text", hook_text) if not isinstance(trans_data, dict) else trans_data.get("text", hook_text)
                    words_timestamps = generate_mock_word_level_subtitles(str(raw_text), duration)
                
                logger.info(f"Generated {len(words_timestamps)} word timestamps via Whisper")
            except Exception as e:
                logger.error(f"Whisper STT failed: {str(e)}. Generating mock subtitles.")
                words_timestamps = generate_mock_word_level_subtitles(hook_text, duration)
        else:
            words_timestamps = generate_mock_word_level_subtitles(hook_text, duration)

        # Style config
        # We save an empty dict so the clip dynamically inherits from brand_templates 
        # unless explicitly overridden in the editor.
        default_style = {}

        subtitle_payload = {
            "clip_id": clip_uuid,
            "words": words_timestamps
        }

        # --- 4. INSERT TO DATABASE ---
        clip_data = {
            "id": clip_uuid,
            "source_video_id": segment.get("source_video_id"),
            "user_id": ensure_uuid(user_id),
            "start_time": segment["start_time"],
            "end_time": segment["end_time"],
            "duration_seconds": segment["duration_seconds"],
            "viral_score": segment["viral_score"],
            "hook_text": segment["hook_text"],
            "tags": segment["tags"],
            "rationale": segment["rationale"],
            "storage_path": uploaded_video_url if uploaded_video_url else local_video,
            "thumbnail_path": uploaded_thumb_url if uploaded_thumb_url else local_thumb,
            "subtitle_data": subtitle_payload,
            "subtitle_style": default_style,
            "status": "ready" # Instantly ready!
        }
        
        if supabase is not None:
            try:
                res = supabase.table("clips").insert(clip_data).execute()
                if res.data:
                    clip_data = res.data[0]
            except Exception as e:
                logger.error(f"Failed to save fully processed clip record to DB: {str(e)}")

        processed_clips.append(clip_data)

        if supabase is not None and job_id:
            try:
                supabase.table("discovery_jobs").update({"processed_scenes": len(processed_clips)}).eq("id", job_id).execute()
            except Exception as e:
                logger.warning(f"Failed to update processed_scenes in discovery_jobs: {str(e)}")

        # Clean up local video files now that everything is done and uploaded
        if uploaded_video_url and os.path.exists(local_video):
            os.remove(local_video)
        if uploaded_thumb_url and os.path.exists(local_thumb):
            os.remove(local_thumb)
            
        return clip_data

    # Use ThreadPoolExecutor to run up to MAX_CONCURRENT_JOBS in parallel
    max_workers = min(len(viral_segments), getattr(settings, "MAX_CONCURRENT_JOBS", 3))
    logger.info(f"Starting parallel processing with {max_workers} workers...")
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = []
        for i, segment in enumerate(viral_segments):
            futures.append(executor.submit(process_single_clip, i, segment))
            
        for future in concurrent.futures.as_completed(futures):
            try:
                future.result()
            except Exception as exc:
                logger.error(f"Clip processing generated an exception: {exc}")
                
    # CLEANUP PHASE: Temporary clip files are already removed inside crop_local_segment

    logger.info(f"Processor Agent completed. Fully processed {len(processed_clips)} vertical clips with subtitles.")
    logger.info("=" * 60)
    logger.info(f"✅ [END] PROCESSOR AGENT (Job: {job_id})")
    logger.info("=" * 60)
    
    return {
        "processed_clips": processed_clips,
        "subtitled_clips": processed_clips, # Both are identical now
        "current_step": "processing",
        "progress_pct": 80.0
    }
