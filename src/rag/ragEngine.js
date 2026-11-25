// TF-IDF & Semantic Cosine Similarity RAG Retrieval Engine
const fs = require('fs');
const path = require('path');

class RAGEngine {
  constructor(kbPath = path.join(__dirname, 'knowledgeBase.json')) {
    this.kbPath = kbPath;
    this.documents = [];
    this.vocabulary = new Map(); // term -> index
    this.idf = new Map(); // term -> idf value
    this.docVectors = [];
    this.loadKnowledgeBase();
  }

  loadKnowledgeBase() {
    try {
      const raw = fs.readFileSync(this.kbPath, 'utf8');
      this.documents = JSON.parse(raw);
      this.indexDocuments();
    } catch (err) {
      console.error('Failed to load RAG knowledge base:', err.message);
      this.documents = [];
    }
  }

  tokenize(text) {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^\w\s$]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !this.isStopword(w));
  }

  isStopword(w) {
    const stops = new Set([
      'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'in', 'to', 'for', 'of', 'with',
      'that', 'it', 'as', 'are', 'was', 'be', 'this', 'our', 'we', 'you', 'your', 'i', 'my'
    ]);
    return stops.has(w);
  }

  indexDocuments() {
    const N = this.documents.length;
    if (N === 0) return;

    const docFreq = new Map(); // term -> doc count
    const tokenizedDocs = [];

    this.documents.forEach((doc, idx) => {
      const allText = `${doc.title} ${doc.content} ${(doc.keywords || []).join(' ')}`;
      const tokens = this.tokenize(allText);
      tokenizedDocs.push(tokens);

      const uniqueTokens = new Set(tokens);
      uniqueTokens.forEach(t => {
        docFreq.set(t, (docFreq.get(t) || 0) + 1);
      });
    });

    // Build vocabulary & IDF
    let vocabIndex = 0;
    docFreq.forEach((df, term) => {
      this.vocabulary.set(term, vocabIndex++);
      // Smoothed IDF
      this.idf.set(term, Math.log((N + 1) / (df + 1)) + 1);
    });

    // Build TF-IDF vectors for all documents
    this.docVectors = tokenizedDocs.map(tokens => this.vectorizeTokens(tokens));
  }

  vectorizeTokens(tokens) {
    const tf = new Map();
    tokens.forEach(t => tf.set(t, (tf.get(t) || 0) + 1));

    const vector = new Float32Array(this.vocabulary.size);
    let normSq = 0;

    tf.forEach((count, term) => {
      if (this.vocabulary.has(term)) {
        const idx = this.vocabulary.get(term);
        const tfVal = count / tokens.length;
        const idfVal = this.idf.get(term) || 1;
        const weight = tfVal * idfVal;
        vector[idx] = weight;
        normSq += weight * weight;
      }
    });

    // L2 Normalize
    const norm = Math.sqrt(normSq);
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }
    return vector;
  }

  cosineSimilarity(v1, v2) {
    let dot = 0;
    const len = Math.min(v1.length, v2.length);
    for (let i = 0; i < len; i++) {
      dot += v1[i] * v2[i];
    }
    return dot;
  }

  search(query, topK = 3, minScore = 0.08) {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    const queryVec = this.vectorizeTokens(queryTokens);
    const results = [];

    this.docVectors.forEach((docVec, i) => {
      let score = this.cosineSimilarity(queryVec, docVec);
      
      // Bonus boost for exact keyword hits
      const lowerQuery = query.toLowerCase();
      const doc = this.documents[i];
      if (doc.keywords) {
        doc.keywords.forEach(kw => {
          if (lowerQuery.includes(kw.toLowerCase())) {
            score += 0.15;
          }
        });
      }

      if (score >= minScore) {
        results.push({
          score: Math.min(1.0, Math.round(score * 100) / 100),
          id: doc.id,
          category: doc.category,
          title: doc.title,
          content: doc.content
        });
      }
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}

module.exports = new RAGEngine();
