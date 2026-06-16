import os
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
import imageio_ffmpeg

def get_default_ffmpeg_path():
    try:
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Supabase Settings
    SUPABASE_URL: str = "https://avxxwwlfhphdcsswzzpl.supabase.co"
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    JWT_SECRET: str = ""  # Used to verify Supabase tokens

    # AI Settings
    GROQ_API_KEY: str = ""
    WHISPER_MODEL: str = "whisper-large-v3-turbo"
    NINEROUTER_BASE_URL: str = "http://127.0.0.1:20128/v1"
    NINEROUTER_API_KEY: str = "sk-dummy"
    NINEROUTER_MODEL: str = "llama-3.3-70b-versatile"

    # YouTube Settings
    YOUTUBE_API_KEY: str = ""
    YOUTUBE_CLIENT_ID: str = ""
    YOUTUBE_CLIENT_SECRET: str = ""
    YOUTUBE_REDIRECT_URI: str = "http://localhost:3000/api/auth/youtube/callback"

    # Processing Settings
    FFMPEG_PATH: str = Field(default_factory=get_default_ffmpeg_path)
    MAX_CONCURRENT_JOBS: int = 3
    CLIP_STORAGE_BUCKET: str = "clips"
    TEMP_DIR: str = "./tmp"

    # Redis Queue
    REDIS_URL: str = "redis://localhost:6379/0"

    # App Config
    PORT: int = 8000
    HOST: str = "0.0.0.0"

settings = Settings()

# Ensure temp directory exists
os.makedirs(settings.TEMP_DIR, exist_ok=True)
