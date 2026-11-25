// Conversational Orchestrator & Autonomous Sales Agent
const ragEngine = require('../rag/ragEngine');
const sentimentAnalyzer = require('./sentiment');
const qualificationEngine = require('./qualification');
const calendarService = require('../crm/calendarService');
const crmStore = require('../crm/crmStore');
const summarizer = require('../analytics/summarizer');
const config = require('../config');

class ConversationEngine {
  constructor() {
    this.sessions = new Map(); // sessionId -> sessionData
  }

  getOrCreateSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        startTime: Date.now(),
        transcript: [],
        bantResult: {
          bant: {
            budget: { status: 'Pending', score: 0 },
            authority: { status: 'Pending', score: 0 },
            need: { status: 'Pending', score: 0 },
            timeline: { status: 'Pending', score: 0 }
          },
          totalScore: 0,
          classification: 'New Prospect',
          recommendation: 'Conduct initial discovery'
        },
        sentimentHistory: [],
        ragCitations: [],
        lead: {
          id: `LEAD-${Date.now().toString().slice(-4)}`,
          name: 'Prospective Buyer',
          company: 'Acme Corp',
          email: '',
          stage: 'Contacted',
          score: 15
        },
        appointment: null,
        language: 'en',
        state: 'GREETING'
      });
    }
    return this.sessions.get(sessionId);
  }

  detectLanguage(text) {
    if (!text) return 'en';
    const lower = text.toLowerCase();
    // Spanish
    if (/\b(hola|buenos dias|buenas tardes|precio|cuanto|gracias|empresa|ayuda|hablas español)\b/i.test(lower)) return 'es';
    // Hindi
    if (/\b(namaste|kaise|aap|kya|shukriya|daam|kimat|hindi)\b/i.test(lower) || /[\u0900-\u097F]/.test(text)) return 'hi';
    // French
    if (/\b(bonjour|salut|merci|combien|prix|comment|francais)\b/i.test(lower)) return 'fr';
    // German
    if (/\b(hallo|guten tag|danke|kosten|preis|wie viel|deutsch)\b/i.test(lower)) return 'de';
    // Japanese
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text) || /\b(konnichiwa|arigatou)\b/i.test(lower)) return 'ja';
    return 'en';
  }

  async processTurn(sessionId, userSpeech, clientMetadata = {}) {
    const session = this.getOrCreateSession(sessionId);

    // Merge client lead metadata if provided
    if (clientMetadata.lead) {
      session.lead = { ...session.lead, ...clientMetadata.lead };
    }

    // 1. Language Detection & Adaptation
    const detectedLang = clientMetadata.language || this.detectLanguage(userSpeech);
    session.language = detectedLang;

    // 2. Real-time Sentiment Analysis
    const sentiment = sentimentAnalyzer.analyze(userSpeech);
    session.sentimentHistory.push(sentiment);

    // 3. Append to Multi-Turn History
    session.transcript.push({
      role: 'user',
      text: userSpeech,
      sentiment: sentiment.label,
      timestamp: new Date().toISOString()
    });

    // 4. RAG Knowledge Base Retrieval
    const ragMatches = ragEngine.search(userSpeech, 3);
    ragMatches.forEach(m => {
      if (!session.ragCitations.some(c => c.id === m.id)) {
        session.ragCitations.push(m);
      }
    });

    // 5. BANT Lead Qualification & Scoring
    const qualification = qualificationEngine.evaluate(session.transcript, session.bantResult.bant);
    session.bantResult = qualification;
    session.lead.score = qualification.totalScore;
    session.lead.bant = {
      budget: qualification.bant.budget?.details || qualification.bant.budget?.status,
      authority: qualification.bant.authority?.role || qualification.bant.authority?.status,
      need: (qualification.bant.need?.painPoints || []).join('; ') || qualification.bant.need?.status,
      timeline: qualification.bant.timeline?.timeframe || qualification.bant.timeline?.status
    };

    // 6. Check for Calendar Booking Triggers
    let bookingAction = null;
    const lower = userSpeech.toLowerCase();
    const isBookingIntent = /\b(book|schedule|calendar|demo|slot|time|meet|appointment|yes please|sounds good|let's do it|sure)\b/i.test(lower) && session.state === 'BOOKING_OFFER';
    const isDirectBookingRequest = /\b(book a demo|schedule a demo|schedule a call|set up a meeting)\b/i.test(lower);

    if (isBookingIntent || isDirectBookingRequest) {
      const openSlots = calendarService.getSlots();
      if (openSlots.length > 0) {
        const booked = calendarService.bookSlot(openSlots[0].id, session.lead);
        if (booked.success) {
          session.appointment = {
            id: booked.slot.id,
            date: booked.slot.date,
            time: booked.slot.time,
            slotText: `${booked.slot.date} at ${booked.slot.time}`,
            host: booked.slot.host,
            icsContent: booked.icsContent
          };
          session.lead.stage = 'Demo Scheduled';
          session.lead.appointment = session.appointment.slotText;
          session.state = 'CONFIRMED';
          bookingAction = session.appointment;

          // Sync to CRM store
          crmStore.addAppointment({
            leadId: session.lead.id,
            leadName: session.lead.name || 'Prospective Lead',
            company: session.lead.company,
            host: booked.slot.host,
            dateTime: booked.slot.isoDateTime,
            slotText: session.appointment.slotText
          });
        }
      }
    }

    // 7. Generate Intelligent Response
    const agentResponse = this.composeResponse(session, userSpeech, ragMatches, sentiment, bookingAction);

    session.transcript.push({
      role: 'agent',
      text: agentResponse.speechText,
      timestamp: new Date().toISOString()
    });

    // 8. Sync Lead to CRM
    crmStore.upsertLead({
      id: session.lead.id,
      name: session.lead.name,
      company: session.lead.company,
      email: session.lead.email || `${session.lead.name.toLowerCase().replace(/\s+/g, '')}@example.com`,
      score: session.bantResult.totalScore,
      stage: session.lead.stage,
      sentiment: `${sentiment.label} (${sentiment.score})`,
      bant: session.lead.bant,
      appointment: session.appointment ? session.appointment.slotText : null
    });

    return {
      agentText: agentResponse.speechText,
      language: session.language,
      sentiment,
      ragResults: ragMatches,
      qualification: session.bantResult,
      booking: session.appointment,
      state: session.state,
      lead: session.lead
    };
  }

  composeResponse(session, userSpeech, ragMatches, sentiment, bookingAction) {
    const lang = session.language;
    const lower = userSpeech.toLowerCase();

    // 1. Handling Multilingual Responses
    if (lang === 'es') {
      if (bookingAction) {
        return {
          speechText: `¡Excelente! He agendado nuestra demostración para el ${bookingAction.slotText} con ${bookingAction.host}. Le envié la invitación con el enlace de Google Meet. ¿Hay algo más que le gustaría revisar?`
        };
      }
      if (ragMatches.length > 0 && /precio|costo/i.test(lower)) {
        return {
          speechText: `Nuestros planes comienzan en $499 al mes para el plan Starter, $1,499 para Growth, y $4,999 para Enterprise con minutos ilimitados y soporte SOC2 y HIPAA. ¿Le gustaría que agendemos una demostración en vivo esta semana?`
        };
      }
      return {
        speechText: `Hola, soy Ava de ApexAI. Diseñamos agentes de voz autónomos con latencia inferior a 450 milisegundos e integración CRM en tiempo real. ¿Cuál es el principal desafío que busca resolver en su equipo de ventas?`
      };
    }

    if (lang === 'hi') {
      if (bookingAction) {
        return {
          speechText: `बहुत बढ़िया! आपकी डेमो कॉल ${bookingAction.slotText} को ${bookingAction.host} के साथ बुक कर दी गई है। क्या आप कुछ और जानना चाहते हैं?`
        };
      }
      return {
        speechText: `नमस्ते! मैं एपेक्स एआई से अवा हूँ। हमारा स्वायत्त एआई वॉयस एजेंट आपकी सेल्स टीम के लिए 24/7 लीड्स को क्वालिफाई और कन्वर्ट करता है। क्या आप इसके बारे में और जानना चाहेंगे?`
      };
    }

    // 2. English Response Logic
    if (bookingAction) {
      return {
        speechText: `Fantastic! I've locked in your executive demo for ${bookingAction.slotText} with ${bookingAction.host}. A calendar invite with the Google Meet link has been generated. What specific workflow would you like our team to showcase first?`
      };
    }

    // A. Greeting or Initial Hello
    if (session.transcript.length <= 2 && /\b(hi|hello|hey|good morning|who are you|what do you do)\b/i.test(lower)) {
      session.state = 'DISCOVERY';
      return {
        speechText: `Hello! I'm Ava, Senior Solutions Executive at ApexAI. We help high-growth sales teams deploy autonomous voice agents that qualify inbound and outbound leads 24/7 with sub-450ms latency. Are you looking to scale outbound pipeline or automate inbound response time?`
      };
    }

    // B. Objection Handling: "Expensive" or "Cost"
    if (/\b(expensive|cost|budget|afford|too much|cheaper)\b/i.test(lower) && ragMatches.some(r => r.id === 'roi-metrics' || r.id === 'pricing-tiers')) {
      session.state = 'OBJECTION_HANDLING';
      return {
        speechText: `I completely understand budget sensitivity. While a human SDR costs over $75,000 annually with benefits for 70 calls a day, ApexAI operates at about 4 cents a call minute and scales to 10,000 dials a day. Our clients typically see a 65% reduction in CAC with a full payback in under 28 days. Given your scale, would our $1,499 Growth plan or $4,999 Enterprise tier be a closer fit?`
      };
    }

    // C. Objection Handling: "Sounds robotic / fake"
    if (/\b(robotic|unnatural|fake|robot|sound human)\b/i.test(lower)) {
      session.state = 'OBJECTION_HANDLING';
      return {
        speechText: `That's a very fair concern. Most bots sound rigid, but ApexAI uses streaming neural prosody, micro-pauses, and sub-450ms turn-taking. In double-blind benchmarks across 50,000 calls, 94% of prospects could not tell Ava was an AI in the first 3 minutes. I can show you live audio clips on a demo—would Tuesday or Wednesday work better?`
      };
    }

    // D. Objection Handling: "Replace human SDRs"
    if (/\b(replace|lay off|human reps|my team)\b/i.test(lower)) {
      session.state = 'OBJECTION_HANDLING';
      return {
        speechText: `Not at all! We believe in empowering reps, not replacing them. Human SDRs spend nearly 70% of their day hitting voicemails and manual CRM logging. Ava takes over the repetitive cold dialing and instant 1-minute lead triage, feeding pre-qualified pipeline directly to your closers. How many SDRs are on your team currently?`
      };
    }

    // E. Answering Pricing Questions
    if (/\b(how much|pricing|price|cost|tiers|plans)\b/i.test(lower)) {
      session.state = 'BOOKING_OFFER';
      return {
        speechText: `We offer three tiers: Starter at $499 a month for 500 minutes, Growth at $1,499 for 2,500 minutes with automated BANT qualification, and Enterprise at $4,999 for unlimited concurrency, custom voice cloning, and SOC2 compliance. Based on your volume, shall we schedule a quick 15-minute architecture walkthrough to calculate your exact ROI?`
      };
    }

    // F. Answering Security, HIPAA & Compliance
    if (/\b(security|hipaa|soc2|gdpr|privacy|safe|encrypt)\b/i.test(lower)) {
      session.state = 'QUALIFICATION';
      return {
        speechText: `Security is core to our architecture: we are SOC2 Type II certified and sign enterprise BAAs for full HIPAA compliance. All voice streams are TLS 1.3 encrypted, PII is masked at the edge, and we enforce a strict Zero Data Retention policy for LLM training. Are compliance audits a requirement for your team's signoff?`
      };
    }

    // G. Answering Architecture & Latency
    if (/\b(latency|architecture|webrtc|sip|tech|whisper|deepgram|elevenlabs)\b/i.test(lower)) {
      session.state = 'QUALIFICATION';
      return {
        speechText: `Under the hood, we leverage an event-driven WebRTC and SIP telephony bridge with streaming Whisper STT, fine-tuned LLaMA/Gemini models for sub-300ms inference, and neural voice synthesis with dynamic barge-in interruption. This keeps end-to-end latency under 450ms. Would you like to review our technical architecture diagram on a brief video call?`
      };
    }

    // H. High Score Lead -> Push for Booking
    if (session.bantResult.totalScore >= 50 && session.state !== 'BOOKING_OFFER') {
      session.state = 'BOOKING_OFFER';
      const openSlot = calendarService.getSlots()[0];
      const slotText = openSlot ? `${openSlot.date} at ${openSlot.time}` : 'tomorrow afternoon';
      return {
        speechText: `Based on your timeline and requirements, ApexAI looks like an ideal fit to scale your pipeline. I have an open slot with our Principal AE, Sarah Chen, on ${slotText}. Would that time work for a tailored 15-minute live demo?`
      };
    }

    // Default RAG-grounded response
    if (ragMatches.length > 0) {
      const topMatch = ragMatches[0];
      session.state = 'DISCOVERY';
      return {
        speechText: `${topMatch.content.slice(0, 220)}... We can easily tailor this to your sales workflow. What is your target timeline for evaluating a solution?`
      };
    }

    // Fallback response
    return {
      speechText: `I see. ApexAI integrates seamlessly with your CRM and outbound dialers to automate qualified meeting bookings. Could you tell me a bit about your current monthly lead volume and the size of your sales team?`
    };
  }

  endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.duration = Math.round((Date.now() - session.startTime) / 1000);
    const summary = summarizer.generateSummary(session);

    // Final CRM sync
    crmStore.addActivity({
      leadId: session.lead.id,
      type: 'Completed Voice Call',
      summary: summary.execSummary,
      score: summary.leadScore,
      actionItems: summary.actionItems,
      durationSeconds: session.duration
    });

    crmStore.upsertLead({
      id: session.lead.id,
      name: session.lead.name,
      company: session.lead.company,
      score: summary.leadScore,
      stage: session.appointment ? 'Demo Scheduled' : (summary.leadScore >= 75 ? 'Hot Lead' : 'Qualified'),
      summary: summary.execSummary
    });

    return summary;
  }
}

module.exports = new ConversationEngine();
