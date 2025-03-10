import datetime
import json
from dotenv import load_dotenv
import google.generativeai as genai
import os
import re
from datetime import datetime

# Load environment variables
load_dotenv()

GOOGLE_GEMINI_API_KEY = os.getenv('GOOGLE_GEMINI_API_KEY')

# 2) Folder where your existing Reddit data is stored
DATA_FOLDER = 'reddit_data'

# 3) Folder where we'll save our analysis results
ANALYSIS_FOLDER = 'analysis_results_gemini'
os.makedirs(ANALYSIS_FOLDER, exist_ok=True)


def analyze_sentiment(text, api_key=GOOGLE_GEMINI_API_KEY):
    """Analyzes the sentiment of a given text using the Gemini API.

    Args:
        text: The text to analyze.
        api_key: Your Google Gemini API key.

    Returns:
        A string representing the sentiment analysis result, or None if an error occurs.
    """
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel()  # Use 'gemini-pro-vision' for multimodal

    prompt = f"""
    Analyze the sentiment of the following text and provide a concise response indicating whether it is positive, negative, or neutral.

    Text: "{text}"

    Sentiment:
    """

    try:
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        print(f"An error occurred: {e}")
        return None



def analyze_sentiment2(text, api_key=GOOGLE_GEMINI_API_KEY):
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel()  # Use 'gemini-pro-vision' for multimodal

    prompt = f"""
    You are an AI analyzing text from a Reddit post or comment about Temasek Polytechnic.
    Classify the sentiment as either 'positive', 'negative', or 'neutral'.
    Identify relevant topics (e.g. academic, campus facilities, administration, events, career/internships).
    Also identify any complaints or suggestions. Return the result in valid JSON.

    Text: "{text}"

    Please return a JSON object with this structure:
    {{
    "sentiment": "positive|negative|neutral",
    "topics": ["list_of_topics"],
    "complaints": ["list_of_complaints_if_any"],
    "suggestions": ["list_of_suggestions_if_any"]
    }}
    """

    try:
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        print(f"An error occurred: {e}")
        return None
    
def load_text_from_file(filepath):
    """
    Reads the entire post file as a single text, then calls analyze_text.
    Saves the analysis as JSON in ANALYSIS_FOLDER.
    """
    # Example file name:  "abc123_post.txt"
    with open(filepath, 'r', encoding='utf-8') as f:
        text_content = f.read()
        return text_content

import os

def combine_post_and_comments(data_folder="reddit_data", output_folder="combined_data"):
    """
    Reads all post files in 'data_folder' that end with '_post.txt' and 
    locates their corresponding comments file ending with '_comments.txt' 
    (same prefix/post_id). Then, merges each pair into a single file 
    named '<post_id>_combined.txt' in the 'output_folder'.
    """
    # Create the output folder if it doesn't exist
    os.makedirs(output_folder, exist_ok=True)

    # Get a list of all files in the data folder
    all_files = os.listdir(data_folder)

    # Filter only the post files (end with "_post.txt")
    post_files = [f for f in all_files if f.endswith("_post.txt")]

    # Loop through each post file
    for post_file in post_files:
        # Derive the post_id by removing "_post.txt"
        post_id = post_file.replace("_post.txt", "")

        # Construct the corresponding comments filename
        comments_file = f"{post_id}_comments.txt"

        # Full paths to the post and comments files
        post_file_path = os.path.join(data_folder, post_file)
        comments_file_path = os.path.join(data_folder, comments_file)

        # Read the post content
        with open(post_file_path, 'r', encoding='utf-8') as pf:
            post_content = pf.read()

        # Check if a corresponding comments file exists
        if os.path.exists(comments_file_path):
            with open(comments_file_path, 'r', encoding='utf-8') as cf:
                comments_content = cf.read()
        else:
            # If no comments file found, just set an empty string
            comments_content = ""

        # Create a combined text, for example:
        combined_text = (
            "=== POST CONTENT ===\n"
            f"{post_content}\n\n"
            "=== COMMENTS ===\n"
            f"{comments_content}\n"
        )

        # Define the output filename for the combined file
        combined_filename = f"{post_id}_combined.txt"
        combined_file_path = os.path.join(output_folder, combined_filename)

        # Save the combined text
        with open(combined_file_path, 'w', encoding='utf-8') as out_f:
            out_f.write(combined_text)

        print(f"Combined post + comments for '{post_id}' -> '{combined_file_path}'")

def process_post_file(file_path):
    """
    Reads the entire post file as a single text, then calls analyze_text.
    Saves the analysis as JSON in ANALYSIS_FOLDER.
    """
    # Example file name:  "abc123_post.txt"
    with open(file_path, 'r', encoding='utf-8') as f:
        text_content = f.read()

    analysis_result = analyze_sentiment2(text_content)
    
    # Construct a JSON filename using the same base name, but with '_post_analysis.json'
    base_name = os.path.splitext(os.path.basename(file_path))[0]
    analysis_filename = f"{base_name}_analysis.json"
    save_path = os.path.join(ANALYSIS_FOLDER, analysis_filename)

    with open(save_path, 'w', encoding='utf-8') as out_f:
        json.dump(analysis_result, out_f, indent=2)

    print(f"Analyzed post file: {file_path}, saved analysis to: {save_path}")

