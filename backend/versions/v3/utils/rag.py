import os
from typing import List, Dict, Optional
import chromadb
from chromadb.config import Settings

CHROMA_PATH = "shared_chroma_db"

GRADE_SUBJECTS = {
    4: ["Maths", "General Science"],
    5: ["Maths", "General Science"],
    6: ["Maths", "General Science", "Computer"],
    7: ["Maths", "General Science", "Computer"]
}

def get_chroma_client():
    """Initialize ChromaDB client"""
    try:
        client = chromadb.PersistentClient(path=CHROMA_PATH)
        return client
    except Exception as e:
        print(f"Error connecting to ChromaDB: {e}")
        return None

def get_collection(client, collection_name: str = "educational_content"):
    """Get or create a collection"""
    try:
        collection = client.get_or_create_collection(
            name=collection_name,
            metadata={"description": "Educational content for grades 4-7"}
        )
        return collection
    except Exception as e:
        print(f"Error getting collection: {e}")
        return None

def query_knowledge_base(
    query: str,
    grade: int,
    subject: str,
    n_results: int = 5
) -> List[Dict]:
    """Query the ChromaDB for relevant content"""
    client = get_chroma_client()
    if not client:
        return []
    
    collection = get_collection(client)
    if not collection:
        return []
    
    try:
        where_filter = {
            "$and": [
                {"grade": {"$eq": grade}},
                {"subject": {"$eq": subject}}
            ]
        }
        
        results = collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where_filter
        )
        
        documents = []
        if results and results['documents']:
            for i, doc in enumerate(results['documents'][0]):
                metadata = results['metadatas'][0][i] if results['metadatas'] else {}
                documents.append({
                    "content": doc,
                    "metadata": metadata,
                    "distance": results['distances'][0][i] if results['distances'] else None
                })
        
        return documents
    except Exception as e:
        print(f"Error querying knowledge base: {e}")
        return []

def get_available_topics(grade: int, subject: str) -> List[str]:
    """Get available topics for a grade and subject"""
    client = get_chroma_client()
    if not client:
        return []
    
    collection = get_collection(client)
    if not collection:
        return []
    
    try:
        results = collection.get(
            where={
                "$and": [
                    {"grade": {"$eq": grade}},
                    {"subject": {"$eq": subject}}
                ]
            }
        )
        
        topics = set()
        if results and results['metadatas']:
            for metadata in results['metadatas']:
                if 'topic' in metadata:
                    topics.add(metadata['topic'])
        
        return list(topics)
    except Exception as e:
        print(f"Error getting topics: {e}")
        return []

def format_context_for_prompt(documents: List[Dict]) -> str:
    """Format retrieved documents into context for the LLM"""
    if not documents:
        return ""
    
    context_parts = []
    for i, doc in enumerate(documents, 1):
        content = doc.get('content', '')
        metadata = doc.get('metadata', {})
        topic = metadata.get('topic', 'General')
        
        context_parts.append(f"[Reference {i} - {topic}]\n{content}")
    
    return "\n\n".join(context_parts)
