import os
import subprocess
import tempfile
import uuid
from backend.core.config import settings

def hex_to_ass_color(hex_color: str) -> str:
    """
    Converts a standard HTML HEX color (e.g. #06D6A0) 
    to ASS subtitle color format: &HBBGGRR&
    """
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 6:
        r = hex_color[0:2]
        g = hex_color[2:4]
        b = hex_color[4:6]
        return f"&H00{b}{g}{r}&"
    return "&H00FFFFFF&" # Default to white

def format_ass_time(seconds: float) -> str:
    """
    Converts seconds to ASS time format: H:MM:SS.cs (centiseconds)
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    centiseconds = int(round((seconds % 1) * 100))
    if centiseconds == 100:
        secs += 1
        centiseconds = 0
    return f"{hours}:{minutes:02d}:{secs:02d}.{centiseconds:02d}"

def generate_ass_file(words: list, style: dict, output_ass_path: str):
    """
    Generates an ASS subtitle file from a list of words and style config.
    The active word is highlighted.
    """
    # Parse styles
    font_family = style.get('font_family', 'Arial')
    raw_font_size = style.get('font_size', 46)
    
    # The frontend preview renders text at (raw_font_size - 12) px on a 560px high video container.
    # Our rendering resolution is 1920px high. Scale factor = 1920 / 560 ≈ 3.428
    font_size = int((raw_font_size - 12) * (1920 / 560))
    
    highlight_hex = style.get('highlight_color', '#06D6A0')
    ass_highlight_color = hex_to_ass_color(highlight_hex)
    mode = style.get('mode', 'classic')

    # Parse new properties
    font_color_hex = style.get('font_color', '#FFFFFF')
    is_italic = style.get('is_italic', False)
    is_underline = style.get('is_underline', False)
    font_weight = style.get('font_weight', 'Bold')
    stroke_color_hex = style.get('stroke_color', '#000000')
    stroke_width = style.get('stroke_width', 0)
    has_shadow = style.get('has_shadow', False)
    shadow_color_hex = style.get('shadow_color', '#000000')
    shadow_y = style.get('shadow_y', 0)
    is_uppercase = style.get('is_uppercase', False)
    
    ass_primary_color = hex_to_ass_color(font_color_hex)
    ass_outline_color = hex_to_ass_color(stroke_color_hex)
    ass_back_color = hex_to_ass_color(shadow_color_hex) if has_shadow else "&HFF000000&" # Transparent if no shadow
    
    ass_bold = "-1" if font_weight in ["Bold", "Black", "Semi-Bold"] else "0"
    ass_italic = "-1" if is_italic else "0"
    ass_underline = "-1" if is_underline else "0"
    
    scaled_outline = int(stroke_width * (1920 / 560)) if stroke_width else 0
    scaled_shadow = int(shadow_y * (1920 / 560)) if has_shadow and shadow_y else 0
    
    # Clean trailing '&' for Style definitions
    ass_highlight_style = ass_highlight_color.rstrip('&')
    ass_primary_style = ass_primary_color.rstrip('&')
    ass_outline_style = ass_outline_color.rstrip('&')
    ass_back_style = ass_back_color.rstrip('&')
    
    # ASS Header
    ass_content = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 1080",
        "PlayResY: 1920",
        "WrapStyle: 1",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Default,{font_family},{font_size},{ass_primary_style}&,&H000000FF&,{ass_outline_style}&,{ass_back_style}&,{ass_bold},{ass_italic},{ass_underline},0,100,100,0,0,1,{scaled_outline},{scaled_shadow},2,40,40,288,1",
        f"Style: Hormozi,{font_family},{font_size},&H00000000,&H000000FF,{ass_highlight_style}&,{ass_highlight_style}&,{ass_bold},{ass_italic},{ass_underline},0,100,100,0,-2,3,6,0,2,40,40,288,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ]

    # Group words into logical segments (lines) for rendering if needed.
    # For now, we will render one event per word timestamp to create the karaoke effect.
    # The active word will be highlighted, surrounding words will be white.
    # If mode is hormozi, we only show the active word.
    
    # Simple chunking: 5 words per line max to avoid overflowing screen
    chunks = []
    chunk = []
    for w in words:
        chunk.append(w)
        # simplistic end of chunk condition: punctuation or length
        if len(chunk) >= 5 or w['word'].endswith(('.', '?', '!', ',')):
            chunks.append(chunk)
            chunk = []
    if chunk:
        chunks.append(chunk)

    for ch in chunks:
        if not ch: continue
        line_start = format_ass_time(ch[0]['start'])
        line_end = format_ass_time(ch[-1]['end'])
        
        # For each word in the chunk, we create an event that spans that word's duration
        # During that duration, that specific word is highlighted.
        for i, target_word in enumerate(ch):
            event_start = format_ass_time(target_word['start'])
            event_end = format_ass_time(target_word['end'])
            
            raw_text = target_word['word'].upper() if is_uppercase else target_word['word']
            
            if mode == 'hormozi':
                # Show only one word at a time, bold, uppercase, on background box
                # Force uppercase for hormozi if it wasn't already
                text = raw_text.upper()
                ass_content.append(f"Dialogue: 0,{event_start},{event_end},Hormozi,,0,0,0,,{text}")
            
            else: # classic or bouncy or neon
                # Build the text line with the target word highlighted
                line_text = ""
                for j, w in enumerate(ch):
                    word_str = w['word'].upper() if is_uppercase else w['word']
                    if j == i:
                        if mode == 'bouncy':
                            # Increase scale for bouncy effect
                            line_text += f"{{\\c{ass_highlight_color}}}{{\\fscx120\\fscy120}}{word_str}{{\\fscx100\\fscy100}}{{\\c{ass_primary_color}}} "
                        elif mode == 'neon':
                            # Glow effect: Highlight color outline, blur, thicker border, disable shadow
                            line_text += f"{{\\3c{ass_highlight_color}\\blur12\\bord8\\shad0}}{word_str}{{\\3c{ass_outline_color}\\blur0\\bord{scaled_outline}\\shad{scaled_shadow}}} "
                        else:
                            line_text += f"{{\\c{ass_highlight_color}}}{word_str}{{\\c{ass_primary_color}}} "
                    else:
                        line_text += f"{word_str} "
                
                ass_content.append(f"Dialogue: 0,{event_start},{event_end},Default,,0,0,0,,{line_text.strip()}")

    with open(output_ass_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(ass_content))
        
    return output_ass_path

def burn_subtitles_to_video(input_video: str, ass_path: str, output_video: str) -> bool:
    """
    Uses FFmpeg to burn the ASS subtitles onto the video.
    """
    # Normalize paths for FFmpeg on Windows
    ass_path_ff = ass_path.replace('\\', '/')
    # FFmpeg requires escaping colons in the filter path on Windows
    ass_path_ff = ass_path_ff.replace(':', '\\:')
    
    cmd = [
        settings.FFMPEG_PATH,
        "-y",
        "-i", input_video,
        "-vf", f"ass='{ass_path_ff}'",
        "-c:v", "libx264",
        "-preset", "fast", # Better quality than ultrafast
        "-crf", "18",      # High quality (visually lossless)
        "-profile:v", "high",
        "-pix_fmt", "yuv420p",
        "-c:a", "copy",
        output_video
    ]
    
    try:
        subprocess.run(cmd, check=True, capture_output=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"FFmpeg subtitle burn error: {e.stderr.decode()}")
        return False
