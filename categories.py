"""
The fixed list of categories for posts and comments.

Before this list, Gemini could return any text as a category, which left more
than 100 different labels in the database. The crawler now makes Gemini pick
one of the categories below. database_patches/backfill_categories.py converts
the labels already stored.
"""

CATEGORY_VERSION = 1

# value stored in Firestore -> what it covers (shown to Gemini and on the Help page)
CATEGORIES = {
    "academic": "lecturers, lessons, modules, workload, projects, exams, grading, GPA, results",
    "admission": "applications, course choice, transfers, appeals",
    "career": "internships, jobs, further study",
    "administration": "fees, bursaries, refunds, timetable, academic calendar, systems, student services",
    "facilities": "classrooms, food, transport, IT, buildings",
    "activities": "CCAs, events, friends, orientation",
    "wellbeing": "stress, mental health, bullying, harassment, safety",
    "other": "anything that does not fit the categories above",
}
OTHER = "other"

CATEGORY_INSTRUCTIONS = "\n".join(f"  - {name}: {covers}" for name, covers in CATEGORIES.items())

# Old labels with one clear home in the new list. Anything not listed here
# (for example "student life", "neutral", "uncategorized", "category") is
# unclear and is read again by Gemini for posts, or takes the category of its
# post for comments.
_OLD_LABELS = {
    "academic": ["academic", "academics", "exams", "subjects", "results", "lecturer", "curriculum",
                 "assignment", "assignments", "project", "projects", "group project", "group work",
                 "elective", "electives", "attendance", "thesis", "research", "presentation", "submission"],
    "admission": ["admission", "interview", "interviews"],
    "career": ["career", "internship"],
    "administration": ["administration", "admin", "adminstration", "fees", "timetable", "scholarship",
                       "scholarships", "financial aid", "bursary/financial aid"],
    "facilities": ["facilities", "infrastructure", "accommodation", "housing", "food", "transport"],
    "activities": ["activities", "cca", "events", "orientation", "sports"],
    "wellbeing": ["wellbeing", "mental health", "stress", "safety", "racism"],
    "other": ["other"],
}
DIRECT = {old: new for new, olds in _OLD_LABELS.items() for old in olds}


def clean(label):
    """Lower-case a stored label and strip stray brackets, as in "<admission>"."""
    return str(label or "").strip().strip("<>").strip().lower()


def normalise(label):
    """The new category for a stored label, or None when the label is unclear."""
    return DIRECT.get(clean(label))


def is_current(label):
    return label in CATEGORIES
