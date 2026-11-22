"""
Runs the same-day alert check over past days, for posts made before the
alert check started.

Posts are checked one day at a time (Singapore time), oldest first, with the
same candidates and the same Gemini prompt as alerts.py. Each alert is saved
with the post's own date as its time, so the dashboard's Today, 7 days and
30 days filters show it on the day the post was made, not the day of this run.

Posts already alerted are skipped. Each post checked is also recorded in
alert_checks/<subreddit>_<postId>, so a run that stops part way can simply be
started again without sending the same posts to Gemini twice.

Usage (from the repository root, with .env and firebase-credentials.json):
    python database_patches/backfill_alerts.py --days 30 --dry-run
    python database_patches/backfill_alerts.py --days 30
"""
import argparse
import datetime
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import alerts  # noqa: E402
import crawler  # noqa: E402  (sets up Firebase from .env)
from crawler import SGT, db  # noqa: E402
from google import genai  # noqa: E402

CHECK_COLLECTION = "alert_checks"

PROMPT_PAST = alerts.PROMPT_ALERTS.replace(
    "Reddit posts from the last two days they should look at today.",
    "Reddit posts from one past day would have needed a look at the time.",
)


def plural(n, word):
    return f"{n} {word}{'' if n == 1 else 's'}"


def post_time(post):
    created = post.get("created")
    if isinstance(created, datetime.datetime):
        return created.astimezone(SGT)
    return datetime.datetime.now(SGT)


def already_checked(alert_ids):
    done = set()
    for alert_id in alert_ids:
        if db.collection(CHECK_COLLECTION).document(alert_id).get().exists:
            done.add(alert_id)
    return done


def mark_checked(posts):
    now = datetime.datetime.now(SGT)
    for p in posts:
        db.collection(CHECK_COLLECTION).document(p["alertId"]).set({"checkedAt": now})


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--days", type=int, default=30, help="Check posts from the last N days (default 30).")
    parser.add_argument("--dry-run", action="store_true", help="Count the posts to check; do not call Gemini or save.")
    args = parser.parse_args()

    if not crawler.GOOGLE_GEMINI_API_KEY and not args.dry_run:
        sys.exit("GOOGLE_GEMINI_API_KEY is not set.")
    client = None if args.dry_run else genai.Client(api_key=crawler.GOOGLE_GEMINI_API_KEY)

    alerts.correct_saved_alerts(dry_run=args.dry_run)
    alerts.mask_saved_alerts(client, dry_run=args.dry_run)

    today = datetime.datetime.now(SGT).date()
    first = today - datetime.timedelta(days=args.days - 1)
    since = datetime.datetime.combine(first, datetime.time.min, tzinfo=SGT)
    posts = alerts.load_recent_posts(since)
    candidates = [p for p in posts if alerts.is_candidate(p)]
    ids = [p["alertId"] for p in candidates]
    done = alerts.already_alerted(ids) | already_checked(ids)
    todo = [p for p in candidates if p["alertId"] not in done]
    print(f"{len(posts)} polytechnic posts since {first}; {len(candidates)} candidates; "
          f"{len(todo)} to check ({len(done)} already alerted or checked).")

    by_day = {}
    for p in todo:
        by_day.setdefault(post_time(p).date(), []).append(p)

    saved = failed = 0
    for day in sorted(by_day):
        day_posts = sorted(by_day[day], key=lambda p: p.get("engagementScore") or 0, reverse=True)
        if args.dry_run:
            print(f"{day}: {plural(len(day_posts), 'post')} would be checked.")
            continue
        checked = 0
        for i in range(0, len(day_posts), alerts.MAX_CANDIDATES):
            batch = day_posts[i:i + alerts.MAX_CANDIDATES]
            try:
                found = alerts.find_alerts(client, batch, prompt=PROMPT_PAST, alerted_at=post_time)
                if found is None:
                    failed += len(batch)
                    print(f"{day}: no usable answer from Gemini for {plural(len(batch), 'post')}; will retry on the next run.")
                    continue
                for a in found:
                    db.collection(alerts.ALERT_COLLECTION).document(a["id"]).set(
                        {**{k: v for k, v in a.items() if k != "id"}, "backfilled": True})
                    saved += 1
                    print(f"Saved [{a['urgency']}] {a['kind']}: {a['title']} ({a['date']})")
                mark_checked(batch)
                checked += len(batch)
            except Exception as e:  # keep going; these posts are retried on the next run
                failed += len(batch)
                print(f"{day}: {plural(len(batch), 'post')} failed ({e}); will retry on the next run.")
        if checked:
            print(f"{day}: checked {plural(checked, 'post')}.")

    if not args.dry_run:
        line = f"{plural(saved, 'alert')} saved."
        if failed:
            line += f" {plural(failed, 'post')} could not be checked; run again to retry them."
        print(line)


if __name__ == "__main__":
    main()
