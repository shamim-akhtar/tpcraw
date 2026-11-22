"""
Adds school and diploma tags to posts that were stored before the crawler
started tagging them.

Only the post-level school fields are written (schoolTags, schools,
schoolsClear, diplomas, schoolTagsVersion). The existing "iit" flag, sentiment,
category and comments are left as they are, so past figures on the dashboard do
not change.

Posts already tagged under the current rules (school_tags.TAGS_VERSION) are
skipped, so a run that stops part way can simply be started again. Posts
tagged under older rules are re-tagged. The list of posts is read first and
then worked through, so slow Gemini calls do not time out the Firestore read.

Each post costs one Gemini call. Run with --dry-run first to see how many
posts would be tagged.

Usage (from the repository root, with .env and firebase-credentials.json):
    python database_patches/backfill_schools.py --days 90
    python database_patches/backfill_schools.py --days 365 --subreddits temasekpoly
"""
import argparse
import datetime
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import crawler  # noqa: E402  (sets up Firebase and Reddit from .env)
import school_tags  # noqa: E402
from google import genai  # noqa: E402


def post_text(post_snap):
    data = post_snap.to_dict() or {}
    comments = [
        (c.to_dict() or {}).get("body") or ""
        for c in post_snap.reference.collection("comments").stream()
    ]
    return "\n".join([data.get("title") or "", data.get("body") or ""] + comments)


FIELDS = ("schoolTags", "schools", "schoolsClear", "diplomas", "schoolTagsVersion")


def is_current(data):
    return isinstance(data.get("schoolTags"), list) and (data.get("schoolTagsVersion") or 0) >= school_tags.TAGS_VERSION


def backfill(subreddit, client, days, dry_run, force, limit):
    refs = crawler.get_collections(subreddit)
    cutoff = datetime.datetime.now(crawler.SGT) - datetime.timedelta(days=days)
    tagged = skipped = failed = 0

    # Read the whole list first. Keeping a Firestore stream open during slow
    # Gemini calls makes the read time out (DeadlineExceeded).
    todo = []
    for post_snap in refs["posts"].where("created", ">=", cutoff).stream():
        if is_current(post_snap.to_dict() or {}) and not force:
            skipped += 1
        else:
            todo.append(post_snap.reference)
    if limit:
        todo = todo[:limit]
    print(f"[{subreddit}] {len(todo)} posts to tag, {skipped} already tagged under the current rules.")

    for post_ref in todo:
        if dry_run:
            tagged += 1
            continue
        try:
            post_snap = post_ref.get()
            analysis = crawler.analyse_text(client, crawler.PROMPT_POST_COMMENTS, post_text(post_snap), subreddit)
            if analysis == crawler.DEFAULT_ANALYSIS:
                # Gemini gave no usable answer. Leave the post as it is so a later run can retry.
                failed += 1
                continue
            fields = {k: analysis[k] for k in FIELDS}
            post_ref.update(fields)
        except Exception as e:  # keep going; the post is retried on the next run
            failed += 1
            print(f"[{subreddit}] {post_ref.id}: failed ({e})")
            continue
        tagged += 1
        print(f"[{subreddit}] {post_ref.id}: {fields['schoolTags']}")

    verb = "would tag" if dry_run else "tagged"
    print(f"[{subreddit}] {verb} {tagged} posts, skipped {skipped} already tagged, {failed} failed.")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--days", type=int, default=90, help="Tag posts created in the last N days (default 90).")
    parser.add_argument("--subreddits", nargs="*", help="Subreddits to tag (default: all in subreddits.txt).")
    parser.add_argument("--dry-run", action="store_true", help="Count posts without calling Gemini or writing.")
    parser.add_argument("--force", action="store_true", help="Re-tag posts already tagged under the current rules.")
    parser.add_argument("--limit", type=int, default=0, help="Stop after tagging this many posts per subreddit.")
    args = parser.parse_args()

    if not crawler.GOOGLE_GEMINI_API_KEY and not args.dry_run:
        sys.exit("GOOGLE_GEMINI_API_KEY is not set.")
    client = None if args.dry_run else genai.Client(api_key=crawler.GOOGLE_GEMINI_API_KEY)

    subreddits = [s.lower() for s in args.subreddits] if args.subreddits else crawler.load_subreddits()
    for subreddit in subreddits:
        backfill(subreddit, client, args.days, args.dry_run, args.force, args.limit)


if __name__ == "__main__":
    main()
