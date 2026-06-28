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
