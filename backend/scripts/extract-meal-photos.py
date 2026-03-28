"""
Extract meal photos from BetterDay Portion Specs Word docs and match to DB meals.
Saves images to frontend/public/meal-photos/ and updates MealRecipe.image_url in DB.
"""

import zipfile
import xml.etree.ElementTree as ET
import os
import shutil
import json
import re
import sys
import psycopg2
from pathlib import Path

# Force UTF-8 output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Config
DOCX_FILES = [
    r"D:\BetterDay Portion Specs March 25th  (1).docx",
    r"D:\BetterDay Portion Specs March 25th  (2).docx",
    r"D:\BetterDay Portion Specs March 25th  (3).docx",
]
OUTPUT_DIR = r"D:\culinary-ops\.claude\worktrees\loving-sanderson\frontend\public\meal-photos"
DB_URL = "postgresql://neondb_owner:npg_SBenYxLK3ha6@ep-cool-pine-aei02ano.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Namespaces used in docx XML
NS = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'a14': 'http://schemas.microsoft.com/office/drawing/2010/main',
    'rel': 'http://schemas.openxmlformats.org/package/2006/relationships',
}

def slugify(name):
    """Convert meal name to safe filename."""
    s = name.lower().strip()
    s = re.sub(r"[''`]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s

def normalize(name):
    """Normalize meal name for matching."""
    s = (name or '').lower()
    s = re.sub(r"[''`]", "'", s)
    s = re.sub(r"[–—]", "-", s)
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[^a-z0-9 '&\-]", "", s)
    return s.strip()

def is_bold_paragraph(para_elem):
    """Check if a paragraph is bold (meal name indicator)."""
    # Check rPr/b on any run in the paragraph
    for rpr in para_elem.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}rPr'):
        b_elem = rpr.find('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}b')
        if b_elem is not None:
            val = b_elem.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val', 'true')
            if val.lower() not in ('false', '0'):
                return True
    # Also check pPr/pStyle for heading styles
    ppr = para_elem.find('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}pPr')
    if ppr is not None:
        pstyle = ppr.find('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}pStyle')
        if pstyle is not None:
            style_val = pstyle.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val', '')
            if 'Heading' in style_val or 'heading' in style_val:
                return True
    return False

def get_para_text(para_elem):
    """Get text content of a paragraph."""
    parts = []
    for t in para_elem.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'):
        if t.text:
            parts.append(t.text)
    return ''.join(parts).strip()

def extract_from_docx(docx_path):
    """
    Extract (meal_name, image_data, ext) pairs from a docx file.
    Returns list of dicts: {meal_name, image_data, ext}
    """
    results = []

    with zipfile.ZipFile(docx_path, 'r') as z:
        # Parse relationships to map rId -> media file
        rels_data = {}
        try:
            rels_xml = z.read('word/_rels/document.xml.rels')
            rels_root = ET.fromstring(rels_xml)
            for rel in rels_root:
                rid = rel.get('Id', '')
                target = rel.get('Target', '')
                rtype = rel.get('Type', '')
                if 'image' in rtype.lower():
                    rels_data[rid] = target  # e.g. "media/image1.png"
        except Exception as e:
            print(f"  Warning: could not read rels for {docx_path}: {e}")

        # Parse document.xml to find paragraphs and drawings in order
        doc_xml = z.read('word/document.xml')
        root = ET.fromstring(doc_xml)

        body = root.find('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}body')
        if body is None:
            return results

        current_meal = None
        meal_image_assigned = {}  # meal_name -> True once assigned

        for child in body:
            tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag

            if tag == 'p':
                # Check if this paragraph is a meal name (bold paragraph with meaningful text)
                text = get_para_text(child)
                if text and len(text) > 3:
                    # Look for bold paragraphs, or paragraphs that look like meal names
                    # (contain keywords like "Chicken", "Beef", "Salmon", etc.)
                    if is_bold_paragraph(child):
                        # Skip section headers like "Portioning Notes", "Components", etc.
                        skip_words = ['portioning notes', 'notes:', 'ingredients', 'components',
                                      'allergens', 'page', 'betterday', 'portion spec']
                        lower_text = text.lower()
                        if not any(w in lower_text for w in skip_words) and len(text) > 5:
                            current_meal = text

                # Check for drawing inside paragraph
                drawings = list(child.iter('{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}inline')) + \
                           list(child.iter('{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}anchor'))

                for drawing in drawings:
                    # Find the blip (image reference)
                    for blip in drawing.iter('{http://schemas.openxmlformats.org/drawingml/2006/main}blip'):
                        rid = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed', '')
                        if rid and rid in rels_data:
                            media_path = rels_data[rid]
                            if not media_path.startswith('media/'):
                                media_path = 'word/' + media_path
                            else:
                                media_path = 'word/' + media_path

                            try:
                                img_data = z.read(media_path)
                                ext = os.path.splitext(media_path)[1].lower()
                                if not ext:
                                    ext = '.jpg'

                                if current_meal and current_meal not in meal_image_assigned:
                                    results.append({
                                        'meal_name': current_meal,
                                        'image_data': img_data,
                                        'ext': ext,
                                    })
                                    meal_image_assigned[current_meal] = True
                                    print(f"  Matched image to: {current_meal}")
                            except Exception as e:
                                print(f"  Warning: could not read image {media_path}: {e}")

            elif tag == 'tbl':
                # Tables may also contain drawings
                for row in child.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tr'):
                    for cell in row.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tc'):
                        for para in cell.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
                            text = get_para_text(para)
                            if text and len(text) > 3 and is_bold_paragraph(para):
                                skip_words = ['portioning notes', 'notes:', 'ingredients', 'components',
                                              'allergens', 'page', 'betterday', 'portion spec']
                                lower_text = text.lower()
                                if not any(w in lower_text for w in skip_words) and len(text) > 5:
                                    current_meal = text

                        for drawing in cell.iter('{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}inline'):
                            for blip in drawing.iter('{http://schemas.openxmlformats.org/drawingml/2006/main}blip'):
                                rid = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed', '')
                                if rid and rid in rels_data:
                                    media_path = rels_data[rid]
                                    if not media_path.startswith('media/'):
                                        media_path = 'word/' + media_path
                                    else:
                                        media_path = 'word/' + media_path

                                    try:
                                        img_data = z.read(media_path)
                                        ext = os.path.splitext(media_path)[1].lower()
                                        if not ext:
                                            ext = '.jpg'

                                        if current_meal and current_meal not in meal_image_assigned:
                                            results.append({
                                                'meal_name': current_meal,
                                                'image_data': img_data,
                                                'ext': ext,
                                            })
                                            meal_image_assigned[current_meal] = True
                                            print(f"  Matched image to: {current_meal}")
                                    except Exception as e:
                                        print(f"  Warning: could not read image from table: {e}")

    return results

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Connect to DB and get existing meals with image_url
    print("Connecting to database...")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    cur.execute('SELECT id, display_name, image_url FROM "MealRecipe"')
    db_meals = cur.fetchall()
    print(f"Found {len(db_meals)} meals in DB")

    # Build normalized lookup
    meal_lookup = {}  # normalized_name -> (id, display_name, image_url)
    for meal_id, display_name, image_url in db_meals:
        key = normalize(display_name)
        meal_lookup[key] = (meal_id, display_name, image_url)

    # Also map the raw names
    meals_with_images = {meal_id for meal_id, _, img in db_meals if img}
    print(f"Meals already with images: {len(meals_with_images)}")

    all_extractions = []

    for docx_path in DOCX_FILES:
        if not os.path.exists(docx_path):
            print(f"Skipping (not found): {docx_path}")
            continue
        print(f"\nProcessing: {os.path.basename(docx_path)}")
        extractions = extract_from_docx(docx_path)
        print(f"  Extracted {len(extractions)} meal-image pairs")
        all_extractions.extend(extractions)

    # Match and save
    mapping = {}
    updated = 0
    skipped = 0
    no_match = 0

    for item in all_extractions:
        meal_name = item['meal_name']
        norm_name = normalize(meal_name)

        # Try exact match
        match = meal_lookup.get(norm_name)

        # Try partial match if no exact match
        if not match:
            for key, val in meal_lookup.items():
                if norm_name in key or key in norm_name:
                    match = val
                    break

        if not match:
            print(f"  No DB match for: {meal_name}")
            no_match += 1
            continue

        meal_id, display_name, existing_image_url = match

        # Skip if already has an image
        if existing_image_url:
            print(f"  Skipping (has image): {display_name}")
            skipped += 1
            continue

        # Save image
        slug = slugify(meal_name)
        filename = f"{slug}{item['ext']}"
        filepath = os.path.join(OUTPUT_DIR, filename)

        with open(filepath, 'wb') as f:
            f.write(item['image_data'])

        image_url = f"/meal-photos/{filename}"
        mapping[meal_name] = filename

        # Update DB
        try:
            cur.execute(
                'UPDATE "MealRecipe" SET image_url = %s WHERE id = %s',
                (image_url, meal_id)
            )
            conn.commit()
            updated += 1
            print(f"  Saved & updated: {display_name} -> {filename}")
        except Exception as e:
            conn.rollback()
            print(f"  DB error for {display_name}: {e}")

    cur.close()
    conn.close()

    print(f"\n=== Summary ===")
    print(f"Total extractions: {len(all_extractions)}")
    print(f"Updated in DB: {updated}")
    print(f"Skipped (had image): {skipped}")
    print(f"No DB match: {no_match}")

    # Save mapping JSON
    mapping_path = os.path.join(OUTPUT_DIR, "_mapping.json")
    with open(mapping_path, 'w') as f:
        json.dump(mapping, f, indent=2)
    print(f"\nMapping saved to: {mapping_path}")

if __name__ == '__main__':
    main()
