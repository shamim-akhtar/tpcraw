"""
Links posts and comments to Temasek Polytechnic schools, with evidence.

The reference list in schools.json gives, for each school, its names, its
diplomas, modules, places and other telling words. Gemini is asked to name a
school only when it can quote words from the text that point to it, and to say
whether the link is "clear" or only "likely". The quotes are then checked
against the text, and any school without a real quote is dropped.

A post or comment with no school link is treated as TP-wide (or not about any
school in particular).
"""
import enum
import json
import os
import re
from typing import Optional

from pydantic import BaseModel

SCHOOLS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schools.json")


def load_schools(file_path=SCHOOLS_FILE):
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)["schools"]


SCHOOLS = load_schools()
SCHOOL_CODES = [s["code"] for s in SCHOOLS]
DIPLOMA_TO_SCHOOL = {d["code"]: s["code"] for s in SCHOOLS for d in s.get("diplomas", [])}
DIPLOMA_CODES = list(DIPLOMA_TO_SCHOOL)
DIPLOMA_NAMES = {d["code"]: d["name"] for s in SCHOOLS for d in s.get("diplomas", [])}


def _join(items):
    return "; ".join(i for i in items if i)


def describe_schools(schools=SCHOOLS):
    """The reference list as plain text for the prompt."""
    blocks = []
    for s in schools:
        lines = [f"{s['code']}: {s['name']}"]
        if s.get("short_forms"):
            lines.append(f"  Also called: {_join(s['short_forms'])}")
        for d in s.get("diplomas", []):
            names = _join([d["name"]] + d.get("short_forms", []))
            lines.append(f"  Diploma {d['code']}: {names}")
            if d.get("modules"):
                lines.append(f"    Modules: {_join(d['modules'])}")
        if s.get("modules"):
            lines.append(f"  Modules: {_join(m if isinstance(m, str) else m.get('name', '') for m in s['modules'])}")
        if s.get("places"):
            lines.append(f"  Places: {_join(s['places'])}")
        if s.get("other_terms"):
            lines.append(f"  Other terms: {_join(s['other_terms'])}")
        blocks.append("\n".join(lines))
    return "\n".join(blocks)


SCHOOL_INSTRUCTIONS = f'''- school_mentions: the Temasek Polytechnic schools the text is about. For each one give:
  - school: the school code
  - diploma: the diploma code if the text points to one diploma, otherwise null
  - evidence: the exact words from the text that point to this school, copied as
    they appear (for example a diploma name, a module name, a lab or a lecturer's
    subject). Do not paraphrase.
  - confidence: "clear" if the evidence names the school, one of its diplomas,
    modules or places; "likely" if it is only a strong hint (for example a topic
    that is taught mainly in that school).
  Only name a school when you can quote evidence. Leave the list empty if the text
  is about TP in general, about no school in particular, or about another
  polytechnic. Short forms such as "IT" or "business" on their own are weak hints,
  so use "likely" for them, or leave them out if the text could mean something else.

Reference list of TP schools:
{describe_schools()}
'''


class Confidence(str, enum.Enum):
    CLEAR = "clear"
    LIKELY = "likely"


School = enum.Enum("School", {code: code for code in SCHOOL_CODES}, type=str)
# An enum needs at least one member, so keep a placeholder if no diplomas are listed.
Diploma = enum.Enum("Diploma", {code: code for code in (DIPLOMA_CODES or ["NONE"])}, type=str)


class SchoolMention(BaseModel):
    school: School
    diploma: Optional[Diploma] = None
    evidence: list[str]
    confidence: Confidence


def _normalise(text):
    return re.sub(r"\s+", " ", (text or "")).strip().lower()


def check_mentions(mentions, text):
    """
    Keeps only mentions whose evidence really appears in the text, and merges
    mentions of the same school. Returns a list of plain dicts:
    {"school", "diploma", "diplomaName", "evidence", "confidence"}.
    """
    haystack = _normalise(text)
    merged = {}
    for m in mentions or []:
        evidence = []
        for phrase in m.evidence:
            p = _normalise(phrase)
            if p and p in haystack and phrase.strip() not in evidence:
                evidence.append(phrase.strip()[:80])
        if not evidence:
            continue
        school = m.school.value
        diploma = m.diploma.value if m.diploma is not None else None
        if diploma is not None and DIPLOMA_TO_SCHOOL.get(diploma) != school:
            diploma = None  # diploma belongs to another school, or is the placeholder
        tag = merged.setdefault(school, {"school": school, "diploma": None, "evidence": [], "confidence": "likely"})
        tag["diploma"] = tag["diploma"] or diploma
        tag["evidence"] = (tag["evidence"] + [e for e in evidence if e not in tag["evidence"]])[:5]
        if m.confidence == Confidence.CLEAR:
            tag["confidence"] = "clear"
    tags = [merged[k] for k in sorted(merged)]
    for tag in tags:
        tag["diplomaName"] = DIPLOMA_NAMES.get(tag["diploma"]) if tag["diploma"] else None
    return tags


def tag_fields(tags):
    """Firestore fields for a post or comment, worked out from its checked tags."""
    schools = [t["school"] for t in tags]
    return {
        "schoolTags": tags,
        "schools": schools,
        "schoolsClear": [t["school"] for t in tags if t["confidence"] == "clear"],
        "diplomas": sorted({t["diploma"] for t in tags if t["diploma"]}),
        # Kept for older views of the dashboard.
        "iit": "yes" if "IIT" in schools else "no",
    }


EMPTY_TAG_FIELDS = tag_fields([])
