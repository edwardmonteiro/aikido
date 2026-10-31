"""A tiny, dependency-free PDF writer for agent deliverables.

Plain text in, multi-page Helvetica PDF out. Markdown is flattened: headings
become bold lines, everything else is wrapped body text. Good enough for an
itinerary or a research brief, and it keeps aikido free of a PDF dependency.
"""

from __future__ import annotations

import textwrap
from typing import List, Tuple

PAGE_W, PAGE_H = 612, 792  # US Letter, points
MARGIN = 56
BODY_SIZE, HEAD_SIZE = 10.5, 14
LEADING = 1.45
WRAP = 92


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _lines(title: str, markdown: str) -> List[Tuple[str, bool]]:
    """(text, is_heading) pairs, already wrapped."""
    out: List[Tuple[str, bool]] = [(title, True), ("", False)]
    for raw in markdown.splitlines():
        line = raw.rstrip()
        if line.startswith("#"):
            out.append(("", False))
            out.append((line.lstrip("#").strip(), True))
            continue
        line = line.replace("**", "").replace("`", "")
        if not line:
            out.append(("", False))
            continue
        indent = "    " if line.lstrip().startswith(("-", "*", "1", "2", "3", "4", "5", "6", "7", "8", "9")) else ""
        for i, chunk in enumerate(textwrap.wrap(line, WRAP) or [""]):
            out.append(((indent if i else "") + chunk, False))
    return out


def render_pdf(title: str, markdown: str) -> bytes:
    pages: List[List[Tuple[str, bool]]] = [[]]
    y = PAGE_H - MARGIN
    for text, heading in _lines(title, markdown):
        step = (HEAD_SIZE if heading else BODY_SIZE) * LEADING
        if y - step < MARGIN:
            pages.append([])
            y = PAGE_H - MARGIN
        pages[-1].append((text, heading))
        y -= step

    objects: List[bytes] = []

    def add(body: str | bytes) -> int:
        objects.append(body.encode("latin-1") if isinstance(body, str) else body)
        return len(objects)

    catalog = add("")  # placeholder, filled once page ids are known
    pages_obj = add("")
    font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    font_bold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")

    page_ids = []
    for number, page in enumerate(pages, start=1):
        ops = ["BT"]
        y = PAGE_H - MARGIN
        for text, heading in page:
            size = HEAD_SIZE if heading else BODY_SIZE
            y -= size * LEADING
            ops.append(f"/{'F2' if heading else 'F1'} {size} Tf 1 0 0 1 {MARGIN} {y:.1f} Tm ({_escape(text)}) Tj")
        ops.append(f"/F1 8 Tf 1 0 0 1 {MARGIN} {MARGIN / 2:.1f} Tm (Agent Village - page {number} of {len(pages)}) Tj")
        ops.append("ET")
        stream = "\n".join(ops).encode("latin-1", "replace")
        content = add(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
        page_ids.append(
            add(
                f"<< /Type /Page /Parent {pages_obj} 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] "
                f"/Resources << /Font << /F1 {font} 0 R /F2 {font_bold} 0 R >> >> /Contents {content} 0 R >>"
            )
        )

    objects[catalog - 1] = f"<< /Type /Catalog /Pages {pages_obj} 0 R >>".encode()
    kids = " ".join(f"{p} 0 R" for p in page_ids)
    objects[pages_obj - 1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode()

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, catalog, xref)
    return bytes(out)
