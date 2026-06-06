-- SQL Migration: 20260601184700_init_schema.sql
-- Description: Initialize core schema for MetisClip (profiles, discovery_jobs, source_videos, clips, scheduled_posts)

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  youtube_channel_id TEXT,
  youtube_refresh_token TEXT,  -- encrypted
  default_clip_duration TEXT DEFAULT '45-60',
  default_keywords TEXT[] DEFAULT '{}',
  default_video_types TEXT[] DEFAULT '{podcast}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Discovery Jobs Table
CREATE TABLE IF NOT EXISTS public.discovery_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  keywords TEXT[] NOT NULL,
  video_types TEXT[] DEFAULT '{podcast}',
  min_duration_minutes INT DEFAULT 30,
  min_views INT DEFAULT 10000,
  clip_duration TEXT DEFAULT '45-60',
  max_clips_per_video INT DEFAULT 5,
  status TEXT DEFAULT 'pending',  -- pending/running/completed/failed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Source Videos Table
CREATE TABLE IF NOT EXISTS public.source_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.discovery_jobs(id) ON DELETE CASCADE,
  youtube_id TEXT NOT NULL,
  title TEXT,
  channel_name TEXT,
  duration_seconds INT,
  view_count BIGINT,
  like_count BIGINT,
  video_type TEXT,
  quality_score FLOAT,
  status TEXT DEFAULT 'pending',  -- pending/analyzing/completed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Clips Table
CREATE TABLE IF NOT EXISTS public.clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_video_id UUID REFERENCES public.source_videos(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL,
  duration_seconds FLOAT,
  viral_score FLOAT,
  hook_text TEXT,
  tags TEXT[],
  rationale TEXT,
  storage_path TEXT,           -- Supabase Storage path
  thumbnail_path TEXT,
  subtitle_data JSONB,         -- Editable subtitle JSON
  subtitle_style JSONB,
  status TEXT DEFAULT 'processing', -- processing/ready/exported
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Scheduled Posts Table
CREATE TABLE IF NOT EXISTS public.scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT DEFAULT 'youtube_shorts',
  scheduled_at TIMESTAMPTZ NOT NULL,
  timezone TEXT DEFAULT 'Asia/Jakarta',
  title TEXT,
  description TEXT,
  tags TEXT[],
  status TEXT DEFAULT 'scheduled', -- scheduled/uploading/published/failed
  youtube_video_id TEXT,           -- after publish
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Profiles Policies
CREATE POLICY "Users can view their own profile" ON public.profiles 
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles 
  FOR UPDATE USING (auth.uid() = id);

-- Discovery Jobs Policies
CREATE POLICY "Users can perform all operations on their own discovery jobs" ON public.discovery_jobs 
  FOR ALL USING (auth.uid() = user_id);

-- Source Videos Policies
CREATE POLICY "Users can perform all operations on source videos associated with their jobs" ON public.source_videos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.discovery_jobs 
      WHERE public.discovery_jobs.id = public.source_videos.job_id 
      AND public.discovery_jobs.user_id = auth.uid()
    )
  );

-- Clips Policies
CREATE POLICY "Users can perform all operations on their own clips" ON public.clips 
  FOR ALL USING (auth.uid() = user_id);

-- Scheduled Posts Policies
CREATE POLICY "Users can perform all operations on their own scheduled posts" ON public.scheduled_posts 
  FOR ALL USING (auth.uid() = user_id);

-- Profile Trigger: Automatically create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
