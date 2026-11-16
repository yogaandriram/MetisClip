"""Reading the pieces of a campaign brief: typed text, TXT/MD, DOCX, PDF and images (screenshots).

Agencies send briefs in any form, so every piece is kept as the user gave it (library/_campaigns/<id>/)
and turned into what the LLM can read:
- TXT, MD: the text (UTF-8, else Windows-1252).
- DOCX: paragraphs and table rows from word/document.xml (no Word or extra library needed).
- PDF: the text of each page (pypdfium2). A page with almost no text is a scan: it is rendered to a PNG
  and read like an image.
- Images: kept as they are; `llm_image` gives a resized copy for the LLM (the longest side at most
  1600 px), and the OCR fallback reads the file itself (agents/tools/ocr.py).
"""
from __future__ import annotations

import io
import logging
import re
import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

from backend.core import i18n

M = i18n.messages({
    "bad_type": {
        "id": "Jenis file ini belum didukung. Pakai PDF, DOCX, TXT, MD, atau gambar (PNG, JPG, WEBP).",
        "en": "This file type isn't supported yet. Use PDF, DOCX, TXT, MD or an image (PNG, JPG, WEBP).",
    },
    "old_word": {
        "id": "Dokumen Word lama (.doc) belum bisa dibaca. Simpan dulu sebagai DOCX atau PDF.",
        "en": "Old Word documents (.doc) can't be read yet. Save it as DOCX or PDF first.",
    },
    "too_large": {
        "id": "File terlalu besar (maksimal {mb} MB)",
        "en": "The file is too large (at most {mb} MB)",
    },
    "unreadable": {
        "id": "File tidak bisa dibaca: {error}",
        "en": "The file can't be read: {error}",
    },
    "empty": {
        "id": "File ini kosong",
        "en": "This file is empty",
    },
})

logger = logging.getLogger(__name__)

TEXT_EXT = {".txt", ".md", ".markdown"}
DOC_EXT = {".docx"}
PDF_EXT = {".pdf"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
MAX_FILE_MB = 25
MAX_PDF_PAGES = 30
TEXT_LIMIT = 60_000          # characters kept from one piece
SCANNED_PAGE_CHARS = 40      # a PDF page with less text than this is read as an image
IMAGE_MAX_SIDE = 1600
PDF_RENDER_SCALE = 2.0       # 144 dpi: small text in a scanned brief stays readable

_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


class SourceError(Exception):
    """Message for the user (in the UI language)."""


def kind_for(filename: str) -> str:
    """'file' or 'image' for a supported name; raises SourceError otherwise."""
    ext = Path(filename).suffix.lower()
    if ext in IMAGE_EXT:
        return "image"
    if ext in TEXT_EXT | DOC_EXT | PDF_EXT:
        return "file"
    if ext == ".doc":
        raise SourceError(M("old_word"))
    raise SourceError(M("bad_type"))


def check_size(size: int) -> None:
    if size <= 0:
        raise SourceError(M("empty"))
    if size > MAX_FILE_MB * 1024 * 1024:
        raise SourceError(M("too_large", mb=MAX_FILE_MB))


def _tidy(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    text = re.sub(r"[ \t]+\n", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()[:TEXT_LIMIT]


def read_text_file(data: bytes) -> str:
    for enc in ("utf-8-sig", "utf-16"):
        try:
            if enc == "utf-16" and not data.startswith((b"\xff\xfe", b"\xfe\xff")):
                continue
            return _tidy(data.decode(enc))
        except UnicodeDecodeError:
            continue
    return _tidy(data.decode("cp1252", errors="replace"))


def _paragraph(p: ElementTree.Element) -> str:
    parts: list[str] = []
    for el in p.iter():
        if el.tag == _W + "t" and el.text:
            parts.append(el.text)
        elif el.tag == _W + "tab":
            parts.append("\t")
        elif el.tag in (_W + "br", _W + "cr"):
            parts.append("\n")
    return "".join(parts).strip()


def read_docx(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        xml = z.read("word/document.xml")
    body = ElementTree.fromstring(xml).find(_W + "body")
    lines: list[str] = []
    for block in list(body) if body is not None else []:
        if block.tag == _W + "p":
            text = _paragraph(block)
            if text:
                lines.append(text)
        elif block.tag == _W + "tbl":
            for row in block.iter(_W + "tr"):
                cells = [" ".join(_paragraph(p) for p in tc.iter(_W + "p")).strip() for tc in row.iter(_W + "tc")]
                if any(cells):
                    lines.append(" | ".join(cells))
    return _tidy("\n".join(lines))


def read_pdf(data: bytes, pages_dir: Path, stem: str) -> tuple[str, int, list[Path]]:
    """(text with page markers, page count, PNGs of the scanned pages)."""
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(data)
    try:
        total = len(pdf)
        texts: list[str] = []
        scans: list[Path] = []
        for i in range(min(total, MAX_PDF_PAGES)):
            page = pdf[i]
            try:
                textpage = page.get_textpage()
                try:
                    text = _tidy(textpage.get_text_bounded())
                finally:
                    textpage.close()
                if len(text) >= SCANNED_PAGE_CHARS:
                    texts.append(f"[page {i + 1}]\n{text}")
                    continue
                pages_dir.mkdir(parents=True, exist_ok=True)
                out = pages_dir / f"{stem}-p{i + 1}.png"
                bitmap = page.render(scale=PDF_RENDER_SCALE)
                try:
                    bitmap.to_pil().save(out, "PNG")
                finally:
                    bitmap.close()
                scans.append(out)
            finally:
                page.close()
        return _tidy("\n\n".join(texts)), total, scans
    finally:
        pdf.close()


def extract(path: Path, data: bytes) -> dict[str, Any]:
    """{text, pages, images: [Path]} for a stored file (images: nothing to extract)."""
    ext = path.suffix.lower()
    try:
        if ext in TEXT_EXT:
            return {"text": read_text_file(data), "pages": 0, "images": []}
        if ext in DOC_EXT:
            return {"text": read_docx(data), "pages": 0, "images": []}
        if ext in PDF_EXT:
            text, pages, scans = read_pdf(data, path.parent, path.stem)
            return {"text": text, "pages": pages, "images": scans}
        if ext in IMAGE_EXT:
            from PIL import Image

            with Image.open(io.BytesIO(data)) as im:
                im.verify()  # a broken or fake image fails here, not later in the LLM call
            return {"text": "", "pages": 0, "images": []}
    except SourceError:
        raise
    except Exception as exc:
        logger.warning("Brief file %s unreadable: %s", path.name, exc)
        raise SourceError(M("unreadable", error=exc)) from exc
    raise SourceError(M("bad_type"))


def llm_image(path: Path) -> tuple[bytes, str]:
    """A copy of the image for the LLM: RGB, the longest side at most IMAGE_MAX_SIDE, PNG (or JPEG when
    the PNG would be large)."""
    from PIL import Image

    with Image.open(path) as im:
        im.seek(0)  # first frame of a GIF
        img = im.convert("RGBA" if "A" in im.getbands() else "RGB")
    img.thumbnail((IMAGE_MAX_SIDE, IMAGE_MAX_SIDE))
    if img.mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    if buf.tell() <= 1_500_000:
        return buf.getvalue(), "image/png"
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=88)
    return buf.getvalue(), "image/jpeg"
