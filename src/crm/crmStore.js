// CRM In-Memory & File-Backed Data Store
const fs = require('fs');
const path = require('path');
const config = require('../config');

class CRMStore {
  constructor() {
    this.dbFile = config.CRM_DB_FILE;
    this.leads = [];
    this.activities = [];
    this.appointments = [];
    this.init();
  }

  init() {
    try {
      const dir = path.dirname(this.dbFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.dbFile)) {
        const raw = fs.readFileSync(this.dbFile, 'utf8');
        const data = JSON.parse(raw);
        this.leads = data.leads || [];
        this.activities = data.activities || [];
        this.appointments = data.appointments || [];
      } else {
        this.seedInitialData();
        this.save();
      }
    } catch (err) {
      console.error('CRM initialization error, using in-memory seed:', err.message);
      this.seedInitialData();
    }
  }

  seedInitialData() {
    this.leads = [
      {
        id: 'LEAD-101',
        name: 'David Reynolds',
        company: 'CloudScale Logistics',
        title: 'VP of Inside Sales',
        email: 'david.r@cloudscalelogistics.com',
        phone: '+1 (415) 890-4421',
        stage: 'Demo Scheduled',
        score: 88,
        tier: 'Enterprise ($4,999/mo)',
        sentiment: 'Positive (0.78)',
        bant: {
          budget: '$60,000/yr allocated',
          authority: 'VP (Final Signoff)',
          need: 'Handle 15,000 inbound freight calls/week',
          timeline: 'Q1 Deployment'
        },
        appointment: '2026-11-28 14:00 EST',
        createdAt: new Date(Date.now() - 3600000 * 48).toISOString()
      },
      {
        id: 'LEAD-102',
        name: 'Elena Rostova',
        company: 'FinTrack Global',
        title: 'Director of RevOps',
        email: 'elena@fintrackglobal.io',
        phone: '+1 (212) 555-0199',
        stage: 'Qualified',
        score: 65,
        tier: 'Growth ($1,499/mo)',
        sentiment: 'Neutral (0.20)',
        bant: {
          budget: '$25,000 budget under review',
          authority: 'Director (Recommender)',
          need: 'SDR team latency > 4 hours',
          timeline: 'Next 60 days'
        },
        appointment: null,
        createdAt: new Date(Date.now() - 3600000 * 24).toISOString()
      },
      {
        id: 'LEAD-103',
        name: 'Marcus Vance',
        company: 'Apex Healthtech',
        title: 'SDR Manager',
        email: 'marcus.v@apexhealth.org',
        phone: '+1 (312) 555-8823',
        stage: 'New Lead',
        score: 38,
        tier: 'Starter ($499/mo)',
        sentiment: 'Skeptical (-0.15)',
        bant: {
          budget: 'Under evaluation',
          authority: 'Manager',
          need: 'HIPAA compliant outbound',
          timeline: 'Evaluating'
        },
        appointment: null,
        createdAt: new Date(Date.now() - 3600000 * 12).toISOString()
      }
    ];

    this.activities = [
      {
        id: 'ACT-1',
        leadId: 'LEAD-101',
        type: 'Voice Call',
        summary: 'Ava qualified CloudScale Logistics. Budget $60k confirmed. Booked demo with Sarah Chen.',
        timestamp: new Date(Date.now() - 3600000 * 4).toISOString()
      }
    ];

    this.appointments = [
      {
        id: 'APT-1',
        leadId: 'LEAD-101',
        leadName: 'David Reynolds',
        host: 'Sarah Chen (Principal AE)',
        dateTime: '2026-11-28T14:00:00.000Z',
        status: 'Confirmed'
      }
    ];
  }

  save() {
    try {
      const data = {
        leads: this.leads,
        activities: this.activities,
        appointments: this.appointments,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.dbFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.warn('Could not persist CRM to disk:', err.message);
    }
  }

  getLeads() {
    return this.leads;
  }

  getLeadById(id) {
    return this.leads.find(l => l.id === id);
  }

  upsertLead(leadData) {
    const existingIndex = this.leads.findIndex(l => l.id === leadData.id || (leadData.email && l.email === leadData.email));
    if (existingIndex >= 0) {
      this.leads[existingIndex] = { ...this.leads[existingIndex], ...leadData, updatedAt: new Date().toISOString() };
      this.save();
      return this.leads[existingIndex];
    } else {
      const newLead = {
        id: leadData.id || `LEAD-${100 + this.leads.length + 1}`,
        createdAt: new Date().toISOString(),
        stage: 'New Lead',
        score: 0,
        ...leadData
      };
      this.leads.unshift(newLead);
      this.save();
      return newLead;
    }
  }

  addActivity(act) {
    const activity = {
      id: `ACT-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...act
    };
    this.activities.unshift(activity);
    this.save();
    return activity;
  }

  getActivities(leadId = null) {
    if (leadId) {
      return this.activities.filter(a => a.leadId === leadId);
    }
    return this.activities;
  }

  addAppointment(apt) {
    const appointment = {
      id: `APT-${Date.now()}`,
      status: 'Confirmed',
      createdAt: new Date().toISOString(),
      ...apt
    };
    this.appointments.unshift(appointment);

    // Sync lead stage to "Demo Scheduled"
    if (apt.leadId) {
      this.upsertLead({
        id: apt.leadId,
        stage: 'Demo Scheduled',
        appointment: apt.slotText || apt.dateTime
      });
    }

    this.save();
    return appointment;
  }

  getAppointments() {
    return this.appointments;
  }

  getMetrics() {
    const totalLeads = this.leads.length;
    const qualifiedLeads = this.leads.filter(l => l.score >= 45).length;
    const hotLeads = this.leads.filter(l => l.score >= 75).length;
    const demosBooked = this.appointments.length;
    const avgScore = totalLeads ? Math.round(this.leads.reduce((sum, l) => sum + (l.score || 0), 0) / totalLeads) : 0;

    return {
      totalLeads,
      qualifiedLeads,
      hotLeads,
      demosBooked,
      avgScore,
      conversionRate: totalLeads ? `${Math.round((demosBooked / totalLeads) * 100)}%` : '0%'
    };
  }
}

module.exports = new CRMStore();
