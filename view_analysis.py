import csv
import json
import os

# This file is used after all the data is crawled and after we have generated
# the json files using Gemini.

def clean_json_string(maybe_markdown_json: str) -> str:
    """
    Given a string that might contain triple-backtick fences,
    remove them so the remaining content is valid JSON.
    """
    # Trim leading/trailing whitespace
    cleaned = maybe_markdown_json.strip()

    # If it starts with ```json or ``` (some might have just triple backticks without `json`),
    # remove that prefix, plus if it ends with triple backticks, remove that too.
    # One robust way is a simple regex replacement:
    import re
    # Remove leading ```json (with or without newlines) and trailing ```
    cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned)
    cleaned = re.sub(r'```$', '', cleaned)
    return cleaned.strip()


def compute_sentiment_counts(analysis_dir="analysis_results_gemini", output_dir="analysis_results_for_view", output_type="csv"):
    """
    Loads the *post_analysis.json and *comments_analysis.json from `analysis_dir`,
    tallies the total 'positive' and 'negative' sentiments, and saves them 
    in sentiment_count.json as:
    
      {
        "prefix": {
          "positive": X,
          "negative": Y
        },
        ...
      }
    """
    # Dictionary to hold prefix -> {"positive": int, "negative": int}
    sentiment_counts = {}

    # List all files in the analysis directory
    all_files = os.listdir(analysis_dir)

    # Filter to just the files that end with "_post_analysis.json"
    post_analysis_files = [
        f for f in all_files if f.endswith("_post_analysis.json")
    ]

    # For each post_analysis file, find its associated comments_analysis
    for post_file in post_analysis_files:
        # e.g. post_file = "1im27jr_post_analysis.json"
        prefix = post_file.replace("_post_analysis.json", "")

        # Initialize counters
        pos_count = 0
        neg_count = 0

        # ---------------------------
        # Load the POST analysis file
        # ---------------------------
        post_analysis_path = os.path.join(analysis_dir, post_file)
        with open(post_analysis_path, 'r', encoding='utf-8') as f:
            # The file itself is just a JSON string, so first load that string...
            post_analysis_json_str = json.load(f)  # This yields a string
            # ...then parse the string as JSON
            try:
                post_analysis_data = json.loads(post_analysis_json_str)
            except json.JSONDecodeError:
                post_analysis_data = {}

        if isinstance(post_analysis_data, dict):
            # If valid, check if the sentiment is 'positive' or 'negative'
            sentiment = post_analysis_data.get("sentiment", "").lower()
            if sentiment == "positive":
                pos_count += 1
            elif sentiment == "negative":
                neg_count += 1

        # -------------------------------
        # Load the COMMENTS analysis file
        # -------------------------------
        comments_file = f"{prefix}_comments_analysis.json"
        comments_path = os.path.join(analysis_dir, comments_file)

        if os.path.exists(comments_path):
            # comments_analysis is a list of objects: {"author":..., "comment":..., "analysis": ...}
            with open(comments_path, 'r', encoding='utf-8') as cf:
                comment_analysis_list = json.load(cf)  # This is a list of dicts

            # Loop through each comment object
            for comment_obj in comment_analysis_list:
                analysis_str = comment_obj.get("analysis", "")
                if not analysis_str:
                    continue
                
                # Remove backticks if present
                analysis_str = clean_json_string(analysis_str)
                
                # The "analysis" field itself is a JSON string, so parse again
                try:
                    analysis_data = json.loads(analysis_str)
                except json.JSONDecodeError:
                    analysis_data = {}

                if isinstance(analysis_data, dict):
                    sentiment = analysis_data.get("sentiment", "").lower()
                    if sentiment == "positive":
                        pos_count += 1
                    elif sentiment == "negative":
                        neg_count += 1

        # Store the result for this prefix
        sentiment_counts[prefix] = {
            "positive": pos_count,
            "negative": neg_count
        }
    os.makedirs(output_dir, exist_ok=True)

    # ----------------------
    # Save sentiment_counts as JSON
    # ----------------------
    if output_type == "json":
        output_file = os.path.join(output_dir, "sentiment_count.json")
        with open(output_file, 'w', encoding='utf-8') as out_f:
            json.dump(sentiment_counts, out_f, indent=2)

        print(f"Sentiment counts saved to {output_file}")


    # ----------------------
    # Save sentiment_counts as CSV
    # ----------------------
    elif output_type == "csv":
        output_file = os.path.join(output_dir, "sentiment_count.csv")
        with open(output_file, 'w', newline='', encoding='utf-8') as out_f:
            writer = csv.writer(out_f)

            # Write header
            writer.writerow(["post_id", "positive", "negative"])

            # Write rows
            for prefix, counts in sentiment_counts.items():
                writer.writerow([prefix, counts["positive"], counts["negative"]])

        print(f"Sentiment counts saved to {output_file}")

