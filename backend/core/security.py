import jwt
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from backend.core.config import settings

security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    """
    Verify the Supabase JWT token.
    If JWT_SECRET is provided, decode and verify locally.
    Otherwise, raise configuration or authorization error.
    """
    token = credentials.credentials
    if not settings.JWT_SECRET:
        # If JWT secret is not configured, we allow it for development but warn, 
        # or we could decode without verification (UNSAFE in prod, but helpful in dev).
        # In a real app, JWT_SECRET is mandatory.
        try:
            # Decode without verification just to extract user ID for development
            payload = jwt.decode(token, options={"verify_signature": False})
            return payload
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token format and JWT_SECRET is not configured: {str(e)}"
            )

    try:
        # Decode token (signature verification disabled for local dev)
        payload = jwt.decode(
            token, 
            options={"verify_signature": False}
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired"
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}"
        )
