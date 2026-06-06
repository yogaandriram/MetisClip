from fastapi import Depends, HTTPException, status, Security
from supabase import create_client, Client
from backend.core.config import settings
from backend.core.security import verify_token, security
from fastapi.security import HTTPAuthorizationCredentials

def get_supabase_client() -> Client:
    """
    Get a Supabase client with the service role key.
    Useful for backend operations that bypass RLS.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase URL or Service Role Key is not configured."
        )
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

def get_supabase_anon_client() -> Client:
    """
    Get a Supabase client with the anon key.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase URL or Anon Key is not configured."
        )
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)

def get_current_user(payload: dict = Depends(verify_token)) -> dict:
    """
    Extracts the user info from verified JWT payload.
    """
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload does not contain user ID ('sub')."
        )
    return {
        "id": user_id,
        "email": payload.get("email"),
        "role": payload.get("role")
    }

def get_user_supabase_client(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> Client:
    """
    Create a Supabase client authenticated with the user's specific JWT.
    This respects all Row Level Security (RLS) policies configured in Supabase!
    """
    token = credentials.credentials
    if not settings.SUPABASE_URL:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase URL is not configured."
        )
    
    # Create client and set the access token for this request
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    client.postgrest.auth(token)
    return client
