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
        topicsCovered: new Set(),
        lead: {
          id: `LEAD-${Date.now().toString().slice(-4)}`,
          name: 'Alex Mercer',
          company: 'Enterprise Solutions',
          email: 'alex.mercer@enterprise.com',
          stage: 'Contacted',
          score: 15
        },
        appointment: null,
        language: 'en',
        state: 'DISCOVERY'
      });
    }
    return this.sessions.get(sessionId);
  }

  detectLanguage(text) {
    if (!text) return 'en';
    const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    // Spanish Detection
    if (/\b(hola|buenos dias|buenas tardes|precio|precios|cuanto|gracias|empresa|ayuda|hablas espanol|espanol|gustaria|conocer|necesito|quiero|planes|costo|costos)\b/i.test(normalized) || /[¿¡]/.test(text)) {
      return 'es';
    }
    // Hindi Detection
    if (/\b(namaste|kaise|aap|kya|shukriya|daam|kimat|hindi)\b/i.test(normalized) || /[\u0900-\u097F]/.test(text)) {
      return 'hi';
    }
    // French Detection
    if (/\b(bonjour|salut|merci|combien|prix|comment|francais)\b/i.test(normalized)) {
      return 'fr';
    }
    // German Detection
    if (/\b(hallo|guten tag|danke|kosten|preis|wie viel|deutsch)\b/i.test(normalized)) {
      return 'de';
    }
    // Japanese Detection
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text) || /\b(konnichiwa|arigatou)\b/i.test(normalized)) {
      return 'ja';
    }
    return 'en';
  }

  extractRequirements(text, session) {
    const lower = text.toLowerCase();
    const reqs = [];

    // CRMs
    if (/hubspot/i.test(lower)) reqs.push('HubSpot Integration');
    if (/salesforce/i.test(lower)) reqs.push('Salesforce Integration');
    if (/zoho/i.test(lower)) reqs.push('Zoho CRM');
    if (/pipedrive/i.test(lower)) reqs.push('Pipedrive CRM');
    if (/webhook|api/i.test(lower)) reqs.push('Webhooks & REST API');

    // Telephony
    if (/webrtc|sip|twilio|telephony|phone system/i.test(lower)) reqs.push('SIP/WebRTC Telephony');

    // Volume
    if (/\b\d+[\d,]*\s*(leads|calls|minutes|dials)\b/i.test(lower) || /volume|speed to lead/i.test(lower)) {
      reqs.push('High Volume Capacity');
    }

    // Security
    if (/hipaa|soc2|gdpr|compliance|security/i.test(lower)) reqs.push('HIPAA / SOC2 Compliance');

    // Multilingual
    if (/spanish|hindi|french|german|japanese|multilingual|idiomas|espanol/i.test(lower)) {
      reqs.push('Multilingual 24/7 Coverage');
    }

    return reqs;
  }

  async processTurn(sessionId, userSpeech, clientMetadata = {}) {
    const session = this.getOrCreateSession(sessionId);

    if (clientMetadata.lead) {
      session.lead = { ...session.lead, ...clientMetadata.lead };
    }

    // 1. Dynamic Language Detection (Utterance language overrides default unless explicitly set)
    const autoLang = this.detectLanguage(userSpeech);
    const detectedLang = autoLang !== 'en' ? autoLang : (clientMetadata.language || 'en');
    session.language = detectedLang;

    // 2. Real-time Sentiment Analysis
    const sentiment = sentimentAnalyzer.analyze(userSpeech);
    session.sentimentHistory.push(sentiment);

    // 3. Extract Specific Technical & Business Requirements
    const extractedReqs = this.extractRequirements(userSpeech, session);

    // 4. Append User Utterance to Transcript
    session.transcript.push({
      role: 'user',
      text: userSpeech,
      sentiment: sentiment.label,
      requirements: extractedReqs,
      timestamp: new Date().toISOString()
    });

    // 5. RAG Knowledge Base Retrieval
    const ragMatches = ragEngine.search(userSpeech, 4);
    ragMatches.forEach(m => {
      if (!session.ragCitations.some(c => c.id === m.id)) {
        session.ragCitations.push(m);
      }
    });

    // 6. BANT Lead Qualification & Scoring
    const qualification = qualificationEngine.evaluate(session.transcript, session.bantResult.bant);
    session.bantResult = qualification;
    session.lead.score = qualification.totalScore;
    session.lead.bant = {
      budget: qualification.bant.budget?.details || qualification.bant.budget?.status,
      authority: qualification.bant.authority?.role || qualification.bant.authority?.status,
      need: (qualification.bant.need?.painPoints || []).join('; ') || qualification.bant.need?.status,
      timeline: qualification.bant.timeline?.timeframe || qualification.bant.timeline?.status
    };

    // 7. Check for Calendar Booking Triggers
    let bookingAction = null;
    const lower = userSpeech.toLowerCase();
    const isBookingIntent = /\b(book|schedule|calendar|demo|slot|time|meet|appointment|yes please|sounds good|let's do it|sure|thursday|tuesday|wednesday|friday|tomorrow)\b/i.test(lower) && 
      (session.state === 'BOOKING_OFFER' || /demo|schedule|call|meet/i.test(lower));
    const isDirectBookingRequest = /\b(book a demo|schedule a demo|schedule a call|set up a meeting|book it)\b/i.test(lower);

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

    // 8. Generate Specific Response
    const agentResponse = this.composeResponse(session, userSpeech, ragMatches, sentiment, bookingAction, extractedReqs);

    session.transcript.push({
      role: 'agent',
      text: agentResponse.speechText,
      timestamp: new Date().toISOString()
    });

    // 9. Sync Lead to CRM
    crmStore.upsertLead({
      id: session.lead.id,
      name: session.lead.name,
      company: session.lead.company,
      email: session.lead.email || `${session.lead.name.toLowerCase().replace(/\s+/g, '')}@enterprise.com`,
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

  composeResponse(session, userSpeech, ragMatches, sentiment, bookingAction, extractedReqs) {
    const lang = session.language;
    const lower = userSpeech.toLowerCase().trim();
    const cleanLower = userSpeech.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    // ==========================================
    // 1. SPANISH LANGUAGE RESPONSES
    // ==========================================
    if (lang === 'es') {
      if (bookingAction) {
        return {
          speechText: `¡Excelente! He agendado nuestra demostración para el ${bookingAction.slotText} con ${bookingAction.host}. Le envié la invitación con el enlace de Google Meet. ¿Hay algún requisito técnico específico que desee revisar en la reunión?`
        };
      }
      if (/precio|precios|costo|costos|planes|cuanto|tarifa/i.test(cleanLower)) {
        session.state = 'BOOKING_OFFER';
        return {
          speechText: `¡Hola! Sí, hablo español perfectamente. En ApexAI ofrecemos tres planes: Starter a $499 al mes para 500 minutos, Growth a $1,499 para 2,500 minutos con calificación BANT automática e integración CRM, y Enterprise a $4,999 con llamadas ilimitadas y soporte SOC2 y HIPAA. ¿Cuántas llamadas o clientes potenciales maneja su empresa al mes?`
        };
      }
      if (/seguridad|hipaa|soc2|privacidad|datos/i.test(cleanLower)) {
        return {
          speechText: `La seguridad es primordial en ApexAI: contamos con certificación SOC2 Tipo II, firmamos acuerdos BAA para HIPAA, y ciframos todo con TLS 1.3 y AES-256 con política de cero retención de datos. ¿Su equipo requiere auditorías de seguridad?`
        };
      }
      if (/crm|hubspot|salesforce|zoho|integrar/i.test(cleanLower)) {
        return {
          speechText: `Sí, nos integramos de forma bidireccional con Salesforce, HubSpot, Zoho y Webhooks en tiempo real, guardando transcripciones completas y notas de calificación BANT automáticamente. ¿Qué CRM utiliza su equipo actualmente?`
        };
      }
      if (/demostracion|demo|agendar|reunion|cita/i.test(cleanLower)) {
        session.state = 'BOOKING_OFFER';
        return {
          speechText: `¡Con gusto! Puedo reservar una demostración personalizada con nuestra Ejecutiva Principal, Sarah Chen. ¿Le vendría bien este jueves a las 2:00 PM EST?`
        };
      }
      return {
        speechText: `¡Hola! Sí, hablo español con fluidez. Soy Ava de ApexAI. Automatizamos llamadas de ventas con voz humana y latencia menor a 450 milisegundos. ¿Le gustaría conocer nuestros planes de precios o agendar una demostración en vivo?`
      };
    }

    // ==========================================
    // 2. HINDI LANGUAGE RESPONSES
    // ==========================================
    if (lang === 'hi') {
      if (bookingAction) {
        return {
          speechText: `बहुत बढ़िया! आपकी डेमो कॉल ${bookingAction.slotText} को ${bookingAction.host} के साथ बुक कर दी गई है। क्या आप कुछ और विवरण जानना चाहते हैं?`
        };
      }
      if (/daam|kimat|price|pricing|cost/i.test(lower)) {
        return {
          speechText: `नमस्ते! हमारे तीन मुख्य प्लान हैं: स्टार्टर $499/माह, ग्रोथ $1,499/माह और एंटरप्राइज $4,999/माह जिसमें असीमित कॉल्स और 24/7 सीआरएम सिंक शामिल है। क्या आप इस सप्ताह लाइव डेमो देखना चाहेंगे?`
        };
      }
      return {
        speechText: `नमस्ते! मैं एपेक्स एआई से अवा हूँ। हमारा स्वायत्त एआई वॉयस एजेंट आपकी सेल्स टीम के लिए 24/7 लीड्स को क्वालिफाई और कन्वर्ट करता है। आप अपनी टीम के लिए किस प्रकार का समाधान खोज रहे हैं?`
      };
    }

    // ==========================================
    // 3. APPOINTMENT JUST CONFIRMED
    // ==========================================
    if (bookingAction) {
      session.topicsCovered.add('booking');
      return {
        speechText: `Fantastic! I've locked in your executive demo for ${bookingAction.slotText} with ${bookingAction.host}. A calendar invite with the Google Meet link has been generated and synced to your CRM profile. What specific integrations or custom playbooks would you like our team to showcase first during the session?`
      };
    }

    // ==========================================
    // 4. GREETINGS (Any greeting: "hey hi eva", "hello", "hi ava", "good morning")
    // ==========================================
    const isGreetingPattern = /\b(hi|hello|hey|good morning|good afternoon|hiya|greetings|yo|morning)\b/i.test(lower);
    const hasSpecificContent = /price|pricing|cost|budget|hubspot|salesforce|crm|leads|calls|hipaa|soc2|robotic|demo|schedule|book|feature|replace/i.test(lower);

    if (isGreetingPattern && !hasSpecificContent) {
      session.topicsCovered.add('greeting');
      return {
        speechText: `Hello! I'm Ava, Senior Solutions Executive at ApexAI. We deploy autonomous voice agents that qualify inbound and outbound leads 24/7 with sub-450ms latency. Are you looking to scale outbound pipeline, or automate inbound speed-to-lead for your team?`
      };
    }

    // ==========================================
    // 5. CRM & INTEGRATION INQUIRIES
    // ==========================================
    if (/hubspot|salesforce|zoho|pipedrive|crm|webhook|api|integrate|integration/i.test(lower)) {
      session.topicsCovered.add('integrations');
      const crmMentioned = /hubspot/i.test(lower) ? 'HubSpot' : /salesforce/i.test(lower) ? 'Salesforce' : /zoho/i.test(lower) ? 'Zoho' : 'your CRM';
      return {
        speechText: `Yes, we have native bidirectional integration with ${crmMentioned}. Ava automatically logs real-time call transcripts, writes structured BANT qualification notes, updates pipeline deal stages, and attaches the audio link within seconds of call completion. How is your team currently handling lead routing and follow-ups in ${crmMentioned}?`
      };
    }

    // ==========================================
    // 6. VOLUME, SCALING & CALL CAPACITY
    // ==========================================
    if (/\b(\d+[\d,]*\s*(leads|calls|minutes|dials|inbound|outbound))\b/i.test(lower) || /volume|capacity|concurrency|spike|throughput|scale/i.test(lower)) {
      session.topicsCovered.add('volume');
      const numMatch = userSpeech.match(/\b\d+[\d,]*\b/);
      const volNum = numMatch ? numMatch[0] : '';
      const phrase = volNum ? `${volNum} leads per month` : 'high lead volume';
      return {
        speechText: `Handling ${phrase} is exactly what our architecture is designed for. ApexAI supports unlimited concurrent lines with sub-450ms turnaround, meaning zero hold times even during peak marketing campaigns or inbound surges. We guarantee sub-minute speed-to-lead. What is your target timeline for rolling this capacity out?`
      };
    }

    // ==========================================
    // 7. PRICING, PLANS & COST
    // ==========================================
    if (/\b(how much|pricing|price|cost|tiers|plans|expensive|afford|budget)\b/i.test(lower)) {
      session.topicsCovered.add('pricing');
      if (/\b(budget|afford|expensive|costly)\b/i.test(lower) && session.bantResult.bant.budget.score > 0) {
        return {
          speechText: `With your allocated budget, our $1,499 Growth plan or $4,999 Enterprise tier would be an ideal fit. Compared to a traditional SDR costing $75,000 annually for only 70 dials a day, ApexAI operates at about 4 cents a call minute, delivering a 65% reduction in CAC with payback in under 28 days. Shall we book a quick 15-minute live walkthrough with Sarah Chen to review custom ROI numbers?`
        };
      }
      session.state = 'BOOKING_OFFER';
      return {
        speechText: `We offer three transparent tiers: Starter at $499/month for 500 minutes, Growth at $1,499 for 2,500 minutes with automated BANT qualification and CRM sync, and Enterprise at $4,999/month for unlimited concurrency, custom voice cloning, and SOC2 compliance. Based on your expected call volume, would you like to review an enterprise demo this week?`
      };
    }

    // ==========================================
    // 8. SECURITY, HIPAA, SOC2 & COMPLIANCE
    // ==========================================
    if (/hipaa|soc2|gdpr|security|compliance|privacy|safe|encrypt|baa|data/i.test(lower)) {
      session.topicsCovered.add('security');
      return {
        speechText: `Enterprise security is foundational to our platform: we are SOC2 Type II certified and sign enterprise BAAs for full HIPAA compliance. All voice audio is encrypted via TLS 1.3 in transit and AES-256 at rest, PII is scrubbed before processing, and we maintain a strict Zero Data Retention policy—customer conversations are never used to train foundational AI models. Are compliance audits required for your technical sign-off?`
      };
    }

    // ==========================================
    // 9. VOICE QUALITY & OBJECTION ("Sounds robotic")
    // ==========================================
    if (/robotic|robot|unnatural|fake|human sounding|accent|quality|natural/i.test(lower)) {
      session.topicsCovered.add('voice_quality');
      return {
        speechText: `That is one of the most critical factors for enterprise adoption. Ava utilizes neural prosody modeling, emotive micro-pauses, and contextual breathing cues. In double-blind testing across 50,000 live sales calls, 94% of prospects could not distinguish Ava from a top human SDR during the initial 3 minutes. I can play side-by-side comparative audio clips on a live demo—would tomorrow or Thursday suit your schedule?`
      };
    }

    // ==========================================
    // 10. HUMAN SDR COEXISTENCE ("Replace my reps")
    // ==========================================
    if (/replace|layoff|human reps|my team|sdr team|job/i.test(lower)) {
      session.topicsCovered.add('team_coexistence');
      return {
        speechText: `We don't replace your experienced Account Executives or closers; we supercharge them. Human SDRs typically spend 70% of their workday getting voicemail or manually entering notes. Ava handles the repetitive cold dialing and instant 1-minute inbound lead triage, booking pre-qualified BANT meetings directly onto your closers' calendars. How many sales reps are currently on your team?`
      };
    }

    // ==========================================
    // 11. TECHNICAL SPECS, TELEPHONY & LATENCY
    // ==========================================
    if (/latency|architecture|webrtc|sip|telephony|pbx|genesys|avaya|deepgram|whisper|tech/i.test(lower)) {
      session.topicsCovered.add('architecture');
      return {
        speechText: `Our voice architecture combines an edge WebRTC and SIP telephony gateway with streaming Whisper STT, fine-tuned quantized LLMs for sub-140ms first-token generation, and streaming neural TTS. Total end-to-end response latency is strictly under 450ms with dynamic barge-in interruption detection. Would you like to review our technical architecture diagram on a brief video call?`
      };
    }

    // ==========================================
    // 12. EXPLICIT DEMO OR BOOKING REQUEST
    // ==========================================
    if (/book|schedule|demo|meeting|calendar|call me|talk to a human/i.test(lower)) {
      session.state = 'BOOKING_OFFER';
      const openSlot = calendarService.getSlots()[0];
      const slotText = openSlot ? `${openSlot.date} at ${openSlot.time}` : 'tomorrow at 2:00 PM EST';
      return {
        speechText: `I would be delighted to schedule that! I have an open slot with our Principal Enterprise AE, Sarah Chen, on ${slotText}. Would that time work for you, or do you prefer a different day?`
      };
    }

    // ==========================================
    // 13. CONVERSATIONAL COMMON INQUIRIES
    // ==========================================
    if (/who are you|what is your name/i.test(lower)) {
      return {
        speechText: `I'm Ava, Senior Solutions Executive at ApexAI. I'm an autonomous sales voice agent engineered to handle inbound and outbound calls, qualify enterprise prospects with BANT criteria, and schedule meetings directly into your sales team's calendar.`
      };
    }

    if (/what can you do|features|capabilities|what do you do/i.test(lower)) {
      return {
        speechText: `I can conduct real-time voice conversations with sub-450ms latency, qualify leads using the BANT framework, answer technical and pricing questions via RAG retrieval, handle objections smoothly, and automatically book calendar appointments directly into your CRM.`
      };
    }

    if (/how are you|how is it going/i.test(lower)) {
      return {
        speechText: `I'm doing fantastic, thank you! Excited to help you streamline your sales pipeline. What is the biggest challenge your sales team is currently facing with lead response times?`
      };
    }

    if (/^(yes|sure|okay|sounds good|tell me more|go ahead|definitely)$/i.test(lower)) {
      if (session.state === 'BOOKING_OFFER') {
        const openSlot = calendarService.getSlots()[0];
        const slotText = openSlot ? `${openSlot.date} at ${openSlot.time}` : 'tomorrow afternoon';
        return {
          speechText: `Awesome! I have ${slotText} available with Sarah Chen, Principal Enterprise AE. Would that time slot be perfect for your calendar?`
        };
      }
      return {
        speechText: `Excellent! We can walk through our pricing tiers or review our native CRM integrations. Which of those would be most helpful to explore first?`
      };
    }

    // ==========================================
    // 14. DYNAMIC RAG RETRIEVAL MATCH
    // ==========================================
    if (ragMatches.length > 0 && ragMatches[0].score >= 0.12) {
      const top = ragMatches[0];
      if (top.category === 'product') {
        return {
          speechText: `ApexAI is designed specifically to automate inbound speed-to-lead and outbound prospecting. It engages leads in conversational speech under 450ms, qualifies them with BANT criteria, and syncs everything directly into your CRM. What specific workflow would you like to automate first?`
        };
      }
      if (top.category === 'pricing') {
        return {
          speechText: `Our packages start at $499/mo for Starter, $1,499/mo for Growth, and $4,999/mo for Enterprise with unlimited concurrency and dedicated SLA support. Does your team have an allocated budget range in mind for this evaluation?`
        };
      }
      if (top.category === 'security') {
        return {
          speechText: `We adhere to enterprise security standards including SOC2 Type II, signed HIPAA BAAs, and zero retention on LLM training data. All audio is encrypted end-to-end with TLS 1.3 and AES-256. Are there specific security questionnaires your team needs completed?`
        };
      }
      const firstSentence = top.content.split('.')[0] + '.';
      return {
        speechText: `Regarding ${top.title}: ${firstSentence} We can tailor this directly to your team's workflow. What is your team's target timeline for rolling out a solution?`
      };
    }

    // ==========================================
    // 15. ENGAGING CONVERSATIONAL FALLBACK
    // ==========================================
    return {
      speechText: `I appreciate you sharing that! ApexAI is fully customizable to your sales scripts, CRM workflows, and qualification criteria. To give you the exact ROI projection, could you tell me a little about your current monthly lead volume and the size of your sales team?`
    };
  }

  endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.duration = Math.round((Date.now() - session.startTime) / 1000);
    const summary = summarizer.generateSummary(session);

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
