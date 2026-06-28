import cv2
import numpy as np
import logging
import mediapipe as mp
from mediapipe.python.solutions import face_detection as mp_face_detection

logger = logging.getLogger(__name__)

def process_auto_tracking_video(input_path: str, output_path: str):
    """
    Scans a video frame-by-frame, smoothly tracks the speaker's face,
    and crops it to a dynamic 9:16 vertical format.
    """
    logger.info(f"Initializing True Dynamic Smart Auto Tracking for {input_path}")
    
    try:
        cap = cv2.VideoCapture(input_path)
        if not cap.isOpened():
            raise Exception("Failed to open input video with OpenCV.")
            
        video_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        video_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        target_w = int(video_h * 9 / 16)
        # Force dimensions to be strictly even (required by h264/mp4v)
        # We round DOWN to the nearest even number so we never exceed the actual frame size
        target_w = target_w & ~1
        target_h = video_h & ~1
        
        logger.info(f"Pass 1: Scanning {total_frames} frames for face movement...")
        
        # Detection interval: run MediaPipe every N frames to speed up processing
        interval = max(1, int(fps / 5)) # ~5 FPS scanning
        
        raw_x_targets = []
        last_known_x = video_w // 2
        
        with mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5) as face_detection:
            frame_idx = 0
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                    
                if frame_idx % interval == 0:
                    # OpenCV uses BGR, MediaPipe needs RGB
                    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    results = face_detection.process(rgb_frame)
                    
                    if getattr(results, 'detections', None): # type: ignore
                        best_face_x = None
                        min_dist = float('inf')
                        
                        for detection in results.detections: # type: ignore
                            bbox = detection.location_data.relative_bounding_box
                            # Convert to absolute
                            center_x = int((bbox.xmin + bbox.width / 2) * video_w)
                            
                            # Prioritize face closest to the LAST known face (prevents jumping between guests)
                            dist = abs(center_x - last_known_x)
                            if dist < min_dist:
                                min_dist = dist
                                best_face_x = center_x
                        
                        if best_face_x is not None:
                            last_known_x = best_face_x
                            
                # Append last_known_x for every frame (inherits the detection from interval)
                raw_x_targets.append(last_known_x)
                frame_idx += 1
                
        cap.release()
        
        if not raw_x_targets:
            raise Exception("No frames read from video.")
            
        logger.info("Pass 2: Smoothing camera movements (applying moving average)...")
        # Apply moving average to simulate a professional smooth camera pan
        window_size = int(fps * 1.5) # 1.5 seconds smoothing window
        window = np.ones(window_size, dtype=np.float64) / float(window_size) # type: ignore
        smoothed_x = np.convolve(raw_x_targets, window, mode='same')
        
        # Fix convolution edge effects
        half_window = window_size // 2
        smoothed_x[:half_window] = smoothed_x[half_window] # type: ignore
        smoothed_x[-half_window:] = smoothed_x[-half_window-1] # type: ignore
        
        logger.info(f"Pass 3: Rendering dynamically tracked video to {output_path}...")
        
        # We must use a standard codec for OpenCV output, e.g. mp4v. 
        # FFmpeg will re-encode it to libx264 in the next step anyway.
        fourcc = cv2.VideoWriter_fourcc(*'mp4v') # type: ignore
        
        # We write the raw cropped resolution (e.g. 607x1080) to save massive CPU cycles.
        # FFmpeg will handle the upscale to 1080x1920 using optimized C code later.
        out = cv2.VideoWriter(output_path, fourcc, fps, (target_w, target_h))
        
        cap = cv2.VideoCapture(input_path)
        frame_idx = 0
        
        while True:
            ret, frame = cap.read()
            if not ret or frame_idx >= len(smoothed_x):
                break
                
            opt_x = int(smoothed_x[frame_idx]) # type: ignore
            
            # Boundary checks
            x1 = opt_x - target_w // 2
            x2 = opt_x + target_w // 2
            
            if x1 < 0:
                x1 = 0
                x2 = target_w
            if x2 > video_w:
                x2 = video_w
                x1 = video_w - target_w
                
            # Crop frame vertically (NO RESIZING IN PYTHON - saves ~80% of CPU time in Pass 3)
            # We strictly enforce target_h and target_w slice sizes to match VideoWriter bounds
            cropped_frame = frame[:target_h, x1:x2] # type: ignore
            
            # CRITICAL: Numpy slicing creates a non-contiguous memory view. 
            # cv2.VideoWriter in C++ strictly requires contiguous memory, otherwise it throws 'Unknown C++ exception'
            contiguous_frame = np.ascontiguousarray(cropped_frame)
            
            out.write(contiguous_frame)
            frame_idx += 1
            
        cap.release()
        out.release()
        
        logger.info("✅ Dynamic Smart Auto Tracking completed successfully!")
        return True
            
    except Exception as e:
        logger.error(f"Dynamic Tracking failed: {str(e)}. Attempting to fallback or fail.")
        # If OpenCV fails, we need to return False so ffmpeg_ops can handle it
        return False
