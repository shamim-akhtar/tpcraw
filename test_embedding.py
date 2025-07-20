import os, sys, traceback
import vertexai

# Try new preview API; fallback to legacy.
try:
    from vertexai.preview import text_embedding
    API_MODE = "preview"
except ImportError:
    from vertexai.language_models import TextEmbeddingModel, TextEmbeddingInput
    API_MODE = "legacy"

PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT")
REGION  = os.getenv("GOOGLE_CLOUD_REGION", "us-central1")

if not PROJECT:
    print("❌ GOOGLE_CLOUD_PROJECT not set")
    sys.exit(1)

vertexai.init(project=PROJECT, location=REGION)
print(f"➡️  Vertex AI init (project={PROJECT}, region={REGION}, mode={API_MODE})")

def embed_document(text, dim=256):
    if API_MODE == "preview":
        inp = text_embedding.TextEmbeddingInput(text=text, task_type="RETRIEVAL_DOCUMENT")
        model = text_embedding.TextEmbeddingModel.from_pretrained("text-embedding-004")
        return model.get_embeddings([inp], output_dimensionality=dim)[0].values
    else:
        inp = TextEmbeddingInput(text=text, task_type="RETRIEVAL_DOCUMENT")
        model = TextEmbeddingModel.from_pretrained("text-embedding-004")
        return model.get_embeddings([inp], output_dimensionality=dim)[0].values

def embed_query(text, dim=256):
    if API_MODE == "preview":
        inp = text_embedding.TextEmbeddingInput(text=text, task_type="RETRIEVAL_QUERY")
        model = text_embedding.TextEmbeddingModel.from_pretrained("text-embedding-004")
        return model.get_embeddings([inp], output_dimensionality=dim)[0].values
    else:
        inp = TextEmbeddingInput(text=text, task_type="RETRIEVAL_QUERY")
        model = TextEmbeddingModel.from_pretrained("text-embedding-004")
        return model.get_embeddings([inp], output_dimensionality=dim)[0].values

try:
    doc_vec = embed_document("Orientation feedback about campus facilities.")
    qry_vec = embed_query("What are students saying about orientation facilities?")

    print(f"✅ Doc embedding length: {len(doc_vec)}")
    print(f"✅ Query embedding length: {len(qry_vec)}")

    # Simple cosine similarity
    import math
    dot = sum(a*b for a,b in zip(doc_vec, qry_vec))
    mag_d = math.sqrt(sum(a*a for a in doc_vec))
    mag_q = math.sqrt(sum(a*a for a in qry_vec))
    cosine = dot / (mag_d * mag_q) if mag_d and mag_q else 0.0
    print(f"🔍 Cosine similarity: {cosine:.4f}")

except Exception as e:
    print("❌ Embedding test failed:", e)
    traceback.print_exc()
    sys.exit(1)
