import os
import boto3
import logging
from botocore.config import Config
from backend.core.config import settings
from typing import Optional

logger = logging.getLogger(__name__)

# Initialize R2 client (boto3 S3 client configured for Cloudflare R2)
def get_r2_client():
    if not settings.R2_ACCESS_KEY_ID or not settings.R2_SECRET_ACCESS_KEY or not settings.R2_ENDPOINT_URL:
        logger.warning("R2 credentials not configured. R2 storage will be unavailable.")
        return None

    try:
        r2_config = Config(
            region_name="auto",  # Cloudflare R2 requires region 'auto'
            signature_version="s3v4"
        )
        client = boto3.client(
            "s3",
            endpoint_url=settings.R2_ENDPOINT_URL,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            config=r2_config
        )
        return client
    except Exception as e:
        logger.error(f"Failed to initialize R2 client: {str(e)}")
        return None

def upload_to_r2(local_file_path: str, destination_path: str, content_type: str = "application/octet-stream") -> Optional[str]:
    """
    Uploads a local file to Cloudflare R2 bucket.
    Returns the public URL of the uploaded file if successful, otherwise None.
    """
    r2_client = get_r2_client()
    if not r2_client:
        return None

    if not os.path.exists(local_file_path):
        logger.error(f"Cannot upload to R2, file does not exist: {local_file_path}")
        return None

    try:
        logger.info(f"Uploading {local_file_path} to R2 bucket {settings.R2_BUCKET_NAME} at {destination_path}")
        
        # Upload using boto3
        r2_client.upload_file(
            Filename=local_file_path,
            Bucket=settings.R2_BUCKET_NAME,
            Key=destination_path,
            ExtraArgs={
                "ContentType": content_type
            }
        )

        # Construct public URL
        # Ensure public URL base doesn't have trailing slash
        base_url = settings.R2_PUBLIC_URL.rstrip("/")
        # Ensure destination path doesn't have leading slash
        safe_destination = destination_path.lstrip("/")
        
        public_url = f"{base_url}/{safe_destination}"
        logger.info(f"Successfully uploaded to R2. Public URL: {public_url}")
        
        return public_url

    except Exception as e:
        logger.error(f"Error uploading {local_file_path} to R2: {str(e)}")
        return None

def delete_from_r2(public_url: str) -> bool:
    """
    Deletes an object from Cloudflare R2 given its public URL.
    Returns True if successful, False otherwise.
    """
    if not public_url:
        return False
        
    r2_client = get_r2_client()
    if not r2_client:
        return False
        
    try:
        base_url = settings.R2_PUBLIC_URL.rstrip("/")
        
        # Extract the object key from the public URL
        if public_url.startswith(base_url):
            # +1 to remove the trailing slash after the base URL
            object_key = public_url[len(base_url)+1:]
            # Remove any query parameters (like ?t=123)
            object_key = object_key.split("?")[0]
            
            logger.info(f"Deleting R2 object: {object_key}")
            r2_client.delete_object(
                Bucket=settings.R2_BUCKET_NAME,
                Key=object_key
            )
            return True
        else:
            logger.warning(f"URL {public_url} does not match R2 base URL {base_url}. Skipping deletion.")
            return False
            
    except Exception as e:
        logger.error(f"Failed to delete {public_url} from R2: {str(e)}")
        return False
