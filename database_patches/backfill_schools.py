"""
Adds school and diploma tags to posts that were stored before the crawler
started tagging them.

Only the post-level tags ("schools" and "diplomas") are added. The existing
"iit" flag, sentiment, category and comments are left as they are, so past
figures on the dashboard do not change.

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
from google import genai  # noqa: E402


def post_text(post_snap):
    data = post_snap.to_dict() or {}
    comments = [
        (c.to_dict() or {}).get("body") or ""
        for c in post_snap.reference.collection("comments").stream()
    ]
    return "\n".join([data.get("title") or "", data.get("body") or ""] + comments)


def backfill(subreddit, client, days, dry_run, force, limit):
    refs = crawler.get_collections(subreddit)
    cutoff = datetime.datetime.now(crawler.SGT) - datetime.timedelta(days=days)
    tagged = skipped = failed = 0

    for post_snap in refs["posts"].where("created", ">=", cutoff).stream():
        if limit and tagged >= limit:
            break
        data = post_snap.to_dict() or {}
        if "schools" in data and not force:
            skipped += 1
            continue
        if dry_run:
            tagged += 1
            continue

        analysis = crawler.analyse_text(client, crawler.PROMPT_POST_COMMENTS, post_text(post_snap))
        if analysis == crawler.DEFAULT_ANALYSIS:
            # Gemini gave no usable answer. Leave the post untagged so a later run can retry.
            failed += 1
            continue
        post_snap.reference.update({"schools": analysis["schools"], "diplomas": analysis["diplomas"]})
        tagged += 1
        print(f"[{subreddit}] {post_snap.id}: schools={analysis['schools']} diplomas={analysis['diplomas']}")

    verb = "would tag" if dry_run else "tagged"
    print(f"[{subreddit}] {verb} {tagged} posts, skipped {skipped} already tagged, {failed} failed.")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--days", type=int, default=90, help="Tag posts created in the last N days (default 90).")
    parser.add_argument("--subreddits", nargs="*", help="Subreddits to tag (default: all in subreddits.txt).")
    parser.add_argument("--dry-run", action="store_true", help="Count posts without calling Gemini or writing.")
    parser.add_argument("--force", action="store_true", help="Re-tag posts that already have school tags.")
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
