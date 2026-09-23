import chromadb

try:
    client = chromadb.PersistentClient(path="chroma_db")
    collections = client.list_collections()
    print(f"Found {len(collections)} collection(s).")
    
    for col in collections:
        print(f"\n--- Collection: {col.name} ---")
        try:
            # col is either a string or a Collection object depending on chromadb version
            collection_name = col.name if hasattr(col, 'name') else col
            collection = client.get_collection(collection_name)
            
            # Fetch a few items
            data = collection.peek(limit=3)
            
            if data and data.get('ids'):
                print(f"Total items in peek: {len(data['ids'])}")
                for i in range(len(data['ids'])):
                    print(f"\n[Item {i+1}]")
                    print(f"ID: {data['ids'][i]}")
                    
                    if data.get('metadatas') and data['metadatas'][i]:
                        print(f"Metadata: {data['metadatas'][i]}")
                        
                    if data.get('documents') and data['documents'][i]:
                        doc_snippet = str(data['documents'][i]).replace('\n', ' ')
                        print(f"Content: {doc_snippet[:200]}...")
            else:
                print("Collection is empty or no items returned by peek.")
                
        except Exception as e:
            print(f"Error reading collection: {e}")
            
except Exception as e:
    print(f"Error connecting to ChromaDB: {e}")
