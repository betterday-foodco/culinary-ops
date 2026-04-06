"""
Extract spec photos from BetterDay Portion Specs Word docs.
Maps meal names to images and copies them to frontend/public/spec-photos/.
"""

import re
import os
import shutil
import json
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

DOCS = [
    "D:/BetterDay Portion Specs March 25th  (1).docx",
    "D:/BetterDay Portion Specs March 25th  (2).docx",
    "D:/BetterDay Portion Specs March 25th  (3).docx",
]

OUTPUT_DIR = Path("D:/culinary-ops/.claude/worktrees/loving-sanderson/frontend/public/spec-photos")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Known meal keywords to skip (not real meal names)
SKIP_PATTERNS = [
    r'^portioning notes',
    r'^be careful',
    r'^note',
    r'^\d+$',
    r'^_{3,}',
    r'^-{3,}',
]

def is_skip(text):
    t = text.lower().strip()
    for pat in SKIP_PATTERNS:
        if re.match(pat, t):
            return True
    return len(t) < 5

def clean_meal_name(text):
    # Remove trailing numbers/dimensions (like "3935055397238")
    text = re.sub(r'\s*\d{6,}\s*$', '', text)
    text = re.sub(r'\s*\d+\.\d+\s*$', '', text)
    return text.strip()

def slugify(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')

all_mappings = []

for doc_path in DOCS:
    print(f"\nProcessing: {doc_path}")

    with zipfile.ZipFile(doc_path) as z:
        # Extract to temp
        tmp_dir = Path(f"/tmp/spec_{Path(doc_path).stem[:20].replace(' ','_')}")
        z.extractall(tmp_dir)

    media_dir = tmp_dir / "word" / "media"
    if not media_dir.exists():
        print(f"  No media folder found")
        continue

    images = {f.name: f for f in media_dir.iterdir() if f.suffix.lower() in ['.jpg', '.jpeg', '.png']}
    print(f"  Found {len(images)} images")

    # Parse document XML to find image-to-meal mappings
    doc_xml = (tmp_dir / "word" / "document.xml").read_text(encoding='utf-8', errors='ignore')

    # Get relationship map: rId -> image filename
    rels_xml = (tmp_dir / "word" / "_rels" / "document.xml.rels").read_text(encoding='utf-8', errors='ignore')
    rid_to_file = {}
    for m in re.finditer(r'Id="(rId\d+)"[^>]*Target="media/([^"]+)"', rels_xml):
        rid_to_file[m.group(1)] = m.group(2)

    # Parse paragraphs: find text blocks near images
    # Strategy: walk through blocks, track last non-empty heading as meal name
    # when we find an image, associate it with current meal

    # Split on paragraph boundaries
    blocks = re.split(r'<w:p[ >]', doc_xml)

    current_meal = None
    doc_mappings = []

    for block in blocks:
        # Extract plain text
        text_parts = re.findall(r'<w:t[^>]*>([^<]*)</w:t>', block)
        text = ' '.join(text_parts).strip()
        text = re.sub(r'\s+', ' ', text)

        # Look for image references
        rids = re.findall(r'r:embed="(rId\d+)"', block)

        if text and not is_skip(text):
            cleaned = clean_meal_name(text)
            if cleaned and len(cleaned) > 4:
                current_meal = cleaned

        if rids and current_meal:
            for rid in rids:
                img_file = rid_to_file.get(rid)
                if img_file and img_file in images:
                    doc_mappings.append({
                        'meal_name': current_meal,
                        'image_file': str(images[img_file]),
                        'doc': Path(doc_path).name,
                    })

    # Deduplicate — keep first image per meal
    seen_meals = {}
    for m in doc_mappings:
        if m['meal_name'] not in seen_meals:
            seen_meals[m['meal_name']] = m

    unique = list(seen_meals.values())
    print(f"  Mapped {len(unique)} meals to images")

    all_mappings.extend(unique)

print(f"\nTotal: {len(all_mappings)} meal-image pairs")

# Copy images to output dir and build final map
final = {}
for m in all_mappings:
    meal = m['meal_name']
    src = Path(m['image_file'])
    slug = slugify(meal)
    dest_name = f"{slug}{src.suffix.lower()}"
    dest = OUTPUT_DIR / dest_name

    if src.exists() and meal not in final:
        shutil.copy2(src, dest)
        final[meal] = f"/spec-photos/{dest_name}"
        pass

# Save the mapping JSON
mapping_path = OUTPUT_DIR / "mapping.json"
with open(mapping_path, 'w') as f:
    json.dump(final, f, indent=2)

print(f"\nDone! {len(final)} images copied to {OUTPUT_DIR}")
print(f"Mapping saved to {mapping_path}")
