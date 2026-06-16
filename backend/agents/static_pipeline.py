import logging
from typing import List, Optional, cast
from backend.agents.state import PipelineState
from backend.agents.nodes.discovery import run_discovery_agent
from backend.agents.nodes.analyzer import run_analyzer_agent
from backend.agents.nodes.processor import run_processor_agent
from backend.agents.nodes.scheduler_ai import run_scheduler_ai_agent

logger = logging.getLogger(__name__)

def execute_static_pipeline(
    job_id: str,
    user_id: str,
    keywords: List[str],
    youtube_url: Optional[str] = None,
    video_types: List[str] = ["podcast"],
    clip_duration: str = "45-60",
    max_clips: int = 3
):
    """
    Executes the video processing pipeline statically (sequentially) without
    using an autonomous LLM Agent or LangGraph. This is used when the Web UI
    "Generate" button is clicked, saving tokens by only using 9router for transcript analysis.
    """
    logger.info(f"=== STARTING STATIC PIPELINE FOR JOB {job_id} ===")
    
    # Initialize State
    state = PipelineState(
        job_id=job_id,
        user_id=user_id,
        keywords=keywords,
        youtube_url=youtube_url,
        video_types=video_types,
        clip_duration=clip_duration,
        max_clips=max_clips,
        source_videos=[],
        viral_segments=[],
        processed_clips=[],
        subtitled_clips=[],
        scheduled_posts=[],
        current_step="discovery",
        errors=[],
        progress_pct=0.0,
        messages=[]
    )
    
    try:
        # Step 1: Discovery
        logger.info("Executing Discovery Node...")
        state.update(cast(PipelineState, run_discovery_agent(state)))
        if not state.get("source_videos"):
            logger.warning("Pipeline stopped: No videos discovered.")
            return state

        # Step 2: Analysis (Uses 9Router to find viral moments)
        logger.info("Executing Analyzer Node...")
        state.update(cast(PipelineState, run_analyzer_agent(state)))
        if not state.get("viral_segments"):
            logger.warning("Pipeline stopped: No viral segments found.")
            return state

        # Step 3: Processing (Download, Crop, Subtitle)
        logger.info("Executing Processor Node...")
        state.update(cast(PipelineState, run_processor_agent(state)))
        if not state.get("subtitled_clips"):
            logger.warning("Pipeline stopped: Failed to process clips.")
            return state

        # Step 4: Scheduling
        logger.info("Executing Scheduler Node...")
        state.update(cast(PipelineState, run_scheduler_ai_agent(state)))
        
        logger.info(f"=== STATIC PIPELINE FINISHED SUCCESSFULLY FOR JOB {job_id} ===")
        return state
        
    except Exception as e:
        logger.error(f"Static pipeline failed with error: {str(e)}")
        state["errors"] = state.get("errors", []) + [str(e)]
        return state
