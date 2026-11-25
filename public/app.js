// ApexAI Autonomous Sales Agent - Client Application
document.addEventListener('DOMContentLoaded', () => {
  // State
  let sessionId = `SESSION-${Date.now()}`;
  let isRecording = false;
  let isAudioEnabled = true;
  let recognition = null;
  let turnsCount = 0;
  let currentLanguage = 'en';
  let leadProfile = {
    id: `LEAD-${Math.floor(100 + Math.random() * 900)}`,
    name: 'Alex Mercer',
    company: 'Nexus Enterprise Solutions',
    title: 'VP of Global Operations',
    email: 'alex.mercer@nexussolutions.io'
  };

  // DOM Elements
  const tabBtns = document.querySelectorAll('.tab-btn');
  const viewSections = document.querySelectorAll('.view-section');
  const transcriptFeed = document.getElementById('transcriptFeed');
  const turnCounter = document.getElementById('turnCounter');
  const stageStatus = document.getElementById('stageStatus');
  const stageSub = document.getElementById('stageSub');
  const voiceOrb = document.getElementById('voiceOrb');
  const waveform = document.getElementById('waveform');
  const btnMic = document.getElementById('btnMic');
  const micIcon = document.getElementById('micIcon');
  const micText = document.getElementById('micText');
  const btnAudioToggle = document.getElementById('btnAudioToggle');
  const textInput = document.getElementById('textInput');
  const btnSendText = document.getElementById('btnSendText');
  const langSelect = document.getElementById('langSelect');
  const btnResetSession = document.getElementById('btnResetSession');
  const btnEndCall = document.getElementById('btnEndCall');
  const btnQuickDemo = document.getElementById('btnQuickDemo');

  // Telemetry DOM
  const bantTotalScore = document.getElementById('bantTotalScore');
  const bantBadge = document.getElementById('bantBadge');
  const bantBudgetVal = document.getElementById('bantBudgetVal');
  const bantBudgetBar = document.getElementById('bantBudgetBar');
  const bantAuthVal = document.getElementById('bantAuthVal');
  const bantAuthBar = document.getElementById('bantAuthBar');
  const bantNeedVal = document.getElementById('bantNeedVal');
  const bantNeedBar = document.getElementById('bantNeedBar');
  const bantTimeVal = document.getElementById('bantTimeVal');
  const bantTimeBar = document.getElementById('bantTimeBar');

  const sentEmoji = document.getElementById('sentEmoji');
  const sentTitle = document.getElementById('sentTitle');
  const sentScoreText = document.getElementById('sentScoreText');

  const appointmentBody = document.getElementById('appointmentBody');
  const ragCitationList = document.getElementById('ragCitationList');

  // Summary Modal DOM
  const summaryModal = document.getElementById('summaryModal');
  const modalSummaryBody = document.getElementById('modalSummaryBody');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnModalCloseDone = document.getElementById('btnModalCloseDone');
  const btnCopyEmail = document.getElementById('btnCopyEmail');

  // Tab Switching
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      viewSections.forEach(s => s.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`view-${target}`).classList.add('active');

      if (target === 'crm') {
        loadCRMData();
      }
    });
  });

  // Language Change
  langSelect.addEventListener('change', (e) => {
    currentLanguage = e.target.value;
    addSystemNote(`Language switched to ${langSelect.options[langSelect.selectedIndex].text}`);
  });

  // Audio Toggle
  btnAudioToggle.addEventListener('click', () => {
    isAudioEnabled = !isAudioEnabled;
    btnAudioToggle.textContent = isAudioEnabled ? '🔊' : '🔇';
    btnAudioToggle.title = isAudioEnabled ? 'Audio Playback Enabled' : 'Audio Playback Muted';
    if (!isAudioEnabled) {
      window.speechSynthesis.cancel();
      stopSpeakingAnimation();
    }
  });

  // Initialize Speech Recognition (Web Speech API)
  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Web Speech API not supported in this browser. Fallback to text input and one-click chips.');
      return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isRecording = true;
      btnMic.classList.add('recording');
      micIcon.textContent = '⏹️';
      micText.textContent = 'Listening... Speak now';
      stageStatus.textContent = 'Listening to your voice...';
      stageSub.textContent = 'Ava is streaming your speech in real time.';
      voiceOrb.classList.add('listening');
      waveform.classList.add('active');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      handleUserUtterance(transcript);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      stopRecordingUI();
      if (event.error === 'not-allowed') {
        alert('Microphone access was denied. Please allow microphone permissions or use text input.');
      }
    };

    recognition.onend = () => {
      stopRecordingUI();
    };
  }

  function stopRecordingUI() {
    isRecording = false;
    btnMic.classList.remove('recording');
    micIcon.textContent = '🎙️';
    micText.textContent = 'Speak to Ava';
    voiceOrb.classList.remove('listening');
    waveform.classList.remove('active');
    stageStatus.textContent = 'Ready to talk';
    stageSub.textContent = 'Click the microphone button to speak with Ava, or use the quick prompt buttons below.';
  }

  initSpeechRecognition();

  // Mic Button Click
  btnMic.addEventListener('click', () => {
    if (!recognition) {
      alert('Speech Recognition is not supported by your browser. You can type in the box below or use the quick prompt chips!');
      textInput.focus();
      return;
    }

    if (isRecording) {
      recognition.stop();
      stopRecordingUI();
    } else {
      window.speechSynthesis.cancel();
      try {
        const langMap = { en: 'en-US', es: 'es-ES', hi: 'hi-IN', fr: 'fr-FR', de: 'de-DE', ja: 'ja-JP' };
        recognition.lang = langMap[currentLanguage] || 'en-US';
        recognition.start();
      } catch (e) {
        console.warn('Speech recognition restart issue:', e);
      }
    }
  });

  // Text Input Handling
  btnSendText.addEventListener('click', () => {
    const text = textInput.value.trim();
    if (text) {
      textInput.value = '';
      handleUserUtterance(text);
    }
  });

  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const text = textInput.value.trim();
      if (text) {
        textInput.value = '';
        handleUserUtterance(text);
      }
    }
  });

  // Quick Chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const text = chip.dataset.text;
      handleUserUtterance(text);
    });
  });

  // User Utterance Processor
  async function handleUserUtterance(text) {
    if (!text) return;

    turnsCount++;
    turnCounter.textContent = `${turnsCount} turn${turnsCount > 1 ? 's' : ''}`;

    // Append User Bubble
    appendMessage('user', text, { roleTitle: 'Alex Mercer (Lead)' });

    stageStatus.textContent = 'Ava is thinking...';
    stageSub.textContent = 'Retrieving knowledge chunks & evaluating BANT...';
    waveform.classList.add('active');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          text,
          lead: leadProfile,
          language: currentLanguage
        })
      });

      const data = await response.json();
      renderTelemetry(data);

      // Append Agent Bubble
      appendMessage('agent', data.agentText, { roleTitle: 'Ava (ApexAI SDR)' });

      // Speak agent response
      if (isAudioEnabled) {
        speakResponse(data.agentText, data.language || currentLanguage);
      } else {
        stageStatus.textContent = 'Ready to talk';
        stageSub.textContent = 'Audio muted. Click Speak or enter next question.';
        waveform.classList.remove('active');
      }

    } catch (err) {
      console.error('Chat error:', err);
      stageStatus.textContent = 'Error processing speech';
      waveform.classList.remove('active');
    }
  }

  // Text-to-Speech (TTS)
  function speakResponse(text, lang = 'en') {
    if (!window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);

    const langMap = { en: 'en-US', es: 'es-ES', hi: 'hi-IN', fr: 'fr-FR', de: 'de-DE', ja: 'ja-JP' };
    utterance.lang = langMap[lang] || 'en-US';
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    // Pick a natural-sounding voice if available
    const voices = window.speechSynthesis.getVoices();
    const targetVoice = voices.find(v => v.lang.startsWith(utterance.lang) && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Karen') || v.name.includes('Zira')));
    if (targetVoice) {
      utterance.voice = targetVoice;
    }

    utterance.onstart = () => {
      stageStatus.textContent = 'Ava is speaking...';
      stageSub.textContent = `Streaming synthetic neural voice (${utterance.lang})`;
      voiceOrb.classList.add('speaking');
      waveform.classList.add('active');
    };

    utterance.onend = () => {
      stopSpeakingAnimation();
    };

    utterance.onerror = () => {
      stopSpeakingAnimation();
    };

    window.speechSynthesis.speak(utterance);
  }

  function stopSpeakingAnimation() {
    stageStatus.textContent = 'Ready to talk';
    stageSub.textContent = 'Click Speak to Ava or choose a quick prompt to continue.';
    voiceOrb.classList.remove('speaking');
    waveform.classList.remove('active');
  }

  // Append Message Bubble
  function appendMessage(role, text, opts = {}) {
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${role}`;

    const header = document.createElement('div');
    header.className = 'msg-header';

    const nameSpan = document.createElement('span');
    nameSpan.className = role === 'agent' ? 'name-agent' : 'name-user';
    nameSpan.textContent = opts.roleTitle || (role === 'agent' ? 'Ava (ApexAI SDR)' : 'Prospect');

    const timeSpan = document.createElement('span');
    timeSpan.className = 'msg-tag';
    const now = new Date();
    timeSpan.textContent = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

    header.appendChild(nameSpan);
    header.appendChild(timeSpan);

    const textDiv = document.createElement('div');
    textDiv.textContent = text;

    bubble.appendChild(header);
    bubble.appendChild(textDiv);

    transcriptFeed.appendChild(bubble);
    transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
  }

  function addSystemNote(note) {
    const div = document.createElement('div');
    div.style.cssText = 'text-align:center; font-size:0.72rem; color:#64748b; margin:0.4rem 0;';
    div.textContent = `— ${note} —`;
    transcriptFeed.appendChild(div);
    transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
  }

  // Telemetry Renderer
  function renderTelemetry(data) {
    // 1. BANT Updates
    if (data.qualification) {
      const q = data.qualification;
      bantTotalScore.textContent = `${q.totalScore} / 100`;
      bantBadge.textContent = q.classification;

      if (q.totalScore >= 75) {
        bantBadge.style.background = 'rgba(239, 68, 68, 0.2)';
        bantBadge.style.color = '#f87171';
        bantBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      } else if (q.totalScore >= 45) {
        bantBadge.style.background = 'rgba(245, 158, 11, 0.2)';
        bantBadge.style.color = '#fbbf24';
        bantBadge.style.borderColor = 'rgba(245, 158, 11, 0.4)';
      }

      const b = q.bant;
      if (b.budget) {
        bantBudgetVal.textContent = b.budget.details || b.budget.status;
        bantBudgetBar.style.width = `${Math.min(100, (b.budget.score / 25) * 100)}%`;
      }
      if (b.authority) {
        bantAuthVal.textContent = b.authority.role || b.authority.status;
        bantAuthBar.style.width = `${Math.min(100, (b.authority.score / 25) * 100)}%`;
      }
      if (b.need) {
        bantNeedVal.textContent = (b.need.painPoints || []).join(', ') || b.need.status;
        bantNeedBar.style.width = `${Math.min(100, (b.need.score / 25) * 100)}%`;
      }
      if (b.timeline) {
        bantTimeVal.textContent = b.timeline.timeframe || b.timeline.status;
        bantTimeBar.style.width = `${Math.min(100, (b.timeline.score / 25) * 100)}%`;
      }
    }

    // 2. Sentiment Updates
    if (data.sentiment) {
      const s = data.sentiment;
      let emoji = '🙂';
      if (s.score >= 0.3) emoji = '😄';
      else if (s.score <= -0.3) emoji = '😟';
      else if (s.label === 'Skeptical') emoji = '🧐';

      sentEmoji.textContent = emoji;
      sentTitle.textContent = `${s.label} (${s.valence})`;
      sentScoreText.textContent = `Score: ${s.score > 0 ? '+' : ''}${s.score} | Confidence: ${Math.round(s.confidence * 100)}%`;
    }

    // 3. RAG Citations
    if (data.ragResults && data.ragResults.length > 0) {
      ragCitationList.innerHTML = '';
      data.ragResults.forEach(item => {
        const card = document.createElement('div');
        card.className = 'rag-card';
        card.innerHTML = `
          <div class="rag-card-header">
            <span>${item.title}</span>
            <span class="rag-score-pill">Match: ${Math.round(item.score * 100)}%</span>
          </div>
          <div style="color:#94a3b8; line-height:1.4;">${item.content.slice(0, 140)}...</div>
        `;
        ragCitationList.appendChild(card);
      });
    }

    // 4. Appointment Booking Card
    if (data.booking) {
      appointmentBody.innerHTML = `
        <div class="booking-confirmed-card">
          <div class="booking-title">
            <span>✅</span> Demo Booked with ${data.booking.host}
          </div>
          <div class="booking-details">
            <div><strong>Time:</strong> ${data.booking.slotText}</div>
            <div><strong>Location:</strong> Google Meet (Video Call)</div>
            <div><strong>Contact:</strong> ${leadProfile.name} (${leadProfile.company})</div>
          </div>
          <a href="/api/calendar/download-ics?slot=${encodeURIComponent(data.booking.slotText)}&company=${encodeURIComponent(leadProfile.company)}" class="btn-demo" style="text-decoration:none; justify-content:center; margin-top:0.35rem;">
            📅 Download .ICS Calendar Invite
          </a>
        </div>
      `;
    }
  }

  // End Call & Summarize
  btnEndCall.addEventListener('click', async () => {
    try {
      window.speechSynthesis.cancel();
      stopSpeakingAnimation();

      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });

      const data = await res.json();
      if (data.summary) {
        showSummaryModal(data.summary);
      }
    } catch (err) {
      console.error('Failed to summarize call:', err);
    }
  });

  function showSummaryModal(summary) {
    modalSummaryBody.innerHTML = `
      <div class="summary-block">
        <h4>Executive Summary & Lead Diagnosis</h4>
        <p>${summary.execSummary}</p>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
        <div class="summary-block">
          <h4>Lead Score & Quality</h4>
          <p><strong>Score:</strong> ${summary.leadScore}/100</p>
          <p><strong>Classification:</strong> ${summary.leadClassification}</p>
          <p><strong>Avg Sentiment:</strong> ${summary.averageSentiment}</p>
        </div>

        <div class="summary-block">
          <h4>Discussion Topics</h4>
          <ul>
            ${summary.discussionTopics.map(t => `<li>${t}</li>`).join('')}
          </ul>
        </div>
      </div>

      <div class="summary-block">
        <h4>Objections Resolved</h4>
        <ul>
          ${summary.objectionsHandled.length > 0
            ? summary.objectionsHandled.map(o => `<li>${o}</li>`).join('')
            : '<li>No severe objections encountered during discovery.</li>'
          }
        </ul>
      </div>

      <div class="summary-block">
        <h4>Action Items & Next Steps</h4>
        <ul>
          ${summary.actionItems.map(a => `<li>${a}</li>`).join('')}
        </ul>
      </div>

      <div class="summary-block">
        <h4>Auto-Generated Follow-Up Email (Ready to Send)</h4>
        <div class="email-preview" id="emailPreviewText">${summary.followUpEmail}</div>
      </div>
    `;

    summaryModal.classList.add('open');
  }

  // Close Modal
  btnCloseModal.addEventListener('click', () => summaryModal.classList.remove('open'));
  btnModalCloseDone.addEventListener('click', () => {
    summaryModal.classList.remove('open');
    // Switch to CRM view
    document.querySelector('[data-tab="crm"]').click();
  });

  // Copy Email to Clipboard
  btnCopyEmail.addEventListener('click', () => {
    const emailText = document.getElementById('emailPreviewText')?.innerText;
    if (emailText) {
      navigator.clipboard.writeText(emailText).then(() => {
        btnCopyEmail.textContent = '✅ Copied to Clipboard!';
        setTimeout(() => { btnCopyEmail.textContent = '📋 Copy Follow-Up Email'; }, 2000);
      });
    }
  });

  // Reset Session
  btnResetSession.addEventListener('click', () => {
    sessionId = `SESSION-${Date.now()}`;
    turnsCount = 0;
    turnCounter.textContent = '0 turns';
    transcriptFeed.innerHTML = `
      <div class="message-bubble agent">
        <div class="msg-header">
          <span class="name-agent">Ava (ApexAI SDR)</span>
          <span class="msg-tag">Greeting</span>
        </div>
        <div>Hello! I'm Ava, Senior Solutions Executive at ApexAI. We deploy autonomous voice agents that qualify inbound and outbound leads 24/7 with sub-450ms latency. Are you looking to scale outbound pipeline or automate inbound response time?</div>
      </div>
    `;
    bantTotalScore.textContent = '15 / 100';
    bantBadge.textContent = 'Initial Lead';
    bantBadge.style = '';
    bantBudgetVal.textContent = 'Pending';
    bantBudgetBar.style.width = '10%';
    bantAuthVal.textContent = 'Pending';
    bantAuthBar.style.width = '15%';
    bantNeedVal.textContent = 'Pending';
    bantNeedBar.style.width = '10%';
    bantTimeVal.textContent = 'Pending';
    bantTimeBar.style.width = '10%';

    sentEmoji.textContent = '🙂';
    sentTitle.textContent = 'Neutral / Receptive';
    sentScoreText.textContent = 'Valence: 0.00 | Confidence: 50%';

    appointmentBody.innerHTML = `
      <div style="font-size: 0.78rem; color: #94a3b8; text-align: center; padding: 0.75rem;">
        No demo booked yet. Ava automatically proposes matching AE calendar slots once BANT qualification hits the threshold.
      </div>
    `;
    ragCitationList.innerHTML = `<div style="font-size:0.75rem; color:#64748b;">Awaiting conversational query to retrieve knowledge chunks...</div>`;

    addSystemNote('Started fresh call session');
  });

  // 🚀 Fast Automated Demo
  btnQuickDemo.addEventListener('click', async () => {
    btnQuickDemo.disabled = true;
    btnQuickDemo.textContent = '⏳ Running Demo...';

    btnResetSession.click();

    const script = [
      "Hi Ava, I'm Alex Mercer, VP of Operations at Nexus Enterprise Solutions. We have 15,000 inbound freight leads a week and our SDR response time is too slow.",
      "How much does your Enterprise plan cost, and won't an AI voice bot sound unnatural to enterprise buyers?",
      "Our budget is $50,000 for this quarter. Yes, let's book that demo with Sarah Chen for Thursday!"
    ];

    for (let i = 0; i < script.length; i++) {
      await new Promise(r => setTimeout(r, i === 0 ? 800 : 3200));
      await handleUserUtterance(script[i]);
    }

    setTimeout(() => {
      btnQuickDemo.disabled = false;
      btnQuickDemo.textContent = '🚀 Fast Auto-Demo';
      // Automatically trigger End Call & Summary
      btnEndCall.click();
    }, 3500);
  });

  // CRM Pipeline Loader
  async function loadCRMData() {
    try {
      const res = await fetch('/api/leads');
      const data = await res.json();

      // Render KPIs
      const m = data.metrics;
      document.getElementById('kpiTotalLeads').textContent = m.totalLeads;
      document.getElementById('kpiQualifiedLeads').textContent = m.qualifiedLeads;
      document.getElementById('kpiDemosBooked').textContent = m.demosBooked;
      document.getElementById('kpiAvgScore').textContent = m.avgScore;
      document.getElementById('kpiConversionRate').textContent = m.conversionRate;

      // Render Kanban Cards
      const colNew = document.getElementById('colNewLeads');
      const colQual = document.getElementById('colQualified');
      const colSched = document.getElementById('colScheduled');
      const colClosed = document.getElementById('colClosed');

      colNew.innerHTML = '';
      colQual.innerHTML = '';
      colSched.innerHTML = '';
      colClosed.innerHTML = '';

      let cNew = 0, cQual = 0, cSched = 0, cClosed = 0;

      data.leads.forEach(lead => {
        const card = document.createElement('div');
        card.className = 'lead-kanban-card';
        card.innerHTML = `
          <div class="lead-name">${lead.name}</div>
          <div class="lead-company">${lead.title || 'Executive'} • ${lead.company}</div>
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem;">
            <span style="color:#38bdf8; font-weight:700;">Score: ${lead.score}/100</span>
            <span class="msg-tag" style="background:#1e293b;">${lead.appointment ? '📅 Booked' : (lead.tier || 'Enterprise')}</span>
          </div>
        `;

        if (lead.stage === 'New Lead') {
          colNew.appendChild(card);
          cNew++;
        } else if (lead.stage === 'Qualified') {
          colQual.appendChild(card);
          cQual++;
        } else if (lead.stage === 'Demo Scheduled') {
          colSched.appendChild(card);
          cSched++;
        } else {
          colClosed.appendChild(card);
          cClosed++;
        }
      });

      document.getElementById('countNewLeads').textContent = cNew;
      document.getElementById('countQualified').textContent = cQual;
      document.getElementById('countScheduled').textContent = cSched;
      document.getElementById('countClosed').textContent = cClosed;

      // Render Table Rows
      const tableBody = document.getElementById('crmTableBody');
      tableBody.innerHTML = '';

      data.leads.forEach(l => {
        const tr = document.createElement('tr');
        tr.style.cssText = 'border-bottom:1px solid #1e293b;';
        tr.innerHTML = `
          <td style="padding:0.75rem 1rem; font-family:var(--font-mono); color:#94a3b8;">${l.id}</td>
          <td style="padding:0.75rem 1rem;">
            <strong>${l.name}</strong><br>
            <span style="color:#94a3b8; font-size:0.75rem;">${l.title || ''} • ${l.company}</span>
          </td>
          <td style="padding:0.75rem 1rem;">
            <span class="msg-tag" style="${l.stage === 'Demo Scheduled' ? 'background:rgba(16,185,129,0.2); color:#34d399;' : ''}">${l.stage}</span>
          </td>
          <td style="padding:0.75rem 1rem; font-weight:700; color:#38bdf8;">${l.score}/100</td>
          <td style="padding:0.75rem 1rem; font-size:0.75rem; color:#cbd5e1; max-width:260px;">
            ${l.bant ? `${l.bant.budget || ''} | ${l.bant.authority || ''}` : 'Pending qualification'}
          </td>
          <td style="padding:0.75rem 1rem; font-size:0.75rem;">
            ${l.appointment ? `<span style="color:#34d399; font-weight:600;">✅ ${l.appointment}</span>` : '<span style="color:#64748b;">Not Scheduled</span>'}
          </td>
        `;
        tableBody.appendChild(tr);
      });

    } catch (e) {
      console.error('Failed to load CRM data:', e);
    }
  }

  // Export CSV
  document.getElementById('btnExportCSV')?.addEventListener('click', async () => {
    const res = await fetch('/api/leads');
    const data = await res.json();
    let csv = 'ID,Name,Company,Title,Email,Stage,Score,Appointment\n';
    data.leads.forEach(l => {
      csv += `"${l.id}","${l.name}","${l.company}","${l.title || ''}","${l.email || ''}","${l.stage}",${l.score},"${l.appointment || ''}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = `ApexAI_Leads_${Date.now()}.csv`;
    a.click();
  });

  // Reset CRM
  document.getElementById('btnResetCRM')?.addEventListener('click', async () => {
    if (confirm('Reset CRM database to default demo state?')) {
      await fetch('/api/reset', { method: 'POST' });
      loadCRMData();
    }
  });

  // RAG Explorer Search
  const ragInput = document.getElementById('ragTestInput');
  const btnRunRag = document.getElementById('btnRunRagSearch');
  const ragResultsDiv = document.getElementById('ragSearchResults');

  async function executeRagSearch() {
    const q = ragInput.value.trim();
    if (!q) return;

    ragResultsDiv.innerHTML = '<div style="color:#94a3b8; font-size:0.85rem;">Searching knowledge embeddings...</div>';
    try {
      const res = await fetch(`/api/rag/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();

      if (data.matches.length === 0) {
        ragResultsDiv.innerHTML = '<div style="color:#94a3b8; font-size:0.85rem;">No direct knowledge chunks matched. Showing fallback response.</div>';
        return;
      }

      ragResultsDiv.innerHTML = '';
      data.matches.forEach(m => {
        const item = document.createElement('div');
        item.style.cssText = 'background:#161f30; border:1px solid #243048; border-radius:8px; padding:1rem; margin-bottom:0.75rem;';
        item.innerHTML = `
          <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem;">
            <strong style="color:#38bdf8; font-size:0.9rem;">${m.title}</strong>
            <span class="rag-score-pill">Cosine Relevance: ${(m.score * 100).toFixed(1)}%</span>
          </div>
          <div style="font-size:0.825rem; color:#cbd5e1; line-height:1.5;">${m.content}</div>
          <div style="font-size:0.72rem; color:#64748b; margin-top:0.4rem;">Category: ${m.category} | Document ID: ${m.id}</div>
        `;
        ragResultsDiv.appendChild(item);
      });
    } catch (e) {
      ragResultsDiv.innerHTML = '<div style="color:#ef4444;">Search query failed</div>';
    }
  }

  btnRunRag?.addEventListener('click', executeRagSearch);
  ragInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executeRagSearch();
  });

  // Ensure speech synthesis voices are populated in Chrome/Safari
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }

  // Preload CRM
  loadCRMData();
});
