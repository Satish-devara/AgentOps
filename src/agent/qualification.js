// BANT Lead Qualification Engine (Budget, Authority, Need, Timeline)

class QualificationEngine {
  constructor() {
    this.authorityTitles = [
      { regex: /\b(vp|vice president|director|head of|chief|cro|cmo|ceo|coo|cto|founder|owner|partner)\b/i, role: 'Decision Maker', weight: 25 },
      { regex: /\b(manager|lead|team lead|senior|supervisor)\b/i, role: 'Key Influencer', weight: 18 },
      { regex: /\b(evaluator|consultant|analyst|associate|engineer|rep|sdr)\b/i, role: 'Evaluator', weight: 10 }
    ];

    this.timelinePatterns = [
      { regex: /\b(immediately|right now|asap|this week|urgent|this month)\b/i, label: 'Immediate (< 30 days)', weight: 25 },
      { regex: /\b(next month|q[1-4]|this quarter|in a few weeks)\b/i, label: 'Near Term (1-3 months)', weight: 18 },
      { regex: /\b(later this year|next year|h[1-2]|exploring|just browsing)\b/i, label: 'Long Term (> 3 months)', weight: 8 }
    ];

    this.needPatterns = [
      { regex: /\b(scale|scaling|volume|too many leads|cannot keep up)\b/i, need: 'Scale Outbound & Inbound Volume', weight: 7 },
      { regex: /\b(slow|speed to lead|response time|delayed|missed leads)\b/i, need: 'Sub-Minute Speed to Lead', weight: 7 },
      { regex: /\b(cost|expensive|sdr turnover|attrition|hiring|budget)\b/i, need: 'Reduce CAC & SDR Overhead', weight: 6 },
      { regex: /\b(global|multilingual|languages|spanish|international|24\/7|after hours)\b/i, need: '24/7 Multilingual Coverage', weight: 5 }
    ];
  }

  evaluate(transcriptHistory = [], currentBANT = {}) {
    const combinedText = transcriptHistory
      .filter(m => m.role === 'user')
      .map(m => m.text)
      .join(' ');

    const bant = {
      budget: { ...currentBANT.budget } || { status: 'Unknown', details: null, score: 0 },
      authority: { ...currentBANT.authority } || { status: 'Unknown', role: null, score: 0 },
      need: { ...currentBANT.need } || { status: 'Unknown', painPoints: [], score: 0 },
      timeline: { ...currentBANT.timeline } || { status: 'Unknown', timeframe: null, score: 0 }
    };

    // 1. Evaluate Budget
    const budgetMatch = combinedText.match(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})*|\d+)\s*(k|thousand|million|k\/mo|\/month|dollars|usd)?/i);
    const mentionsTier = combinedText.match(/\b(enterprise|growth|starter|custom)\b/i);

    if (budgetMatch || mentionsTier) {
      let amount = 0;
      let textMatch = budgetMatch ? budgetMatch[0] : '';
      if (budgetMatch) {
        const rawNum = parseFloat(budgetMatch[1].replace(/,/g, ''));
        const multiplier = (budgetMatch[2] && budgetMatch[2].toLowerCase().startsWith('k')) ? 1000 : 1;
        amount = rawNum * multiplier;
      }

      if (amount >= 20000 || (mentionsTier && mentionsTier[1].toLowerCase() === 'enterprise')) {
        bant.budget = { status: 'Qualified (Enterprise)', details: textMatch || 'Enterprise Plan Budget', score: 25 };
      } else if (amount >= 3000 || (mentionsTier && mentionsTier[1].toLowerCase() === 'growth')) {
        bant.budget = { status: 'Qualified (Mid-Market)', details: textMatch || 'Growth Plan Budget', score: 20 };
      } else if (amount > 0 || (mentionsTier && mentionsTier[1].toLowerCase() === 'starter')) {
        bant.budget = { status: 'Qualified (Starter)', details: textMatch || 'Starter Tier Budget', score: 14 };
      } else {
        bant.budget = { status: 'Identified', details: textMatch, score: 10 };
      }
    }

    // 2. Evaluate Authority
    for (const item of this.authorityTitles) {
      if (item.regex.test(combinedText)) {
        const match = combinedText.match(item.regex)[0];
        bant.authority = {
          status: 'Identified',
          role: `${item.role} (${match.toUpperCase()})`,
          score: item.weight
        };
        break;
      }
    }

    // 3. Evaluate Need
    const identifiedNeeds = new Set(bant.need.painPoints || []);
    let needScore = 0;
    this.needPatterns.forEach(pattern => {
      if (pattern.regex.test(combinedText)) {
        identifiedNeeds.add(pattern.need);
        needScore += pattern.weight;
      }
    });

    if (identifiedNeeds.size > 0) {
      bant.need = {
        status: identifiedNeeds.size >= 2 ? 'Strong Pain Match' : 'Identified Need',
        painPoints: Array.from(identifiedNeeds),
        score: Math.min(25, Math.max(bant.need.score || 0, needScore || 15))
      };
    }

    // 4. Evaluate Timeline
    for (const item of this.timelinePatterns) {
      if (item.regex.test(combinedText)) {
        bant.timeline = {
          status: 'Identified',
          timeframe: item.label,
          score: item.weight
        };
        break;
      }
    }

    // Calculate overall lead score (0-100)
    const bScore = bant.budget.score || 0;
    const aScore = bant.authority.score || 0;
    const nScore = bant.need.score || 0;
    const tScore = bant.timeline.score || 0;
    const totalScore = Math.min(100, bScore + aScore + nScore + tScore);

    let classification = 'Cold Lead';
    let recommendation = 'Nurture via automated email campaign';
    if (totalScore >= 75) {
      classification = '🔥 Hot Lead (Priority)';
      recommendation = 'Immediate Account Executive Demo Booking';
    } else if (totalScore >= 45) {
      classification = '⚡ Warm Lead';
      recommendation = 'Offer product tour & follow up within 24h';
    }

    return {
      bant,
      totalScore,
      breakdown: { budget: bScore, authority: aScore, need: nScore, timeline: tScore },
      classification,
      recommendation
    };
  }
}

module.exports = new QualificationEngine();
