import os
import math
import time
import logging
import re
import datetime
from collections import defaultdict

import asyncio
import discord
from discord.ext import commands

# Firebase
import firebase_admin
from firebase_admin import credentials, firestore

# Google Gemini
import google.generativeai as genai

# Load .env
from dotenv import load_dotenv
load_dotenv()

# ---------------------- PROMPTS ----------------------
PROMPT_COMMENT = """
You are an AI assigned to evaluate a Discord message (a reply).
Review the following text and provide a concise output in this format: 
a sentiment score (1 for positive, -1 for negative, 0 for neutral), 
then a comma, the identified emotion (happy, relief, stress, frustration, 
pride, disappointment, confusion, neutral), another comma, the determined category 
(academic, exams, facilities, subjects, administration, career, admission, results, internship,
lecturer, student life, infrastructure, classroom, events, CCA),
and finally, a comma followed by "yes" or "no" indicating whether the text 
relates to the School of IIT (Informatics & IT).
"""

PROMPT_POST_COMMENTS = """
You are an AI assigned to evaluate a Discord message and all its replies.
Review the following text (message + replies) and provide a concise output in this format: 
a sentiment score (1 for positive, -1 for negative, 0 for neutral), 
then a comma, the identified emotion (happy, relief, stress, frustration, 
pride, disappointment, confusion, neutral), another comma, the determined category 
(academic, exams, facilities, subjects, administration, career, admission, results, internship,
lecturer, student life, infrastructure, classroom, events, CCA), 
and finally, another comma followed by "yes" or "no" indicating whether the text 
relates to the School of IIT (Informatics & IT).
"""

PROMPT_SUMMARY = """
You are an AI tasked with analyzing a Discord message and its replies. 
Perform the following steps (do not provide headings or titles for any paragraphs):

1. Start with a concise paragraph summarizing the key topics, issues, 
or themes discussed across the message and replies.

2. In the second paragraph, describe the overall sentiment and emotional 
tone expressed. Mention any references to specific academic subjects, school facilities, 
or aspects of campus life, if applicable.

3. If appropriate, include a third paragraph highlighting any 
concerns raised or constructive suggestions for school authorities. Clearly reference 
any specific subjects, facilities, or experiences mentioned.

If the provided text lacks sufficient content for analysis (e.g., it only contains links, 
attachments, or unrelated filler), simply state:

“The text does not contain enough meaningful information to generate a summary, sentiment analysis, or recommendations.”
"""

# ---------------------- CONSTANTS & LOGGING ----------------------
BATCH_COMMIT_SIZE = 400
logging.basicConfig(
    filename='crawler_errors.log',
    level=logging.ERROR,
    format='%(asctime)s %(levelname)s: %(message)s'
)

# ---------------------- ENVIRONMENT & FIREBASE INIT ----------------------
DISCORD_TOKEN = os.getenv('DISCORD_BOT_TOKEN')
GOOGLE_GEMINI_API_KEY = os.getenv('GOOGLE_GEMINI_API_KEY', '')

try:
    cred = credentials.Certificate("firebase-credentials.json")
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("Firebase Initialized Successfully.")
except Exception as e:
    logging.error(f"Failed to initialize Firebase: {e}")
    print(f"CRITICAL: Failed to initialize Firebase: {e}")
    exit()

# ---------------------- GOOGLE GEMINI INIT ----------------------
try:
    genai.configure(api_key=GOOGLE_GEMINI_API_KEY)
    model = genai.GenerativeModel()
    print("Google Gemini Configured.")
except Exception as e:
    logging.error(f"Failed to configure Google Gemini: {e}")
    print(f"CRITICAL: Failed to configure Google Gemini: {e}")
    exit()

# ---------------------- DISCORD BOT SETUP ----------------------
intents = discord.Intents.default()
intents.message_content = True  # needed for reading message text
bot = commands.Bot(command_prefix="!", intents=intents)

