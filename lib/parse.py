#!/usr/bin/env python3
"""
Invoice Parser: Regex + heuristics first, LLM (opencode) as fallback.
Usage: python3 lib/parse.py <ocr_text_file>
Output: JSON to stdout
"""
import sys
import json
import re
import subprocess
import os

OPENCODE_PATH = os.path.expanduser("~/.opencode/bin/opencode")


def parse_number(raw: str) -> float | None:
    """Parse Spanish/European number format to float.
    8.90 -> 8.9  |  1.234,56 -> 1234.56  |  1234.56 -> 1234.56"""
    s = raw.strip().replace(' ', '')
    s = re.sub(r'[€$EURUSD\s]', '', s)
    if not s:
        return None
    try:
        # Has both dots and commas: dots are thousand sep
        if '.' in s and ',' in s:
            s = s.replace('.', '').replace(',', '.')
        # Only commas: last is decimal if <=2 digits
        elif ',' in s:
            parts = s.split(',')
            if len(parts[-1]) <= 2:  # last part is decimal
                s = s.replace(',', '.')
            else:  # commas are thousand separators
                s = s.replace(',', '')
        # Multiple dots: thousand separators
        elif s.count('.') > 1:
            s = s.replace('.', '')
        # Single dot is already decimal (or thousand if >3 digits after)
        # Keep as-is
        return float(s)
    except ValueError:
        return None


