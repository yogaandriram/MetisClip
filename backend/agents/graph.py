import logging
from typing import Dict, Any, List
from langgraph.graph import StateGraph, START, END
from backend.agents.state import PipelineState
from backend.agents.nodes.discovery import run_discovery_agent
from backend.agents.nodes.analyzer import run_analyzer_agent
from backend.agents.nodes.processor import run_processor_agent
from backend.agents.nodes.scheduler_ai import run_scheduler_ai_agent

logger = logging.getLogger(__name__)

def build_workflow_graph() -> StateGraph:
    """
    Builds and compiles the master LangGraph workflow for MetisClip.
    """
    workflow = StateGraph(PipelineState)

    # 1. Register all nodes
    workflow.add_node("discovery", run_discovery_agent)
    workflow.add_node("analyzer", run_analyzer_agent)
    workflow.add_node("processor", run_processor_agent)
    workflow.add_node("scheduler", run_scheduler_ai_agent)

    # 2. Add edges (Start -> discovery -> analyzer -> processor -> scheduler -> End)
    workflow.add_edge(START, "discovery")
    workflow.add_edge("discovery", "analyzer")
    workflow.add_edge("analyzer", "processor")
    workflow.add_edge("processor", "scheduler")
    workflow.add_edge("scheduler", END)

    # Compile workflow
    return workflow.compile()

def execute_autoclip_pipeline(
    job_id: str,
    user_id: str,
    keywords: List[str],
    youtube_url: str = None,
    video_types: List[str] = None,
    clip_duration: str = "45-60",
    max_clips: int = 3
) -> Dict[str, Any]:
    """
    Synchronous execution wrapper for the agentic pipeline.
    Suitable to be run inside background workers (Celery, Redis queue, or FastAPI BackgroundTasks).
    """
    if video_types is None:
        video_types = ["podcast"]
        
    initial_state = PipelineState(
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
        current_step="initialization",
        errors=[],
        progress_pct=0.0
    )

    logger.info(f"Triggering AutoClip Agentic Pipeline for Job ID: {job_id}")
    graph = build_workflow_graph()
    
    # Run the compiled LangGraph workflow state machine
    final_state = graph.invoke(initial_state)
    logger.info(f"AutoClip Agentic Pipeline completed for Job ID: {job_id}")
    
    return final_state
