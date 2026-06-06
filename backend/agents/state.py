from typing import TypedDict, List, Dict, Any, Optional

class PipelineState(TypedDict):
    """
    State representing the data flowing between agents in the MetisClip pipeline.
    """
    # Core Job Configurations
    job_id: str
    user_id: str
    keywords: List[str]
    youtube_url: Optional[str]
    video_types: List[str]
    clip_duration: str  # e.g., '30-45', '45-60', '60-75', '75-90'
    max_clips: int      # maximum number of clips to generate per video

    # Pipeline Outputs
    source_videos: List[Dict[str, Any]]     # discovered youtube video objects
    viral_segments: List[Dict[str, Any]]    # identified high-potential clips with timestamps
    processed_clips: List[Dict[str, Any]]   # vertically cropped video clips saved in storage
    subtitled_clips: List[Dict[str, Any]]   # clips with Whisper generated & styled dynamic subtitles
    scheduled_posts: List[Dict[str, Any]]   # posts that have been successfully scheduled

    # Execution Metadata
    current_step: str                       # e.g., 'discovery', 'analysis', 'clipping', 'subtitling', 'scheduling'
    errors: List[str]                       # tracking pipeline errors
    progress_pct: float                     # current execution progress percentage (0.0 to 100.0)
