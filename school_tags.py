"""
Links posts and comments to Temasek Polytechnic schools, with evidence.

The reference list in schools.json gives, for each school, its names, its
diplomas, modules, places and other telling words. Gemini is asked to name a
school only when it can quote words from the text that name it. The code then
keeps a quote only if it appears in the text and contains one of that school's
own reference terms, so generic words such as "TP", "bursary" or "H2 History"
are dropped. On subreddits that are not TP's own, the text must also mention
Temasek Polytechnic.

A post or comment with no school link is treated as general TP (or not about
any school in particular).
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


SCHOOL_INSTRUCTIONS = f'''- school_mentions: the Temasek Polytechnic (TP) schools the text is clearly about.
  For each one give:
  - school: the school code
  - diploma: the diploma code if the text names one diploma, otherwise null
  - evidence: the exact words from the text that name this school, copied as they
    appear. Do not paraphrase.
  Only these count as evidence: the school's name or short form, one of its
  diploma names or codes, one of its modules, or one of its named facilities or
  programmes, all as given in the reference list below.
  These never count as evidence, so do not name a school because of them:
  - "TP", "Temasek Polytechnic", "Temasek Poly", "poly", "school" or "campus".
  - Services for all TP students, such as bursaries, fees, financial aid,
    scholarships, the student portal, OEI, TPOSS, LMS, wifi, the IT helpdesk, the
    TP website, student services, LEAD, the library, canteens or TP shirts.
  - CCAs, clubs and interest groups.
  - General subject or career words such as "IT", "business", "engineering",
    "design", "chemistry", "computing", "accounting" or "psychology".
  - Anything about another school: JCs, secondary schools, ITE, other polytechnics
    (NP, SP, NYP, RP) and universities (NUS, NTU, SMU, SIT, SUSS, SUTD), or O-level
    and A-level subjects and exams (H1, H2, prelims, promos).
  Leave the list empty if the text is about TP in general, about no school in
  particular, or about another school. When in doubt, leave it empty.

Reference list of TP schools:
{describe_schools()}
'''

TP_ONLY_NOTE = '''
This text comes from r/{subreddit}, a forum that is not TP's own. Most posts there
are about other schools. Name a TP school only if the text is clearly about Temasek
Polytechnic and names the school, one of its diplomas, modules or facilities.
'''

# Subreddits that belong to TP. Elsewhere a school is linked only if the text
# also mentions Temasek Polytechnic.
TP_SUBREDDITS = {"temasekpoly"}


def instructions_note(subreddit):
    """Extra prompt text for subreddits that are not TP's own."""
    if not subreddit or subreddit.lower() in TP_SUBREDDITS:
        return ""
    return TP_ONLY_NOTE.format(subreddit=subreddit)


School = enum.Enum("School", {code: code for code in SCHOOL_CODES}, type=str)
# An enum needs at least one member, so keep a placeholder if no diplomas are listed.
Diploma = enum.Enum("Diploma", {code: code for code in (DIPLOMA_CODES or ["NONE"])}, type=str)


class SchoolMention(BaseModel):
    school: School
    diploma: Optional[Diploma] = None
    evidence: list[str]


# --- Checks done in code, after Gemini has answered ---------------------------
#
# A piece of evidence is kept only if it contains a term from the school's own
# entry in schools.json (name, short form, diploma name or code, module, place or
# other term), and it does not name another school. Everything else, such as
# "TP", "bursary" or "H2 History", is dropped however Gemini labelled it.

# Short forms that are also everyday words ("bus 129", "eng lit", "cans")
# count only when written in capitals, as in "BUS" or "ENG".
CAPITALS_ONLY = {"BUS", "ENG", "DES", "CANS", "CROPS", "CUS"}

# Evidence that names another institution, or an O-level or A-level subject, is
# never about a TP school.
OTHER_SCHOOLS = re.compile(
    r"\b(np|ngee ann|sp|singapore poly(technic)?|nyp|nanyang poly(technic)?|rp|republic poly(technic)?|"
    r"ite|jc|junior college|sec(ondary)?|nus|ntu|smu|sit|suss|sutd|h1|h2|h3|"
    r"o ?levels?|a ?levels?|prelims?|promos?)\b"
)

TP_MENTION = re.compile(r"temasek\s*poly(technic)?|temasekpoly|\btp\b", re.IGNORECASE)


def _normalise(text):
    text = (text or "").lower().replace("&", " and ")
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", text)).strip()