# ---------------------- FIRESTORE HELPER FUNCTIONS ----------------------
def detect_temasek_poly_related(text: str) -> bool:
    """Check if text references Temasek Polytechnic (TP)."""
    if not text:
        return False
    pattern = r"\btemasek polytechnic\b|\btemasekpoly\b|\btemasek poly\b|\btp\b"
    return bool(re.search(pattern, text, re.IGNORECASE))

def get_last_timestamp(channel_name: str) -> float:
    """Retrieve last processed timestamp from Firestore."""
    doc_id = f"last_timestamp_discord_{channel_name}"
    try:
        doc = db.collection("meta").document(doc_id).get()
        if doc.exists:
            return doc.to_dict().get("value", 0)
    except Exception as e:
        logging.error(f"Error fetching last_timestamp for {channel_name}: {e}")
    return 0

def set_last_timestamp(timestamp: float, channel_name: str):
    """Save last processed timestamp for a channel."""
    doc_id = f"last_timestamp_discord_{channel_name}"
    try:
        db.collection("meta").document(doc_id).set({"value": timestamp})
    except Exception as e:
        logging.error(f"Error saving last_timestamp for {channel_name}: {e}")

def get_collection_refs(guild_name: str, channel_name: str):
    """
    Return references for:
      discord_{serverName}_{channelName}_posts
      discord_{serverName}_{channelName}_authors
      discord_{serverName}_{channelName}_category_stats
      meta
    """

    # Normalize the names (optional: remove spaces, etc.)
    server_name_clean = guild_name.lower().replace(" ", "_")
    channel_name_clean = channel_name.lower().replace(" ", "_")

    posts_collection = db.collection(f"discord_{server_name_clean}_{channel_name_clean}_posts")
    authors_collection = db.collection(f"discord_{server_name_clean}_{channel_name_clean}_authors")
    category_collection = db.collection(f"discord_{server_name_clean}_{channel_name_clean}_category_stats")
    meta_collection = db.collection("meta")  # unchanged, but you could rename if desired

    return {
        "posts": posts_collection,
        "authors": authors_collection,
        "category_stats": category_collection,
        "meta": meta_collection,
    }

# ---------------------- GEMINI HELPER ----------------------
def safe_generate_content(gemini_model, prompt, retries=3, delay=5):
    """Safely call Gemini with retries."""
    for attempt in range(retries):
        try:
            response = gemini_model.generate_content(prompt)
            if response and hasattr(response, 'text') and response.text:
                return response.text.strip()
            else:
                raise ValueError("Empty or invalid Gemini response.")
        except Exception as e:
            logging.error(f"Error generate_content (Attempt {attempt+1}/{retries}): {e}. Prompt snippet: {prompt[:80]}...")
            if attempt < retries - 1:
                time.sleep(delay)
    return "Error generating response after multiple attempts."

# ---------------------- AUTHOR STATS ----------------------
def update_author_stats_memory(author_updates, author, sentiment, is_post=True, message_id=None):
    """
    Track author stats in memory. For replies, is_post=False.
    """
    if not author or author.lower() == "unknown":
        return
    if author not in author_updates:
        author_updates[author] = {
            "deltaSentimentScore": 0,
            "deltaPostCount": 0,
            "deltaNegativeCount": 0,
            "deltaPositiveCount": 0,
            "newPosts": set()
        }
    stats = author_updates[author]
    stats["deltaSentimentScore"] += sentiment

    if sentiment > 0:
        stats["deltaPositiveCount"] += 1
    elif sentiment < 0:
        stats["deltaNegativeCount"] += 1

    if is_post and message_id:
        stats["deltaPostCount"] += 1
        stats["newPosts"].add(message_id)

