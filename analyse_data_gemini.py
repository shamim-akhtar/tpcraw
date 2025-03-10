from dotenv import load_dotenv
import google.generativeai as genai
import os

# Load environment variables
load_dotenv()

GOOGLE_GEMINI_API_KEY = os.getenv('GOOGLE_GEMINI_API_KEY')

# 2) Folder where your existing Reddit data is stored
DATA_FOLDER = 'reddit_data'

# 3) Folder where we'll save our analysis results
ANALYSIS_FOLDER = 'analysis_results_gemini'
os.makedirs(ANALYSIS_FOLDER, exist_ok=True)


def analyze_sentiment(text, api_key):
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

def load_text_from_file(filepath):
    """
    Reads the entire post file as a single text, then calls analyze_text.
    Saves the analysis as JSON in ANALYSIS_FOLDER.
    """
    # Example file name:  "abc123_post.txt"
    with open(filepath, 'r', encoding='utf-8') as f:
        text_content = f.read()
        return text_content


if __name__ == "__main__":
    # Replace with your actual API key and file path
    api_key = GOOGLE_GEMINI_API_KEY
    
    text = ""
    # Go through each file in reddit_data
    for filename in os.listdir(DATA_FOLDER):
        file_path = os.path.join(DATA_FOLDER, filename)
        
        if filename.endswith("_post.txt"):
            # This is a post
            text += load_text_from_file(file_path)
        elif filename.endswith("_comments.txt"):
            # This is a comment file
            text += load_text_from_file(file_path)
        else:
            # Ignore any other file
            pass

    if text:
        sentiment = analyze_sentiment(text, api_key)
        if sentiment:
            print(f"Sentiment: {sentiment}")
    else:
        print("Could not retrieve text from file.")