def _contains(haystack, term):
    """Whole-word match of a normalised term inside normalised text."""
    return bool(term) and re.search(rf"(?<!\w){re.escape(term)}(?!\w)", haystack) is not None


def _school_vocabulary(school):
    """(terms matched in any case, terms matched only in capitals) for one school."""
    terms, capitals = set(), set()

    def add(term):
        if not term:
            return
        if term in CAPITALS_ONLY:
            capitals.add(term)
        else:
            terms.add(_normalise(term))

    add(school["name"])
    for sf in school.get("short_forms", []):
        add(sf)
    for d in school.get("diplomas", []):
        add(d["code"])
        add(d["name"])
        # "Accountancy & Finance" counts without "Diploma in", but one-word
        # names such as "Business" or "Marketing" are too general on their own.
        short_name = re.sub(r"^Diploma in ", "", d["name"])
        if len(short_name.split()) > 1:
            add(short_name)
        for sf in d.get("short_forms", []):
            add(sf)
        for m in d.get("modules", []):
            add(m)
    for m in school.get("modules", []):
        add(m if isinstance(m, str) else m.get("name", ""))
    for key in ("places", "other_terms"):
        for item in school.get(key, []):
            add(item)
            # "Centre for Aquaculture & Veterinary Science (CAVS)": the short form
            # in brackets and the name before it both count.
            m = re.match(r"^(.*?)\s*\(([^)]+)\)\s*$", item)
            if m:
                add(m.group(1))
                add(m.group(2))
    terms.discard("")
    return terms, capitals


VOCABULARY = {s["code"]: _school_vocabulary(s) for s in SCHOOLS}


def evidence_is_specific(phrase, school):
    """True if the phrase names this school through its own reference terms."""
    if school not in VOCABULARY:
        return False
    norm = _normalise(phrase)
    if not norm or OTHER_SCHOOLS.search(norm):
        return False
    terms, capitals = VOCABULARY[school]
    if any(_contains(norm, t) for t in terms):
        return True
    return any(re.search(rf"(?<![A-Za-z]){c}(?![A-Za-z])", phrase) for c in capitals)


def check_mentions(mentions, text, require_tp_mention=False):
    """
    Keeps only mentions whose evidence really appears in the text and names the
    school through its own reference terms, and merges mentions of the same
    school. If require_tp_mention is set (subreddits that are not TP's own), the
    text must also mention Temasek Polytechnic. Returns a list of plain dicts:
    {"school", "diploma", "diplomaName", "evidence", "confidence"}.
    """
    if require_tp_mention and not TP_MENTION.search(text or ""):
        return []
    haystack = _normalise(text)
    merged = {}
    for m in mentions or []:
        school = m.school.value
        evidence = []
        for phrase in m.evidence:
            phrase = (phrase or "").strip()
            if (_contains(haystack, _normalise(phrase)) and evidence_is_specific(phrase, school)
                    and phrase[:80] not in evidence):
                evidence.append(phrase[:80])
        if not evidence:
            continue
        diploma = m.diploma.value if m.diploma is not None else None
        if diploma is not None and DIPLOMA_TO_SCHOOL.get(diploma) != school:
            diploma = None  # diploma belongs to another school, or is the placeholder
        tag = merged.setdefault(school, {"school": school, "diploma": None, "evidence": [], "confidence": "clear"})
        tag["diploma"] = tag["diploma"] or diploma
        tag["evidence"] = (tag["evidence"] + [e for e in evidence if e not in tag["evidence"]])[:5]
    tags = [merged[k] for k in sorted(merged)]
    for tag in tags:
        tag["diplomaName"] = DIPLOMA_NAMES.get(tag["diploma"]) if tag["diploma"] else None
    return tags


# Raised whenever the tagging rules change. The dashboard ignores tags written
# under an older version, and the backfill re-tags them.
TAGS_VERSION = 2


def tag_fields(tags):
    """Firestore fields for a post or comment, worked out from its checked tags."""
    schools = [t["school"] for t in tags]
    return {
        "schoolTags": tags,
        "schools": schools,
        "schoolsClear": [t["school"] for t in tags if t["confidence"] == "clear"],
        "diplomas": sorted({t["diploma"] for t in tags if t["diploma"]}),
        "schoolTagsVersion": TAGS_VERSION,
        # Kept for older views of the dashboard.
        "iit": "yes" if "IIT" in schools else "no",
    }


EMPTY_TAG_FIELDS = tag_fields([])