def commit_author_stats(author_updates, refs):
    """
    Batch-write author stats to Firestore.
    """
    if not author_updates:
        return

    authors_ref = refs["authors"]
    batch = db.batch()
    count = 0

    # Pre-fetch existing docs
    authors_to_fetch = list(author_updates.keys())
    existing_data = {}
    for i in range(0, len(authors_to_fetch), 30):
        chunk = authors_to_fetch[i:i+30]
        try:
            docs = authors_ref.where(firestore.FieldPath.document_id(), "in", chunk).stream()
            for doc in docs:
                existing_data[doc.id] = doc.to_dict()
        except Exception as e:
            logging.error(f"Error fetching author chunk: {e}")

    for author, updates in author_updates.items():
        ref = authors_ref.document(author)
        current_stats = existing_data.get(author, {
            "totalSentimentScore": 0, "postCount": 0,
            "positiveCount": 0, "negativeCount": 0, "averageSentiment": 0,
            "posts": []
        })
        current_stats["totalSentimentScore"] += updates["deltaSentimentScore"]
        current_stats["postCount"] += updates["deltaPostCount"]
        current_stats["positiveCount"] += updates["deltaPositiveCount"]
        current_stats["negativeCount"] += updates["deltaNegativeCount"]

        # Merge new posts
        posts_set = set(current_stats.get("posts", []))
        posts_set.update(updates["newPosts"])
        current_stats["posts"] = sorted(list(posts_set))

        # Recalc average
        total = current_stats["postCount"]
        current_stats["averageSentiment"] = current_stats["totalSentimentScore"] / total if total else 0

        batch.set(ref, current_stats)
        count += 1
        if count >= BATCH_COMMIT_SIZE:
            try:
                batch.commit()
            except Exception as e:
                logging.error(f"Error committing author batch: {e}")
            batch = db.batch()
            count = 0

    if count > 0:
        try:
            batch.commit()
        except Exception as e:
            logging.error(f"Error committing final author batch: {e}")

# ---------------------- CATEGORY / TIME-SERIES STATS ----------------------
def update_category_stats_memory(category_updates, date_str, category, sentiment, message_id=None):
    """
    Accumulate category stats changes in memory.
    """
    if not category or not date_str:
        return
    key = (date_str, category)
    if key not in category_updates:
        category_updates[key] = {
            "deltaSentiment": 0,
            "deltaCount": 0,
            "deltaPositiveCount": 0,
            "deltaNegativeCount": 0,
            "newPostIds": set()
        }
    cat_data = category_updates[key]
    cat_data["deltaSentiment"] += sentiment
    cat_data["deltaCount"] += 1
    if sentiment > 0:
        cat_data["deltaPositiveCount"] += 1
    elif sentiment < 0:
        cat_data["deltaNegativeCount"] += 1
    if message_id:
        cat_data["newPostIds"].add(message_id)

def commit_category_stats_non_transactional(category_updates, category_stats_ref):
    """
    Write aggregated category stats to Firestore, non-transactionally.
    """
    if not category_updates:
        return

    from collections import defaultdict
    updates_grouped_by_date = defaultdict(dict)
    for (date_str, category), updates in category_updates.items():
        updates_grouped_by_date[date_str][category] = updates

    for date_str, cat_dict in updates_grouped_by_date.items():
        doc_ref = category_stats_ref.document(date_str)
        snapshot = doc_ref.get()
        doc_exists = snapshot.exists
        current_data = snapshot.to_dict() if doc_exists else {}

        update_payload = {}
        create_payload = {}

        for cat, cat_updates in cat_dict.items():
            if doc_exists:
                path_prefix = f"{cat}."
                update_payload[f"{path_prefix}totalSentiment"] = firestore.Increment(cat_updates["deltaSentiment"])
                update_payload[f"{path_prefix}count"] = firestore.Increment(cat_updates["deltaCount"])
                if cat_updates["deltaPositiveCount"]:
                    update_payload[f"{path_prefix}positiveCount"] = firestore.Increment(cat_updates["deltaPositiveCount"])
                if cat_updates["deltaNegativeCount"]:
                    update_payload[f"{path_prefix}negativeCount"] = firestore.Increment(cat_updates["deltaNegativeCount"])
                if cat_updates["newPostIds"]:
                    update_payload[f"{path_prefix}postIds"] = firestore.ArrayUnion(list(cat_updates["newPostIds"]))
            else:
                totalSent = cat_updates["deltaSentiment"]
                cnt = cat_updates["deltaCount"]
                pos = cat_updates["deltaPositiveCount"]
                neg = cat_updates["deltaNegativeCount"]
                post_ids = list(cat_updates["newPostIds"])
                avg_sent = totalSent / cnt if cnt else 0
                create_payload[cat] = {
                    "totalSentiment": totalSent,
                    "count": cnt,
                    "positiveCount": pos,
                    "negativeCount": neg,
                    "averageSentiment": avg_sent,
                    "postIds": post_ids
                }

        if doc_exists:
            if update_payload:
                doc_ref.update(update_payload)
        else:
            if create_payload:
                doc_ref.set(create_payload)

