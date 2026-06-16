import logging
from typing import Dict, Any, List, Optional
from mcp.server.fastmcp import FastMCP
from backend.agents.nodes.discovery import run_discovery_agent
from backend.agents.nodes.analyzer import run_analyzer_agent
from backend.agents.nodes.processor import run_processor_agent
from backend.agents.nodes.scheduler_ai import run_scheduler_ai_agent
from backend.agents.state import PipelineState

# Configure basic logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("MetisClip_MCP")

# Initialize the MCP Server
mcp = FastMCP("MetisClip")

JOB_MEMORY: Dict[str, Dict[str, Any]] = {}

@mcp.tool()
def discover_videos(job_id: str, user_id: str, keywords: List[str], youtube_url: Optional[str] = None, video_types: Optional[List[str]] = None) -> str:
    """
    Search and discover YouTube videos based on keywords or a direct URL.
    Call this first to gather raw video data before analyzing.
    """
    logger.info("Agent decided to discover videos...")
    state = PipelineState(
        job_id=job_id, user_id=user_id, keywords=keywords, youtube_url=youtube_url, video_types=video_types or ["podcast"],
        clip_duration="45-60", max_clips=3, source_videos=[], viral_segments=[], processed_clips=[], subtitled_clips=[], scheduled_posts=[],
        current_step="discovery", errors=[], progress_pct=0.0, messages=[]
    )
    result = run_discovery_agent(state)
    
    if job_id not in JOB_MEMORY:
        JOB_MEMORY[job_id] = {}
    JOB_MEMORY[job_id]["source_videos"] = result.get("source_videos", [])
    
    return f"Successfully discovered {len(JOB_MEMORY[job_id]['source_videos'])} videos. Proceed to analyze_and_clip."

@mcp.tool()
def analyze_and_clip(job_id: str, user_id: str, clip_duration: str = "45-60", max_clips: int = 3) -> str:
    """
    Analyze transcripts of discovered videos to find highly viral segments.
    Call this ONLY after discovering videos.
    """
    logger.info("Agent decided to analyze and clip videos...")
    source_videos = JOB_MEMORY.get(job_id, {}).get("source_videos", [])
    if not source_videos:
        return "Error: No source videos found in memory. You must run discover_videos first."
        
    state = PipelineState(
        job_id=job_id, user_id=user_id, keywords=[], youtube_url=None, video_types=[],
        clip_duration=clip_duration, max_clips=max_clips, source_videos=source_videos, viral_segments=[], processed_clips=[], subtitled_clips=[], scheduled_posts=[],
        current_step="analysis", errors=[], progress_pct=20.0, messages=[]
    )
    result = run_analyzer_agent(state)
    
    JOB_MEMORY[job_id]["viral_segments"] = result.get("viral_segments", [])
    return f"Successfully extracted {len(JOB_MEMORY[job_id]['viral_segments'])} viral segments. Proceed to process_and_render."

@mcp.tool()
def process_and_render(job_id: str, user_id: str) -> str:
    """
    Download, crop, and burn subtitles into the viral segments.
    Call this ONLY after you have analyzed the videos.
    """
    logger.info("Agent decided to process and render clips...")
    source_videos = JOB_MEMORY.get(job_id, {}).get("source_videos", [])
    viral_segments = JOB_MEMORY.get(job_id, {}).get("viral_segments", [])
    if not viral_segments:
        return "Error: No viral segments found in memory. You must run analyze_and_clip first."
        
    state = PipelineState(
        job_id=job_id, user_id=user_id, keywords=[], youtube_url=None, video_types=[],
        clip_duration="45-60", max_clips=3, source_videos=source_videos, viral_segments=viral_segments, processed_clips=[], subtitled_clips=[], scheduled_posts=[],
        current_step="processing", errors=[], progress_pct=40.0, messages=[]
    )
    result = run_processor_agent(state)
    
    JOB_MEMORY[job_id]["processed_clips"] = result.get("processed_clips", [])
    JOB_MEMORY[job_id]["subtitled_clips"] = result.get("subtitled_clips", [])
    return f"Successfully processed {len(JOB_MEMORY[job_id]['subtitled_clips'])} clips. Proceed to schedule_posts."

@mcp.tool()
def schedule_posts(job_id: str) -> str:
    """
    Schedule the rendered clips for posting to social media.
    Call this as the final step after processing is complete.
    """
    logger.info("Agent decided to schedule posts...")
    subtitled_clips = JOB_MEMORY.get(job_id, {}).get("subtitled_clips", [])
    if not subtitled_clips:
        return "Error: No subtitled clips found. You must run process_and_render first."
        
    state = PipelineState(
        job_id=job_id, user_id="system", keywords=[], youtube_url=None, video_types=[],
        clip_duration="45-60", max_clips=3, source_videos=[], viral_segments=[], processed_clips=[], subtitled_clips=subtitled_clips, scheduled_posts=[],
        current_step="scheduling", errors=[], progress_pct=80.0, messages=[]
    )
    result = run_scheduler_ai_agent(state)
    
    JOB_MEMORY[job_id]["scheduled_posts"] = result.get("scheduled_posts", [])
    
    # Cleanup memory after successful pipeline completion
    if job_id in JOB_MEMORY:
        del JOB_MEMORY[job_id]
        
    return f"Successfully scheduled posts. Pipeline finished."

if __name__ == "__main__":
    logger.info("Starting MetisClip MCP Server...")
    mcp.run(transport='stdio')