def process_comments_file(file_path):
    """
    Reads the comments file line by line.
    Each comment looks like: "Comment by username: actual comment text".
    Calls analyze_text per comment and aggregates the results in a list.
    Saves aggregated JSON in ANALYSIS_FOLDER.
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # We'll collect analysis results for each individual comment in a list
    comments_analysis = []
    
    # Each comment is typically separated by a blank line. We can parse them with a regex or simply look for the prefix "Comment by".
    # Let's go with a straightforward approach:
    current_comment_author = None
    current_comment_text = []

    for line in lines:
        line = line.strip()
        if line.startswith("Comment by"):
            # If there's a comment in progress, analyze it first
            if current_comment_text:
                # Join the lines of the previous comment
                combined_text = " ".join(current_comment_text)
                analysis_result = analyze_sentiment2(combined_text)
                comments_analysis.append({
                    "author": current_comment_author,
                    "comment": combined_text,
                    "analysis": analysis_result
                })
            
            # Start a new comment
            # e.g., "Comment by SomeUser: This is a comment"
            match = re.match(r'^Comment by (.*?): (.*)$', line)
            if match:
                current_comment_author = match.group(1)
                first_line_comment_text = match.group(2)
                current_comment_text = [first_line_comment_text] if first_line_comment_text else []
            else:
                # If we can't parse it, treat the whole line as text
                current_comment_author = "unknown"
                current_comment_text = [line]

        else:
            # Continuation of the same comment (e.g., if the comment had new lines)
            if line:
                current_comment_text.append(line)

    # Process the last comment if there's any leftover
    if current_comment_text:
        combined_text = " ".join(current_comment_text)
        analysis_result = analyze_sentiment2(combined_text)
        comments_analysis.append({
            "author": current_comment_author,
            "comment": combined_text,
            "analysis": analysis_result
        })

    # Now store the entire list in a JSON file
    base_name = os.path.splitext(os.path.basename(file_path))[0]
    analysis_filename = f"{base_name}_analysis.json"
    save_path = os.path.join(ANALYSIS_FOLDER, analysis_filename)
    with open(save_path, 'w', encoding='utf-8') as out_f:
        json.dump(comments_analysis, out_f, indent=2)

    print(f"Analyzed comments file: {file_path}, saved analysis to: {save_path}")

def analyse_all_posts_and_comments():
    # Go through each file in reddit_data
    for filename in os.listdir(DATA_FOLDER):
        file_path = os.path.join(DATA_FOLDER, filename)
        
        if filename.endswith("_post.txt"):
            # This is a post
            process_post_file(file_path)
        elif filename.endswith("_comments.txt"):
            # This is a comment file
            process_comments_file(file_path)
        else:
            # Ignore any other file
            pass

def analyse_all_posts_and_comments_combined():
    # Create the output directory if it doesn't exist
    combined_analysis_folder = 'analysis_results_combined_gemini'
    os.makedirs(combined_analysis_folder, exist_ok=True)

    # Prepare a dictionary to store filename -> sentiment_json
    results_dict = {}

    # Loop through files in "combined_data"
    for filename in os.listdir("combined_data"):
        file_path = os.path.join("combined_data", filename)
        
        # Load text and analyze it
        text_content = load_text_from_file(file_path)
        sentiment_json = analyze_sentiment2(text_content)

        # Store the result in the dictionary
        results_dict[filename] = sentiment_json

    # Build the output filename based on today's date, e.g. "20250310_combined.json"
    today_str = datetime.now().strftime('%Y%m%d')
    output_filename = f"{today_str}_combined.json"
    output_file_path = os.path.join(combined_analysis_folder, output_filename)

    # Save the dictionary to a JSON file
    with open(output_file_path, 'w', encoding='utf-8') as out_f:
        json.dump(results_dict, out_f, indent=2)

    print(f"Combined analysis saved to: {output_file_path}")
    
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


def compute_sentiment_counts(analysis_dir="analysis_results_gemini"):
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

    # ----------------------
    # Save sentiment_counts
    # ----------------------
    output_file = os.path.join(analysis_dir, "sentiment_count.json")
    with open(output_file, 'w', encoding='utf-8') as out_f:
        json.dump(sentiment_counts, out_f, indent=2)

    print(f"Sentiment counts saved to {output_file}")

if __name__ == "__main__":
    # Replace with your actual API key and file path
    api_key = GOOGLE_GEMINI_API_KEY
    
    today_str = datetime.now().strftime('%Y%m%d')

    #combine_post_and_comments()
    #analyse_all_posts_and_comments()
    # analyse_all_posts_and_comments_combined()
    compute_sentiment_counts()