# ---------------------- MAIN BOT EVENT ----------------------
@bot.event
async def on_ready():
    logging.info(f"Logged in as {bot.user} (ID: {bot.user.id})")

    # We'll accumulate across all channels in memory. You could do it channel-by-channel if you prefer.
    author_updates = defaultdict(lambda: {
        "deltaSentimentScore": 0,
        "deltaPostCount": 0,
        "deltaNegativeCount": 0,
        "deltaPositiveCount": 0,
        "newPosts": set()
    })
    category_updates = defaultdict(lambda: {
        "deltaSentiment": 0,
        "deltaCount": 0,
        "deltaPositiveCount": 0,
        "deltaNegativeCount": 0,
        "newPostIds": set()
    })

    for guild in bot.guilds:
        for channel in guild.text_channels:
            logging.info(f"Processing channel: {channel.name}")
            refs = get_collection_refs(guild.name, channel.name)

            last_ts = get_last_timestamp(channel.name)
            new_last_ts = last_ts

            # Prepare to fetch new messages
            if last_ts > 0:
                after_dt = datetime.datetime.fromtimestamp(last_ts, tz=datetime.timezone.utc)
                history_iter = channel.history(limit=200, after=after_dt)
            else:
                history_iter = channel.history(limit=200)

            try:
                async for message in history_iter:
                    msg_ts = message.created_at.timestamp()
                    if msg_ts <= last_ts:
                        continue
                    if msg_ts > new_last_ts:
                        new_last_ts = msg_ts

                    # Distinguish "post" vs "reply"
                    is_reply = (message.reference and message.reference.message_id)
                    msg_date_str = message.created_at.strftime("%Y-%m-%d")

                    if is_reply:
                        # Treat as "comment"
                        parent_id = str(message.reference.message_id)
                        logging.info(f"Storing reply {message.id} under parent {parent_id}")

                        # Ensure parent doc
                        parent_ref = refs["posts"].document(parent_id)
                        if not (await parent_ref.get()).exists:
                            # create a stub
                            parent_ref.set({"content": "[missing parent stub]", "created": message.created_at}, merge=True)

                        # Analyze
                        prompt = PROMPT_COMMENT + f"\nText: {message.content}"
                        reply_resp = safe_generate_content(model, prompt)
                        parts = reply_resp.split(',')

                        sentiment = 0
                        emotion = "Neutral"
                        category = "Uncategorized"
                        iit_flag = "no"
                        if len(parts) >= 4:
                            try:
                                sentiment = int(parts[0].strip())
                            except:
                                pass
                            emotion = parts[1].strip() or "Neutral"
                            category = parts[2].strip() or "Uncategorized"
                            iit_flag_candidate = parts[3].strip().lower()
                            if iit_flag_candidate in ["yes","no"]:
                                iit_flag = iit_flag_candidate

                        comment_doc = {
                            "message_id": message.id,
                            "content": message.content,
                            "author": str(message.author) or "unknown",
                            "created": message.created_at,
                            "sentiment": sentiment,
                            "emotion": emotion,
                            "category": category,
                            "iit": iit_flag,
                        }
                        parent_ref.collection("comments").document(str(message.id)).set(comment_doc)

                        # Update author stats (reply => is_post=False)
                        update_author_stats_memory(author_updates, str(message.author), sentiment, is_post=False)

                        # Update category stats
                        update_category_stats_memory(category_updates, msg_date_str, category, sentiment, message_id=str(message.id))

                    else:
                        # It's a "post"
                        logging.info(f"Storing post {message.id}")
                        combined_text = message.content  # no advanced logic for children here

                        # Overall analysis
                        prompt_overall = PROMPT_POST_COMMENTS + f"\nText: {combined_text}"
                        overall_resp = safe_generate_content(model, prompt_overall)
                        parts_overall = overall_resp.split(',')

                        post_sentiment = 0
                        post_emotion = "Neutral"
                        post_category = "Uncategorized"
                        post_iit_flag = "no"
                        if len(parts_overall) >= 4:
                            try:
                                post_sentiment = int(parts_overall[0].strip())
                            except:
                                pass
                            post_emotion = parts_overall[1].strip() or "Neutral"
                            post_category = parts_overall[2].strip() or "Uncategorized"
                            iit_candidate = parts_overall[3].strip().lower()
                            if iit_candidate in ["yes","no"]:
                                post_iit_flag = iit_candidate

                        # Summaries
                        prompt_summary = PROMPT_SUMMARY + f"\nText: {combined_text}"
                        summary = safe_generate_content(model, prompt_summary)

                        # Weighted sentiment (Discord has no built-in upvote, so treat all equally)
                        weighted_sentiment_score = post_sentiment
                        raw_sentiment_score = post_sentiment

                        related_to_tp = detect_temasek_poly_related(message.content)

                        post_doc = {
                            "message_id": message.id,
                            "content": message.content,
                            "author": str(message.author) or "unknown",
                            "created": message.created_at,
                            "sentiment": post_sentiment,
                            "emotion": post_emotion,
                            "category": post_category,
                            "iit": post_iit_flag,
                            "summary": summary,
                            "weightedSentimentScore": weighted_sentiment_score,
                            "rawSentimentScore": raw_sentiment_score,
                            "relatedToTemasekPoly": related_to_tp,
                            "lastUpdated": firestore.SERVER_TIMESTAMP,
                        }
                        refs["posts"].document(str(message.id)).set(post_doc)

                        # Update author stats
                        update_author_stats_memory(author_updates, str(message.author), post_sentiment, is_post=True, message_id=str(message.id))

                        # Update category stats
                        update_category_stats_memory(category_updates, msg_date_str, post_category, post_sentiment, message_id=str(message.id))

            except Exception as e:
                logging.error(f"Error processing channel {channel.name}: {e}")

            # Update last timestamp after processing the channel
            if new_last_ts > last_ts:
                set_last_timestamp(new_last_ts, channel.name)
                logging.info(f"Updated last timestamp for channel {channel.name} to {new_last_ts}")

    # Commit the aggregated author stats & category stats for all channels
    logging.info("Committing aggregated author stats & category stats...")
    # We'll just pick the first channel's refs for demonstration, or you can do it per channel
    if bot.guilds:
        some_channel = bot.guilds[0].text_channels[0] if bot.guilds[0].text_channels else None
        if some_channel:
            some_refs = get_collection_refs(guild.name, channel.name)
            commit_author_stats(author_updates, some_refs)
            commit_category_stats_non_transactional(category_updates, some_refs["category_stats"])

    logging.info("Crawling complete. Shutting down bot.")

    # Remove this line if you want the bot to run continuously
    await bot.close()

# ---------------------- LAUNCH BOT ----------------------
if __name__ == "__main__":
    bot.run(DISCORD_TOKEN)
