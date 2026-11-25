// Real-Time Sentiment & Emotional Valence Analysis Engine

class SentimentAnalyzer {
  constructor() {
    this.positiveWords = new Set([
      'great', 'excellent', 'awesome', 'good', 'love', 'perfect', 'fantastic', 'interested',
      'impressive', 'promising', 'definitely', 'yes', 'absolutely', 'excited', 'amazing',
      'helpful', 'valuable', 'efficient', 'fast', 'smooth', 'deal', 'schedule', 'book'
    ]);

    this.negativeWords = new Set([
      'bad', 'terrible', 'awful', 'slow', 'expensive', 'useless', 'doubt', 'hate', 'no',
      'cannot', 'impossible', 'hard', 'complicated', 'problem', 'worried', 'waste', 'poor',
      'unhappy', 'annoying', 'buggy', 'disappointed', 'cancel', 'never'
    ]);

    this.skepticalWords = new Set([
      'really', 'maybe', 'skeptical', 'unsure', 'competitor', 'how', 'why', 'prove',
      'claim', 'costly', 'risk', 'not sure', 'if', 'guarantee', 'hidden'
    ]);
  }

  analyze(text) {
    if (!text || typeof text !== 'string') {
      return { score: 0, label: 'Neutral', valence: 'neutral', confidence: 0.5, markers: [] };
    }

    const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    let posCount = 0;
    let negCount = 0;
    let skepCount = 0;
    const markers = [];

    words.forEach(w => {
      if (this.positiveWords.has(w)) {
        posCount++;
        markers.push({ word: w, type: 'positive' });
      }
      if (this.negativeWords.has(w)) {
        negCount++;
        markers.push({ word: w, type: 'negative' });
      }
      if (this.skepticalWords.has(w)) {
        skepCount++;
        markers.push({ word: w, type: 'skeptical' });
      }
    });

    const totalSignals = posCount + negCount + skepCount;
    let score = 0; // -1.0 to +1.0

    if (totalSignals > 0) {
      score = (posCount - negCount - 0.3 * skepCount) / (totalSignals + 1);
      score = Math.max(-1.0, Math.min(1.0, Math.round(score * 100) / 100));
    }

    let label = 'Neutral';
    let valence = 'neutral';
    if (score >= 0.25) {
      label = 'Positive';
      valence = score > 0.6 ? 'enthusiastic' : 'receptive';
    } else if (score <= -0.25) {
      label = 'Negative';
      valence = negCount > 1 ? 'frustrated' : 'resistant';
    } else if (skepCount > 0) {
      label = 'Skeptical';
      valence = 'evaluating';
    }

    const confidence = Math.min(0.95, Math.round((0.5 + totalSignals * 0.1) * 100) / 100);

    return {
      score,
      label,
      valence,
      confidence,
      markers
    };
  }
}

module.exports = new SentimentAnalyzer();
