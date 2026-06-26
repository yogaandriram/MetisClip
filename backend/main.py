import uvicorn
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from backend.core.config import settings
import logging
from backend.api.deps import get_current_user

from backend.api.routes import jobs, clips, scheduler
from fastapi.staticfiles import StaticFiles
import os

os.makedirs(settings.TEMP_DIR, exist_ok=True)

# Set up logging so we can see the Agent logs in Uvicorn terminal AND save them to a file
logging.basicConfig(
    level=logging.INFO, # Changed from ERROR to INFO so we can see all pipeline progress
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("system_pipeline.log", encoding="utf-8"),
        logging.StreamHandler()
    ]
)

# Suppress noisy third-party loggers so only system errors are shown
logging.getLogger("uvicorn").setLevel(logging.ERROR)
logging.getLogger("uvicorn.access").setLevel(logging.ERROR)
logging.getLogger("httpx").setLevel(logging.ERROR)
logging.getLogger("httpcore").setLevel(logging.ERROR)

app = FastAPI(
    title="MetisClip API",
    description="Agentic AI Video Clipping and Distribution System backend",
    version="1.0.0"
)

# Register routes
app.include_router(jobs.router)
app.include_router(clips.router)
app.include_router(scheduler.router)

app.mount("/public/tmp_videos", StaticFiles(directory=settings.TEMP_DIR), name="tmp_videos")

# Set CORS origins
origins = [
    "http://localhost:3000",  # Next.js frontend
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", tags=["Health"])
def health_check():
    """
    Service health check endpoint.
    """
    return {
        "status": "healthy",
        "service": "MetisClip Backend",
        "database_connected": bool(settings.SUPABASE_URL)
    }

@app.get("/api/auth/me", tags=["Auth"])
def get_me(current_user: dict = Depends(get_current_user)):
    """
    Get authenticated user information extracted from Supabase JWT.
    """
    return {
        "message": "Authenticated successfully",
        "user": current_user
    }

if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True
    )
