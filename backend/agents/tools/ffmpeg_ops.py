import os
import sys
import subprocess
import logging
from typing import Dict, Any, Optional, List
import glob
from backend.core.config import settings

logger = logging.getLogger(__name__)

def crop_local_segment(
    youtube_id: str, 
    start_time: float, 
    end_time: float, 
    output_path: str,
    thumbnail_path: str,
    video_type: str = "talking_head"
) -> bool:
    """
    Downloads a specific segment from YouTube using yt-dlp and crops it to vertical 9:16 aspect ratio.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    os.makedirs(os.path.dirname(thumbnail_path), exist_ok=True)
    
    try:
        import uuid
        import shutil
        temp_cut = os.path.join(settings.TEMP_DIR, f"temp_cut_{uuid.uuid4().hex[:8]}.mp4")
        
        yt_dlp_path = shutil.which("yt-dlp")
        if not yt_dlp_path:
            yt_dlp_cmd = [sys.executable, "-m", "yt_dlp"]
        else:
            yt_dlp_cmd = [yt_dlp_path]
            
        logger.info(f"Downloading and cutting segment {start_time}-{end_time} directly from YouTube...")
        format_str = "bv*[ext=mp4][height<=1080]+ba[ext=m4a]/b[ext=mp4][height<=1080] / bv*+ba/b"
        
        section_arg = f"*{start_time}-{end_time}"
        
        cut_cmd = yt_dlp_cmd + [
            "--ffmpeg-location", settings.FFMPEG_PATH,
            "--socket-timeout", "30",
            "--retries", "3",
            "--force-overwrites",
            "-f", format_str,
            "--download-sections", section_arg,
            "--merge-output-format", "mp4",
            f"https://www.youtube.com/watch?v={youtube_id}",
            "-o", temp_cut
        ]
        
        subprocess.run(cut_cmd, check=True, capture_output=True)
        
        if not os.path.exists(temp_cut):
            logger.error(f"Failed to download segment to {temp_cut}")
            return False
        
        logger.info(f"Scanning {temp_cut} for Smart Auto Tracking (Face Detection)...")
        from backend.agents.tools.smart_crop import process_auto_tracking_video
        
        temp_tracked = temp_cut.replace(".mp4", "_tracked.mp4")
        
        # This will create a perfectly tracked 9:16 video stream without audio
        tracking_success = process_auto_tracking_video(temp_cut, temp_tracked)
        
        if not tracking_success or not os.path.exists(temp_tracked):
            raise Exception("Dynamic Smart Auto Tracking failed to produce a valid video stream.")
            
        logger.info(f"Merging tracked video stream with original audio to {output_path}...")
        
        ffmpeg_cmd = [
            settings.FFMPEG_PATH,
            "-y",
            "-err_detect", "ignore_err",
            "-i", temp_tracked,      # Video stream
            "-i", temp_cut,          # Audio stream
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
        
        # Generate Thumbnail from middle of the clip
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

        # Clean up temporary files
        if os.path.exists(temp_cut):
            try: os.remove(temp_cut)
            except: pass
        if os.path.exists(temp_tracked):
            try: os.remove(temp_tracked)
            except: pass
            
        logger.info(f"Successfully processed and vertical cropped segment to {output_path}")
        return True

    except subprocess.CalledProcessError as e:
        stderr_output = e.stderr.decode('utf-8', errors='ignore') if e.stderr else 'No stderr output'
        logger.error(f"❌ [FFMPEG ERROR] Terjadi kesalahan saat memotong segmen {start_time}-{end_time}.\nCommand: {e.cmd}\nExit Code: {e.returncode}\nDetailed FFmpeg Log:\n{stderr_output}")
        if os.path.exists(output_path):
            try: os.remove(output_path)
            except: pass
        if os.path.exists(thumbnail_path):
            try: os.remove(thumbnail_path)
            except: pass
        return False
    except Exception as e:
        logger.error(f"❌ [SYSTEM ERROR] Kesalahan sistem tidak terduga saat memotong segmen {start_time}-{end_time}: {str(e)}")
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

