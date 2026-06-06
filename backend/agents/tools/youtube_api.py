import urllib.request
import urllib.parse
import json
import logging
import re
from typing import List, Dict, Any
from backend.core.config import settings

logger = logging.getLogger(__name__)

def parse_iso8601_duration(duration_str: str) -> int:
    """
    Parses an ISO 8601 duration string (e.g., PT1H2M10S) into total seconds.
    """
    pattern = re.compile(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?')
    match = pattern.match(duration_str)
    if not match:
        return 0
    hours = int(match.group(1)) if match.group(1) else 0
    minutes = int(match.group(2)) if match.group(2) else 0
    seconds = int(match.group(3)) if match.group(3) else 0
    return hours * 3600 + minutes * 60 + seconds

def search_youtube_videos(query: str, max_results: int = 5, video_type: str = "podcast") -> List[Dict[str, Any]]:
    """
    Searches YouTube for long-form videos based on keywords and filters.
    If YOUTUBE_API_KEY is missing, it returns high-quality mockup data for sandbox testing.
    """
    # Check if API Key is configured. If not, return highly detailed mock data.
    if not settings.YOUTUBE_API_KEY or settings.YOUTUBE_API_KEY == "your_youtube_api_key":
        logger.warning("YOUTUBE_API_KEY is not configured. Returning mock sandbox search results.")
        return [
            {
                "youtube_id": "jNQXAC9IVRw",
                "title": "Lex Fridman Podcast with Sam Altman: OpenAI, GPT-5, and the Future of AGI",
                "channel_name": "Lex Fridman",
                "duration_seconds": 7240,  # ~2 hours
                "view_count": 4829100,
                "like_count": 142000,
                "video_type": video_type,
                "quality_score": 95.5
            },
            {
                "youtube_id": "dQw4w9WgXcQ", # Rickroll (fallback placeholder video id)
                "title": "AI Revolution: How Agents are Transforming Software Development in 2026",
                "channel_name": "Tech Insider Podcast",
                "duration_seconds": 3650,  # ~1 hour
                "view_count": 284000,
                "like_count": 12800,
                "video_type": video_type,
                "quality_score": 82.0
            }
        ]

    try:
        # Step 1: Search for videos matching keywords and duration (long > 20 mins)
        # Search query format: query + ' ' + video_type (e.g. "AI podcast")
        search_query = f"{query} {video_type}"
        params = {
            "part": "snippet",
            "q": search_query,
            "type": "video",
            "videoDuration": "long", # > 20 minutes
            "maxResults": max_results,
            "key": settings.YOUTUBE_API_KEY
        }
        
        url = f"https://www.googleapis.com/youtube/v3/search?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        
        with urllib.request.urlopen(req) as response:
            search_data = json.loads(response.read().decode())
            
        items = search_data.get("items", [])
        if not items:
            return []
            
        video_ids = [item["id"]["videoId"] for item in items if item.get("id", {}).get("kind") == "youtube#video"]
        if not video_ids:
            return []

        # Step 2: Get detailed statistics & durations for the discovered video IDs
        details_params = {
            "part": "snippet,contentDetails,statistics",
            "id": ",".join(video_ids),
            "key": settings.YOUTUBE_API_KEY
        }
        details_url = f"https://www.googleapis.com/youtube/v3/videos?{urllib.parse.urlencode(details_params)}"
        details_req = urllib.request.Request(details_url, headers={"User-Agent": "Mozilla/5.0"})
        
        with urllib.request.urlopen(details_req) as response:
            details_data = json.loads(response.read().decode())
            
        detailed_videos = []
        for item in details_data.get("items", []):
            duration_str = item.get("contentDetails", {}).get("duration", "PT0S")
            duration_seconds = parse_iso8601_duration(duration_str)
            
            # Skip videos shorter than 30 minutes (1800 seconds) in production
            if duration_seconds < 1800:
                continue
                
            stats = item.get("statistics", {})
            views = int(stats.get("viewCount", 0))
            likes = int(stats.get("likeCount", 0))
            
            # Calculate quality score: views ratio to engagement
            quality_score = min(100.0, (likes / max(1, views)) * 1000 + min(20.0, views / 50000))
            
            detailed_videos.append({
                "youtube_id": item["id"],
                "title": item["snippet"]["title"],
                "channel_name": item["snippet"]["channelTitle"],
                "duration_seconds": duration_seconds,
                "view_count": views,
                "like_count": likes,
                "video_type": video_type,
                "quality_score": round(quality_score, 2)
            })
            
        return detailed_videos

    except Exception as e:
        logger.error(f"YouTube search error: {str(e)}")
        # Fallback to empty list or sandbox data
        return []
