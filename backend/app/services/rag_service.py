import io
import os
import uuid
from typing import Any, Dict, List, Optional

# Fallbacks for langchain splitters
try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:
    try:
        from langchain.text_splitter import RecursiveCharacterTextSplitter
    except ImportError:
        class RecursiveCharacterTextSplitter:
            def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200):
                self.chunk_size = chunk_size
                self.chunk_overlap = chunk_overlap

            def split_text(self, text: str) -> List[str]:
                chunks = []
                start = 0
                while start < len(text):
                    end = min(start + self.chunk_size, len(text))
                    chunks.append(text[start:end])
                    if end == len(text):
                        break
                    start += self.chunk_size - self.chunk_overlap
                return chunks

# Fallbacks for rank_bm25
try:
    from rank_bm25 import BM25Okapi
except ImportError:
    class BM25Okapi:
        def __init__(self, corpus: List[List[str]]):
            self.corpus = corpus

        def get_scores(self, query_tokens: List[str]) -> List[float]:
            scores = []
            for doc in self.corpus:
                score = sum(1.0 for token in query_tokens if token in doc)
                scores.append(score)
            return scores

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CHROMA_DIR = os.path.join(BASE_DIR, "data", "chroma")
os.makedirs(CHROMA_DIR, exist_ok=True)

_embedding_model = None
_reranker_model = None


def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        from sentence_transformers import SentenceTransformer
        _embedding_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    return _embedding_model


def get_reranker_model():
    global _reranker_model
    if _reranker_model is None:
        from sentence_transformers import CrossEncoder
        _reranker_model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
    return _reranker_model


class RagService:
    def __init__(self):
        self._chroma_client = None

    @property
    def chroma_client(self):
        if self._chroma_client is None:
            import chromadb
            self._chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)
        return self._chroma_client

    def list_collections(self) -> List[str]:
        cols = self.chroma_client.list_collections()
        return [c.name for c in cols]

    def create_collection(self, name: str):
        self.chroma_client.get_or_create_collection(name=name)
        return {"status": "created", "collection": name}

    def delete_collection(self, name: str):
        self.chroma_client.delete_collection(name=name)
        return {"status": "deleted"}

    async def ingest_document(self, collection_name: str, filename: str, content: bytes) -> Dict[str, Any]:
        ext = os.path.splitext(filename)[1].lower()
        text = ""

        if ext == ".pdf":
            try:
                import pypdf
                reader = pypdf.PdfReader(io.BytesIO(content))
                for page in reader.pages:
                    t = page.extract_text()
                    if t:
                        text += t + "\n"
            except ImportError:
                raise ValueError("pypdf is not installed. PDF ingestion not available.")
        elif ext == ".docx":
            try:
                import docx
                doc = docx.Document(io.BytesIO(content))
                for p in doc.paragraphs:
                    text += p.text + "\n"
            except ImportError:
                raise ValueError("python-docx is not installed. DOCX ingestion not available.")
        elif ext in (".txt", ".md"):
            text = content.decode("utf-8", errors="replace")
        else:
            raise ValueError(f"Unsupported file type: {ext}")

        if not text.strip():
            raise ValueError("Document contains no readable text.")

        # Chunk the text
        splitter = RecursiveCharacterTextSplitter(chunk_size=600, chunk_overlap=120)
        chunks = splitter.split_text(text)

        if not chunks:
            raise ValueError("Text splitter did not generate any chunks.")

        # Get embeddings
        emb_model = get_embedding_model()
        # SentenceTransformers encode can take a list of strings and returns a list of embeddings
        embeddings = emb_model.encode(chunks).tolist()

        col = self.chroma_client.get_or_create_collection(name=collection_name)

        ids = [f"{filename}_{i}_{str(uuid.uuid4())[:8]}" for i in range(len(chunks))]
        metadatas = [{"source": filename, "chunk_index": i} for i in range(len(chunks))]

        col.add(
            ids=ids,
            documents=chunks,
            embeddings=embeddings,
            metadatas=metadatas
        )

        return {
            "status": "success",
            "filename": filename,
            "chunks_count": len(chunks),
        }

    async def hybrid_query(
        self,
        collection_name: str,
        query: str,
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        # Retrieve the collection
        try:
            col = self.chroma_client.get_collection(name=collection_name)
        except Exception:
            raise ValueError(f"Collection '{collection_name}' not found.")

        total_chunks = col.count()
        if total_chunks == 0:
            return []

        # 1. Semantic search
        emb_model = get_embedding_model()
        query_emb = emb_model.encode(query).tolist()
        
        # We query for more candidates than top_k for hybrid merge and rerank
        candidate_limit = min(top_k * 3, total_chunks)
        
        semantic_res = col.query(
            query_embeddings=[query_emb],
            n_results=candidate_limit
        )

        semantic_hits = []
        if semantic_res and "documents" in semantic_res and semantic_res["documents"]:
            docs = semantic_res["documents"][0]
            ids = semantic_res["ids"][0]
            metas = semantic_res["metadatas"][0]
            for d, id_, m in zip(docs, ids, metas):
                semantic_hits.append({
                    "id": id_,
                    "text": d,
                    "metadata": m,
                    "search_type": "semantic"
                })

        # 2. BM25 Search
        # Retrieve all items in the collection to compute BM25 (since BM25 is local to document corpus)
        all_data = col.get()
        all_docs = all_data.get("documents", [])
        all_ids = all_data.get("ids", [])
        all_metas = all_data.get("metadatas", [])

        bm25_hits = []
        if all_docs:
            tokenized_corpus = [doc.lower().split() for doc in all_docs]
            bm25 = BM25Okapi(tokenized_corpus)
            query_tokens = query.lower().split()
            bm25_scores = bm25.get_scores(query_tokens)

            # Zip and sort
            zipped = list(zip(all_ids, all_docs, all_metas, bm25_scores))
            zipped.sort(key=lambda x: x[3], reverse=True)
            
            for id_, doc, meta, score in zipped[:candidate_limit]:
                if score > 0:  # Only count keyword overlap
                    bm25_hits.append({
                        "id": id_,
                        "text": doc,
                        "metadata": meta,
                        "search_type": "keyword"
                    })

        # 3. Merge results
        merged_hits = {}
        # Union semantic and bm25 hits
        for hit in semantic_hits:
            merged_hits[hit["id"]] = hit
        for hit in bm25_hits:
            if hit["id"] not in merged_hits:
                merged_hits[hit["id"]] = hit
            else:
                merged_hits[hit["id"]]["search_type"] = "hybrid"

        combined_docs = list(merged_hits.values())
        if not combined_docs:
            return []

        # 4. Rerank using CrossEncoder
        rerank_model = get_reranker_model()
        pairs = [[query, doc["text"]] for doc in combined_docs]
        
        # Predict scores
        scores = rerank_model.predict(pairs)
        if hasattr(scores, "tolist"):
            scores = scores.tolist()

        for doc, score in zip(combined_docs, scores):
            doc["score"] = float(score)

        # Sort by rerank score descending
        combined_docs.sort(key=lambda x: x["score"], reverse=True)
        return combined_docs[:top_k]


rag_service = RagService()
