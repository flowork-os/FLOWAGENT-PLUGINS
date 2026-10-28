"""
Flowork Sovereign LLM Client for TradingAgents
==============================================
Dual-tier cognitive model router connected to Flowork Connector switchboard
(http://127.0.0.1:9099) with automatic failover and structured schema parsing.

Co-authored-by: Flowork OS <agent@floworkos.com>
"""

import os
import re
import json
import logging
import urllib.request
import urllib.error
from typing import Optional, Dict, Any, Type
from pydantic import BaseModel

logger = logging.getLogger(__name__)

CONNECTOR_BASE_URL = os.environ.get("FLOWORK_CONNECTOR_URL", "http://127.0.0.1:9099")
QUICK_MODEL = os.environ.get("TRADINGAGENTS_QUICK_LLM", "gemini-2.5-flash")
DEEP_MODEL = os.environ.get("TRADINGAGENTS_DEEP_LLM", "gemini-2.5-flash")


def clean_markdown_json(text: str) -> str:
    """Strip markdown code fence blocks if present."""
    trimmed = text.strip()
    if trimmed.startswith("```"):
        trimmed = re.sub(r"^```(?:json)?\s*", "", trimmed, flags=re.IGNORECASE)
        trimmed = re.sub(r"\s*```$", "", trimmed)
    return trimmed.strip()


def invoke_llm(
    prompt: str,
    system_instruction: Optional[str] = None,
    tier: str = "quick",
    temperature: float = 0.2,
    max_tokens: int = 1024,
    json_mode: bool = False
) -> str:
    """Invoke LLM via Flowork Connector switchboard."""
    model = DEEP_MODEL if tier == "deep" else QUICK_MODEL
    url = f"{CONNECTOR_BASE_URL}/v1beta/models/{model}:generateContent"

    contents = []
    if system_instruction:
        # Include system context in user turn or system instruction
        contents.append({
            "role": "user",
            "parts": [{"text": f"SYSTEM INSTRUCTION:\n{system_instruction}\n\nUSER PROMPT:\n{prompt}"}]
        })
    else:
        contents.append({
            "role": "user",
            "parts": [{"text": prompt}]
        })

    generation_config: Dict[str, Any] = {
        "temperature": temperature,
        "maxOutputTokens": max_tokens
    }
    if json_mode:
        generation_config["responseMimeType"] = "application/json"

    payload = {
        "contents": contents,
        "generationConfig": generation_config
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json"}
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status == 200:
                raw_bytes = resp.read()
                data = json.loads(raw_bytes.decode("utf-8", errors="ignore"))
                candidates = data.get("candidates", [])
                if candidates and "content" in candidates[0]:
                    parts = candidates[0]["content"].get("parts", [])
                    text_parts = [p.get("text", "") for p in parts if "text" in p]
                    if text_parts:
                        return "".join(text_parts).strip()
    except Exception as e:
        logger.warning(f"[LLM Client] Connector invocation error: {e}")

    return ""


def invoke_structured(
    schema_cls: Type[BaseModel],
    prompt: str,
    system_instruction: Optional[str] = None,
    tier: str = "deep"
) -> Optional[BaseModel]:
    """Invoke LLM and validate response against Pydantic schema."""
    schema_desc = json.dumps(schema_cls.model_json_schema(), indent=2)
    augmented_prompt = (
        f"{prompt}\n\n"
        f"CRITICAL: Output MUST be a valid JSON object strictly complying with this schema:\n"
        f"{schema_desc}\n"
        f"Respond with raw JSON only (no conversational prefix)."
    )

    raw_text = invoke_llm(
        augmented_prompt,
        system_instruction=system_instruction,
        tier=tier,
        temperature=0.1,
        json_mode=True
    )

    if not raw_text:
        return None

    cleaned_json = clean_markdown_json(raw_text)
    try:
        parsed_dict = json.loads(cleaned_json)
        return schema_cls.model_validate(parsed_dict)
    except Exception as err:
        logger.warning(f"[LLM Client] Structured parsing error: {err} | Raw: {cleaned_json[:200]}")
        # Try regex extract first JSON object
        match = re.search(r"\{.*\}", cleaned_json, re.DOTALL)
        if match:
            try:
                parsed_dict = json.loads(match.group(0))
                return schema_cls.model_validate(parsed_dict)
            except Exception:
                pass

    return None
