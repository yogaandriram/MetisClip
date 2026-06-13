import os
import sys
import subprocess
import logging
from typing import Dict, Any, Optional, List
import glob
from backend.core.config import settings

logger = logging.getLogger(__name__)

def download_and_crop_segment(
    youtube_id: str, 
    start_time: float, 
    end_time: float, 
    output_path: str,
    thumbnail_path: str,
    video_type: str = "talking_head"
) -> bool:
    """
    Downloads a specific segment range of a YouTube video using yt-dlp,
    then uses FFmpeg to crop it to vertical 9:16 (1080x1920) aspect ratio.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    os.makedirs(os.path.dirname(thumbnail_path), exist_ok=True)
    
    # Check if yt-dlp and FFmpeg are available
    # If not, generate a mockup empty/placeholder video file for development
    yt_dlp_cmd: List[str] = []
    try:
        import shutil
        yt_dlp_path = shutil.which("yt-dlp")
        if not yt_dlp_path:
            yt_dlp_cmd = [sys.executable, "-m", "yt_dlp"]
        else:
            yt_dlp_cmd = [yt_dlp_path]
            
        # Check yt-dlp
        subprocess.run(yt_dlp_cmd + ["--version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        # Check ffmpeg
        subprocess.run([settings.FFMPEG_PATH, "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        has_tools = True
    except Exception as e:
        logger.warning(f"yt-dlp or FFmpeg is not installed/reachable. Error: {e}. Generating mock placeholder media assets.")
        has_tools = False

    if not has_tools:
        logger.error("Required tools (yt-dlp or FFmpeg) are missing. Cannot process video.")
        return False

    # Real implementation using yt-dlp + ffmpeg
    try:
        import uuid
        unique_id = uuid.uuid4().hex[:8]
        temp_download = os.path.join(settings.TEMP_DIR, f"temp_{youtube_id}_{start_time}_{unique_id}_raw.mp4")
        downloaded_full_video = False
        
        # Download exact segment using yt-dlp (efficient range download)
        logger.info(f"Downloading YouTube segment: {youtube_id} ({start_time}s to {end_time}s)")
        
        # Build yt-dlp download command with time limits
        # We use b[ext=mp4] (pre-muxed 720p) or separate mp4/m4a to prevent DASH WebM corruption on section cuts!
        format_str = "bv*[ext=mp4][height<=1080]+ba[ext=m4a]/b[ext=mp4][height<=1080] / bv*+ba/b"
        
        download_cmd = yt_dlp_cmd + [
            "--ffmpeg-location", settings.FFMPEG_PATH,
            "--socket-timeout", "30",
            "--retries", "5",
            "--force-overwrites",
            "-f", format_str,
            "--merge-output-format", "mp4",
            "--download-sections", f"*{start_time}-{end_time}",
            "--force-keyframes-at-cuts",
            f"https://www.youtube.com/watch?v={youtube_id}",
            "-o", temp_download
        ]
        
        # We don't use check=True here because yt-dlp might fail with a non-zero exit code if the section format isn't supported
        # We use a 15-minute timeout to ensure it NEVER hangs the backend indefinitely but allows enough time for throttling.
        try:
            subprocess.run(download_cmd, timeout=900, capture_output=True)
        except subprocess.TimeoutExpired:
            logger.error("yt-dlp section download TIMED OUT after 15 minutes.")
        
        temp_raw = temp_download.replace(".mp4", "_raw.mp4")
        
        if not os.path.exists(temp_download):
            # Fallback if download section option failed (compatibility with older yt-dlp versions)
            logger.info("yt-dlp section download failed or skipped. Trying fallback download full video.")
            fallback_cmd = yt_dlp_cmd + [
                "--ffmpeg-location", settings.FFMPEG_PATH,
                "--socket-timeout", "30",
                "--retries", "5",
                "--force-overwrites",
                "-f", format_str,
                "--merge-output-format", "mp4",
                f"https://www.youtube.com/watch?v={youtube_id}",
                "-o", temp_raw
            ]
            try:
                subprocess.run(fallback_cmd, check=True, timeout=1800, capture_output=True)
                
                # PRE-CUT THE FULL VIDEO BEFORE TRACKING
                logger.info(f"Cutting the full video to extract segment {start_time}-{end_time} without re-encoding...")
                cut_cmd = [
                    settings.FFMPEG_PATH, "-y",
                    "-ss", str(start_time), "-to", str(end_time),
                    "-i", temp_raw,
                    "-c", "copy",
                    temp_download
                ]
                subprocess.run(cut_cmd, check=True, capture_output=True)
                
                # Clean up the massive raw file immediately to save disk space
                if os.path.exists(temp_raw):
                    os.remove(temp_raw)
                    
            except subprocess.TimeoutExpired:
                logger.error("yt-dlp full download TIMED OUT after 30 minutes.")
                raise Exception("yt-dlp download timed out completely.")

        logger.info(f"Scanning {temp_download} for Smart Auto Tracking (Face Detection)...")
        from backend.agents.tools.smart_crop import process_auto_tracking_video
        
        temp_tracked = temp_download.replace(".mp4", "_tracked.mp4")
        
        # This will create a perfectly tracked 9:16 video stream without audio
        tracking_success = process_auto_tracking_video(temp_download, temp_tracked)
        
        if not tracking_success or not os.path.exists(temp_tracked):
            raise Exception("Dynamic Smart Auto Tracking failed to produce a valid video stream.")
            
        logger.info(f"Merging tracked video stream with original audio to {output_path}...")
        
        ffmpeg_cmd = [
            settings.FFMPEG_PATH,
            "-y",
            "-err_detect", "ignore_err",
            "-i", temp_tracked,      # Video stream
            "-i", temp_download,     # Audio stream
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-profile:v", "high",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "128k",
            "-map", "0:v:0",         # Take video from 1st input
            "-map", "1:a:0",         # Take audio from 2nd input
            "-shortest",             # End when the shortest stream ends
            output_path
        ]
        
        subprocess.run(ffmpeg_cmd, check=True, capture_output=True)
        
        # Clean up the intermediate tracked video
        if os.path.exists(temp_tracked):
            try: os.remove(temp_tracked)
            except: pass
        
        # Generate Thumbnail from middle of the clip
        # Since the clip is already the exact length, middle time is duration / 2
        middle_time = (end_time - start_time) / 2
        thumb_cmd = [
            settings.FFMPEG_PATH,
            "-y",
            "-ss", str(middle_time),
            "-i", output_path,
            "-update", "1",
            "-vframes", "1",
            "-q:v", "2",
            thumbnail_path
        ]
        subprocess.run(thumb_cmd, check=True, capture_output=True)

        # Clean up raw download
        if os.path.exists(temp_download):
            os.remove(temp_download)
            
        logger.info(f"Successfully processed and vertical cropped {youtube_id}")
        return True

    except Exception as e:
        logger.error(f"❌ [FFMPEG ERROR] Terjadi kesalahan saat memotong segmen {start_time}-{end_time}: {str(e)}")
        if os.path.exists(output_path):
            try: os.remove(output_path)
            except: pass
        if os.path.exists(thumbnail_path):
            try: os.remove(thumbnail_path)
            except: pass
        return False

def download_and_chunk_audio(youtube_id: str, chunk_duration_sec: int = 1200) -> List[str]:
    """
    Downloads the audio track of a YouTube video and chunks it into smaller files
    (e.g., 20 mins) to bypass API size limits (like Groq's 25MB limit).
    Returns a list of local file paths for the chunks.
    """
    os.makedirs(settings.TEMP_DIR, exist_ok=True)
    temp_audio = os.path.join(settings.TEMP_DIR, f"temp_{youtube_id}_audio.m4a")
    
    # Download audio only
    logger.info(f"Downloading full audio track for {youtube_id}")
    import shutil
    yt_dlp_cmd = shutil.which("yt-dlp")
    if not yt_dlp_cmd:
        yt_dlp_cmd = [sys.executable, "-m", "yt_dlp"]
    else:
        yt_dlp_cmd = [yt_dlp_cmd]

    download_cmd = yt_dlp_cmd + [
        "--ffmpeg-location", settings.FFMPEG_PATH,
        "-f", "ba[ext=m4a]/ba", # Best audio in m4a format
        f"https://www.youtube.com/watch?v={youtube_id}",
        "-o", temp_audio
    ]
    
    try:
        subprocess.run(download_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except Exception as e:
        logger.error(f"Failed to download audio for {youtube_id}: {e}")
        return []

    if not os.path.exists(temp_audio):
        logger.error("Audio download finished but file not found.")
        return []

    # Chunk the audio using FFmpeg segmenting
    logger.info("Chunking audio into smaller segments for Whisper API...")
    chunk_pattern = os.path.join(settings.TEMP_DIR, f"temp_{youtube_id}_chunk_%03d.m4a")
    
    ffmpeg_cmd = [
        settings.FFMPEG_PATH,
        "-y",
        "-i", temp_audio,
        "-f", "segment",
        "-segment_time", str(chunk_duration_sec),
        "-c", "copy", # Copy codec to avoid re-encoding overhead
        chunk_pattern
    ]
    
    try:
        subprocess.run(ffmpeg_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        os.remove(temp_audio) # Clean up original full audio
        
        # Find all generated chunks
        chunks = sorted(glob.glob(os.path.join(settings.TEMP_DIR, f"temp_{youtube_id}_chunk_*.m4a")))
        logger.info(f"Generated {len(chunks)} audio chunks.")
        return chunks
    except Exception as e:
        logger.error(f"Failed to chunk audio: {e}")
        return []

