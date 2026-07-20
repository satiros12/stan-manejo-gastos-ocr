#!/usr/bin/env python3
"""
OCR Pipeline: OpenCV preprocessing + Tesseract OCR
Usage: python3 lib/ocr.py <image_path>
Output: extracted text to stdout
"""
import sys
import os
import cv2
import numpy as np
import pytesseract


def preprocess(img):
    """Apply preprocessing to improve OCR accuracy."""
    # Convert to grayscale if needed
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img

    # Denoise
    denoised = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)

    # Increase contrast with CLAHE
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)

    # Binarization (OTSU)
    _, binary = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Deskew
    coords = np.column_stack(np.where(binary > 0))
    if len(coords) > 0:
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = 90 + angle
        if abs(angle) > 0.5:
            h, w = binary.shape
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, angle, 1.0)
            binary = cv2.warpAffine(
                binary, M, (w, h),
                flags=cv2.INTER_CUBIC,
                borderMode=cv2.BORDER_REPLICATE
            )

    # Resize if too small (helps OCR)
    h, w = binary.shape
    if w < 1000:
        scale = 1000 / w
        binary = cv2.resize(binary, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    return binary


def ocr_image(image_path):
    """Run OCR on an image, return extracted text."""
    if not os.path.exists(image_path):
        print(f"ERROR: File not found: {image_path}", file=sys.stderr)
        sys.exit(1)

    img = cv2.imread(image_path)
    if img is None:
        print(f"ERROR: Could not read image: {image_path}", file=sys.stderr)
        sys.exit(1)

    processed = preprocess(img)

    # Save debug image
    debug_path = image_path + "_proc.png"
    cv2.imwrite(debug_path, processed)

    # OCR with Spanish + English
    custom_config = r'--oem 3 --psm 4 -c tessedit_char_whitelist=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÁÉÍÓÚáéíóúÑñÜüºª.,;:¡!¿?€$%()[]/-@& '
    text = pytesseract.image_to_string(processed, lang='spa+eng', config=custom_config)

    # Also try with different PSM for layout
    text2 = pytesseract.image_to_string(processed, lang='spa+eng', config=r'--oem 3 --psm 6')

    # Combine both results (deduplicate)
    lines = set()
    result_lines = []
    for t in [text, text2]:
        for line in t.split('\n'):
            cleaned = line.strip()
            if cleaned and cleaned not in lines:
                lines.add(cleaned)
                result_lines.append(cleaned)

    return '\n'.join(result_lines)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 lib/ocr.py <image_path>", file=sys.stderr)
        sys.exit(1)

    result = ocr_image(sys.argv[1])
    print(result)
