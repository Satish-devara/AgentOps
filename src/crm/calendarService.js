// Appointment Booking & Calendar Invite (.ics) Service

class CalendarService {
  constructor() {
    this.availableSlots = this.generateAvailableSlots();
  }

  generateAvailableSlots() {
    const slots = [];
    const now = new Date();
    // Generate next 5 business days
    let dayOffset = 1;
    let daysAdded = 0;

    while (daysAdded < 5) {
      const d = new Date(now);
      d.setDate(now.getDate() + dayOffset);
      const dayOfWeek = d.getDay();
      
      // Skip weekends (0 = Sun, 6 = Sat)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        
        slots.push({
          id: `SLOT-${daysAdded}-1`,
          date: dateStr,
          time: '10:00 AM EST',
          isoDateTime: new Date(d.setHours(10, 0, 0, 0)).toISOString(),
          host: 'Sarah Chen, Principal Enterprise AE',
          available: true
        });

        slots.push({
          id: `SLOT-${daysAdded}-2`,
          date: dateStr,
          time: '02:00 PM EST',
          isoDateTime: new Date(d.setHours(14, 0, 0, 0)).toISOString(),
          host: 'Sarah Chen, Principal Enterprise AE',
          available: true
        });

        slots.push({
          id: `SLOT-${daysAdded}-3`,
          date: dateStr,
          time: '04:30 PM EST',
          isoDateTime: new Date(d.setHours(16, 30, 0, 0)).toISOString(),
          host: 'Marcus Zhao, VP of Solution Architecture',
          available: true
        });

        daysAdded++;
      }
      dayOffset++;
    }
    return slots;
  }

  getSlots() {
    return this.availableSlots.filter(s => s.available);
  }

  bookSlot(slotId, leadInfo = {}) {
    const slot = this.availableSlots.find(s => s.id === slotId);
    if (!slot) {
      // Pick first available slot if slotId is generic or 'next'
      const firstAvailable = this.availableSlots.find(s => s.available);
      if (firstAvailable) {
        firstAvailable.available = false;
        firstAvailable.bookedBy = leadInfo;
        return {
          success: true,
          slot: firstAvailable,
          icsContent: this.generateICS(firstAvailable, leadInfo)
        };
      }
      return { success: false, message: 'No slots available' };
    }

    slot.available = false;
    slot.bookedBy = leadInfo;

    return {
      success: true,
      slot,
      icsContent: this.generateICS(slot, leadInfo)
    };
  }

  generateICS(slot, lead) {
    const start = new Date(slot.isoDateTime);
    const end = new Date(start.getTime() + 30 * 60000); // 30 min duration

    const formatICSDate = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ApexAI Technologies//Autonomous Voice SDR//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:APEX-${Date.now()}@apexai.io`,
      `DTSTAMP:${formatICSDate(new Date())}`,
      `DTSTART:${formatICSDate(start)}`,
      `DTEND:${formatICSDate(end)}`,
      `SUMMARY:ApexAI Solution Demo & Executive Strategy Session`,
      `DESCRIPTION:Executive product walkthrough and architecture review for ${lead.company || 'your team'} with ${slot.host}. Hosted via Google Meet: https://meet.google.com/apex-ai-demo`,
      `LOCATION:Google Meet (https://meet.google.com/apex-ai-demo)`,
      `ORGANIZER;CN=ApexAI Enterprise Sales:mailto:sales@apexai.io`,
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=${lead.name || 'Guest'}:mailto:${lead.email || 'guest@example.com'}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
  }
}

module.exports = new CalendarService();
