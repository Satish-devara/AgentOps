// Call Summarization, Business Insights & Follow-up Generator

class CallSummarizer {
  generateSummary(session) {
    const transcript = session.transcript || [];
    const bantResult = session.bantResult || { bant: {}, totalScore: 0, classification: 'Cold Lead' };
    const sentimentHistory = session.sentimentHistory || [];
    const ragCitations = session.ragCitations || [];
    const lead = session.lead || {};

    const userMessages = transcript.filter(m => m.role === 'user').map(m => m.text);
    const agentMessages = transcript.filter(m => m.role === 'agent').map(m => m.text);

    // Calculate average sentiment
    const avgSentiment = sentimentHistory.length > 0
      ? (sentimentHistory.reduce((sum, s) => sum + s.score, 0) / sentimentHistory.length).toFixed(2)
      : '0.00';

    // Key Pain Points & Discussion Topics
    const discussionTopics = [];
    if (userMessages.some(m => /price|cost|tier|budget|expensive/i.test(m))) discussionTopics.push('Pricing & Packaging Tiers');
    if (userMessages.some(m => /scale|latency|speed|webrtc|sip|tech/i.test(m))) discussionTopics.push('Technical Architecture & Low Latency');
    if (userMessages.some(m => /security|hipaa|soc2|privacy|gdpr/i.test(m))) discussionTopics.push('Security, HIPAA & SOC2 Compliance');
    if (userMessages.some(m => /human|replace|team|sdr/i.test(m))) discussionTopics.push('Team Synergy & Coexistence with Human SDRs');
    if (userMessages.some(m => /spanish|hindi|language|multilingual/i.test(m))) discussionTopics.push('Multilingual Deployment');

    if (discussionTopics.length === 0) discussionTopics.push('General Product Capabilities & Value Proposition');

    // Objections Handled
    const objectionsHandled = [];
    if (userMessages.some(m => /expensive|costly|too much/i.test(m))) {
      objectionsHandled.push('Cost objection addressed: Framed 65% CAC reduction vs $75k/yr human SDR cost with 22-day payback.');
    }
    if (userMessages.some(m => /robotic|unnatural|fake/i.test(m))) {
      objectionsHandled.push('Voice fidelity objection addressed: Highlighted 94% human-indistinguishable test benchmark.');
    }
    if (userMessages.some(m => /replace|layoff|team/i.test(m))) {
      objectionsHandled.push('Replacement objection resolved: Positioned as 24/7 force multiplier booking demos for senior closers.');
    }

    // Executive Summary
    const company = lead.company || 'the prospect enterprise';
    const contact = lead.name || 'The prospect';
    const execSummary = `${contact} from ${company} engaged in an autonomous discovery session regarding ApexAI Sales Engine. The prospect highlighted need for ${bantResult.bant.need?.painPoints?.join(', ') || 'streamlined sales pipeline automation'}. BANT qualification achieved an overall score of ${bantResult.totalScore}/100 (${bantResult.classification}). Sentiment trended ${avgSentiment > 0.3 ? 'highly positive and receptive' : avgSentiment < -0.1 ? 'guarded with specific pricing objections' : 'constructive and analytical'}.`;

    // Action Items
    const actionItems = [
      session.appointment
        ? `Prepare customized architecture deck for booked demo on ${session.appointment.slotText || session.appointment.date || 'scheduled slot'}.`
        : `Follow up via email with custom pricing ROI calculator within 24 hours.`,
      `Sync lead profile and ${transcript.length}-turn call transcript to CRM.`,
      `Flag key requirements: ${discussionTopics.join(', ')}.`
    ];

    // Follow-Up Email Draft
    const followUpEmail = `Subject: ApexAI Demo Confirmation & Architecture Overview - ${lead.company || 'Your Team'}

Hi ${lead.name ? lead.name.split(' ')[0] : 'there'},

Thank you for speaking with Ava, our Autonomous Solutions Executive today!

Here is a quick recap of our discussion:
• Discussed: ${discussionTopics.join(', ')}
• BANT Fit: ${bantResult.recommendation || 'Enterprise evaluation'}
${session.appointment ? `• Scheduled Session: ${session.appointment.slotText || session.appointment.date} with ${session.appointment.host || 'Sarah Chen'}` : '• Next Step: Let us know which day works best for a 15-minute live walkthrough.'}

I have attached our technical architecture whitepaper and security compliance report (SOC2 Type II & HIPAA). Looking forward to our next conversation!

Best regards,
Ava (Autonomous Sales Executive) & Sarah Chen
ApexAI Technologies | https://apexai.io`;

    return {
      execSummary,
      leadScore: bantResult.totalScore,
      leadClassification: bantResult.classification,
      averageSentiment: avgSentiment,
      discussionTopics,
      objectionsHandled,
      actionItems,
      followUpEmail,
      callDurationSeconds: session.duration || Math.max(45, transcript.length * 12),
      turnsCount: transcript.length
    };
  }
}

module.exports = new CallSummarizer();