def compute_topic_sentiment_counts(
    analysis_dir="analysis_results_gemini",
    output_dir="analysis_results_for_view",
    output_filename="topics_sentiment_count.csv"
):
    """
    Reads all *_post_analysis.json and *_comments_analysis.json in `analysis_dir`,
    parses out the sentiment and topics from each, and accumulates total positive/negative
    counts *per topic* across ALL posts/comments. Saves the result as CSV.

    CSV format:
      topic, positive, negative
    """

    # topic_counts will map each topic -> {"positive": int, "negative": int}
    topic_counts = {}

    def increment_topic_counts(topics, sentiment_value):
        """
        Given a list of topics (like ["academic", "technology"]) and a sentiment_value
        ("positive" or "negative"), increment the counters in topic_counts.
        """
        if not topics:
            return

        for t in topics:
            t = t.strip().lower()  # normalize if needed
            if t not in topic_counts:
                topic_counts[t] = {"positive": 0, "negative": 0}
            if sentiment_value == "positive":
                topic_counts[t]["positive"] += 1
            elif sentiment_value == "negative":
                topic_counts[t]["negative"] += 1

    # List out everything in the analysis directory
    all_files = os.listdir(analysis_dir)

    # Partition them into post analysis and comment analysis files
    post_analysis_files = [f for f in all_files if f.endswith("_post_analysis.json")]

    for post_file in post_analysis_files:
        prefix = post_file.replace("_post_analysis.json", "")

        # --------------------------
        # 1) Process POST analysis
        # --------------------------
        post_analysis_path = os.path.join(analysis_dir, post_file)
        with open(post_analysis_path, 'r', encoding='utf-8') as f:
            # The file content is itself a JSON string, so first read that as text from the file
            post_analysis_json_str = json.load(f)  # yields a string
            # Now parse that string into a dict
            try:
                post_analysis_data = json.loads(post_analysis_json_str)
            except json.JSONDecodeError:
                post_analysis_data = {}

        if isinstance(post_analysis_data, dict):
            sentiment = post_analysis_data.get("sentiment", "").lower()
            topics = post_analysis_data.get("topics", [])
            if not isinstance(topics, list):
                # In case "topics" is a string or something else
                topics = []
            increment_topic_counts(topics, sentiment)

        # -----------------------------
        # 2) Process COMMENTS analysis
        # -----------------------------
        comments_file = f"{prefix}_comments_analysis.json"
        comments_path = os.path.join(analysis_dir, comments_file)

        if os.path.exists(comments_path):
            with open(comments_path, 'r', encoding='utf-8') as cf:
                # This file is a JSON array, each element is something like:
                # {"author": "...", "comment": "...", "analysis": "..."}
                try:
                    comment_analysis_list = json.load(cf)
                except json.JSONDecodeError:
                    comment_analysis_list = []

            if isinstance(comment_analysis_list, list):
                for comment_obj in comment_analysis_list:
                    analysis_str = comment_obj.get("analysis", "")
                    if not analysis_str:
                        continue

                    # Clean up possible triple backticks
                    analysis_str = clean_json_string(analysis_str)

                    # Now parse that as JSON
                    try:
                        analysis_data = json.loads(analysis_str)
                    except json.JSONDecodeError:
                        analysis_data = {}

                    sentiment = analysis_data.get("sentiment", "").lower()
                    topics = analysis_data.get("topics", [])
                    if not isinstance(topics, list):
                        topics = []
                    increment_topic_counts(topics, sentiment)

    # ---------------------
    # Write the results to CSV
    # ---------------------
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, output_filename)

    with open(output_file, 'w', newline='', encoding='utf-8') as out_f:
        writer = csv.writer(out_f)
        writer.writerow(["topic", "positive", "negative"])

        # Sort topics alphabetically if desired
        for topic in sorted(topic_counts.keys()):
            pos = topic_counts[topic]["positive"]
            neg = topic_counts[topic]["negative"]
            writer.writerow([topic, pos, neg])

    print(f"Topic-based sentiment counts saved to {output_file}")

if __name__ == "__main__":
    # compute_sentiment_counts()
    compute_topic_sentiment_counts()