def parse_with_regex(text: str) -> dict:
    """Extract invoice fields using regex patterns."""
    result = {
        "proveedor": None,
        "cif_nif": None,
        "fecha": None,
        "numero_factura": None,
        "base_imponible": None,
        "iva": None,
        "iva_porcentaje": None,
        "total": None,
        "moneda": "EUR",
        "lineas": [],
    }

    lines = text.split('\n')
    joined = ' '.join(lines)

    # --- PROVEEDOR ---
    # Look for known patterns first
    for pattern in [
        r'(?:Proveedor|Vendedor|Empresa|Cliente|Emitido por|Nombre)\s*:?\s*(.+)',
        r'^([A-Z][a-zA-ZáéíóúÁÉÍÓÚÑñ]+(?:\s+[A-Z][a-zA-ZáéíóúÁÉÍÓÚÑñ.]+)+)$',
        r'^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóú]+\s+(?:S\.?[A-Z]\.?|L\.?L\.?|C\.?L\.?|S\.?L\.?|S\.?A\.?|Lda|LTDA))',
    ]:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            val = match.group(1).strip() if match.lastindex else match.group(0).strip()
            if val and len(val) < 100:
                # Clean up common OCR spacing issues
                val = re.sub(r'(?<=[a-z])([A-ZÁÉÍÓÚÑ])', r' \1', val)
                val = re.sub(r'\s+', ' ', val).strip()
                # Skip lines that look like headers
                if not re.match(r'^(FACTURA|TICKET|RECIBO|IVA|TOTAL|BASE)', val, re.IGNORECASE):
                    result["proveedor"] = val
                    break

    # Fallback: first non-empty line that's not a header
    if not result["proveedor"]:
        for line in lines:
            line = line.strip()
            if line and not re.match(r'^(FACTURA|TICKET|RECIBO|\d|IVA|TOTAL|BASE)', line, re.IGNORECASE) and len(line) > 3:
                val = re.sub(r'(?<=[a-z])([A-ZÁÉÍÓÚÑ])', r' \1', line)
                val = re.sub(r'\s+', ' ', val).strip()
                if len(val) > 3 and len(val) < 100:
                    result["proveedor"] = val
                    break

    # --- CIF/NIF ---
    cif_match = re.search(
        r'(?:CIF|NIF|DNI|C\.I\.F\.|N\.I\.F\.)\s*:?\s*([A-Za-z]\s*[-]?\s*\d{7,8}\s*[-]?\s*[A-Za-z0-9])(?:\s|$|\n)',
        text, re.IGNORECASE
    )
    if cif_match:
        result["cif_nif"] = cif_match.group(1).replace(' ', '').upper()

    # --- FECHA ---
    for pattern in [
        r'(\d{2})[/\-](\d{2})[/\-](\d{4})',
        r'(\d{4})[/\-](\d{2})[/\-](\d{2})',
    ]:
        match = re.search(pattern, text)
        if match:
            groups = match.groups()
            if int(groups[0]) > 31:  # YYYY-MM-DD
                y, m, d = groups
            else:
                d, m, y = groups[0], groups[1], groups[2]
            if 1 <= int(m) <= 12 and 1 <= int(d) <= 31:
                result["fecha"] = f"{d}/{m}/{y}"
                break

    # --- NÚMERO FACTURA ---
    for pattern in [
        r'(?:N[úu]mero?|N\.?[oº]?|Fac\.?|Ticket|Factura[:\s]*)\s*:?\s*([A-Za-z0-9][-/\w]{3,30})',
        r'(?:FACTURA|TICKET)\s*(?:N[°º]?\s*)?:?\s*([A-Za-z0-9][-/\w]{3,20})',
    ]:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            val = match.group(1).strip()
            # Clean common OCR issues
            val = re.sub(r'\s+', '', val)
            if val and len(val) <= 30:
                result["numero_factura"] = val
                break

    # --- TOTAL ---
    for pattern in [
        r'TOTAL\s*:?\s*([\d.,]+)\s*(EUR|€|\$)?',
        r'TOTAL\s+([\d.,]+)\s*(EUR|€|\$)?',
    ]:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            total = parse_number(match.group(1))
            if total is not None:
                result["total"] = total
                if match.group(2):
                    result["moneda"] = match.group(2).replace('€', 'EUR').replace('$', 'USD')
                break

    # --- IVA % ---
    iva_pct = re.search(r'IVA\s*[:\s]*(\d{1,3})\s*%', text, re.IGNORECASE)
    if iva_pct:
        result["iva_porcentaje"] = int(iva_pct.group(1))

    # --- IVA amount (prefer amount with currency label) ---
    iva_amt = re.search(r'IVA\s+[\d.,]+\s*%\s+([\d.,]+)\s*(EUR|€)?', text, re.IGNORECASE)
    if not iva_amt:
        iva_amt = re.search(r'IVA\s*:?\s*([\d.,]+)\s*(EUR|€)(?!\s*%)', text, re.IGNORECASE)
    if not iva_amt:
        iva_amt = re.search(r'IVA\s*:?\s*([\d.,]+)\s*(EUR|€)?', text, re.IGNORECASE)
    if iva_amt and not re.match(r'^\d{1,3}$', iva_amt.group(1).strip()):  # skip bare percentages
        val = parse_number(iva_amt.group(1))
        if val is not None:
            result["iva"] = val

    # --- BASE IMPONIBLE ---
    for kw in ['BASE IMPONIBLE', 'BASE', 'SUBTOTAL', 'HONORARIOS', 'BRUTO']:
        pat = re.compile(rf'{kw}\s*:?\s*([\d.,]+)\s*(EUR|€)?', re.IGNORECASE)
        match = pat.search(text)
        if match:
            val = parse_number(match.group(1))
            if val is not None:
                result["base_imponible"] = val
                break

    # --- LINEAS ---
    # Find items between a separator line and TOTAL/BASE/IVA line
    in_items = False
    separators_seen = 0
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Separator line
        if re.match(r'^[-=\.]{5,}$', stripped):
            separators_seen += 1
            in_items = (separators_seen == 1)
            continue

        # End of items
        if re.search(r'^(TOTAL|IVA|BASE|SUMA|FORMA|FORMA DE PAGO|SUBTOTAL|IMPORTE)', stripped, re.IGNORECASE):
            in_items = False
            continue

        if in_items:
            # Pattern: description + price at end
            m = re.match(r'^(.+?)\s+([\d.,]+)\s*(?:EUR|€)?\s*$', stripped)
            if m:
                desc = m.group(1).strip()
                price = parse_number(m.group(2))
                if price is not None and not re.search(r'^(IVA|BASE|TOTAL)', desc, re.IGNORECASE):
                    result["lineas"].append({"descripcion": desc, "importe": price})

    # Fallback: parse any "text number" lines
    if not result["lineas"]:
        for line in lines:
            m = re.match(r'^(.+?)\s+([\d.,]+)\s*(EUR|€)?\s*$', line.strip())
            if m:
                desc = m.group(1).strip()
                price = parse_number(m.group(2))
                if price is not None and price < 1000 and not re.search(
                    r'(TOTAL|IVA|BASE|FECHA|CIF|NIF|TICKET|FACTURA|%%|%|TEL|TELF|FAX|@|www|HTTP)',
                    desc, re.IGNORECASE
                ):
                    result["lineas"].append({"descripcion": desc, "importe": price})

    return result


def parse_with_llm(text: str) -> dict:
    """Use opencode CLI to parse invoice (saved for future use)."""
    prompt = f"""Extract invoice data from the OCR text below. Return ONLY valid JSON.

Required JSON structure:
{{
  "proveedor": "supplier name or null",
  "cif_nif": "tax ID or null",
  "fecha": "date in DD/MM/YYYY or null",
  "numero_factura": "invoice number or null",
  "base_imponible": "subtotal as number or null",
  "iva": "VAT amount as number or null",
  "iva_porcentaje": "VAT percentage as number or null",
  "total": "total amount as number or null",
  "moneda": "currency code or null",
  "lineas": [
    {{"descripcion": "item description", "importe": "item price as number or null}}
  ]
}}

OCR TEXT:
{text}

Rules:
- Numbers use format 1234.56 (dot as decimal separator)
- If a field is not found, use null
- Return ONLY the JSON object, nothing else
"""

    try:
        result = subprocess.run(
            [OPENCODE_PATH, 'run', prompt],
            capture_output=True, text=True,
            timeout=120,
            env={**os.environ, 'TERM': 'dumb'}
        )

        output = result.stdout.strip()
        lines = output.split('\n')
        if lines and lines[0].startswith('> build'):
            output = '\n'.join(lines[1:]).strip()

        try:
            return json.loads(output)
        except json.JSONDecodeError:
            json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', output, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(1))
            json_match = re.search(r'(\{.*\})', output, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(1))
            raise

    except (subprocess.TimeoutExpired, subprocess.CalledProcessError, json.JSONDecodeError) as e:
        return {"error": f"LLM failed: {e}"}
    except Exception as e:
        return {"error": f"LLM error: {e}"}


def merge_results(regex_result: dict, llm_result: dict) -> dict:
    """Merge regex and LLM results, preferring LLM values."""
    merged = {}
    for key in regex_result:
        if key == "error":
            continue
        llm_val = llm_result.get(key)
        regex_val = regex_result.get(key)
        if llm_val is not None and llm_val != "" and (not isinstance(llm_val, list) or len(llm_val) > 0):
            merged[key] = llm_val
        else:
            merged[key] = regex_val
    if "error" in llm_result:
        merged["llm_error"] = llm_result["error"]
    return merged


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: parse.py <ocr_text_file>"}))
        sys.exit(1)

    text_file = sys.argv[1]
    with open(text_file, 'r', encoding='utf-8') as f:
        text = f.read().strip()

    if not text:
        print(json.dumps({"error": "No input text"}))
        sys.exit(1)

    # Step 1: Fast regex parsing
    regex_result = parse_with_regex(text)

    # Step 2: LLM handling moved to Node.js API route (direct spawn)
    # This file serves as pure regex fallback only
    merged = regex_result

    print(json.dumps(merged, ensure_ascii=False, indent=2))
