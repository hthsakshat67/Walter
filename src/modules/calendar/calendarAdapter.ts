import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { prisma } from '../../db/prisma.js';

export interface CalendarEventPayload {
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  attendeeEmail?: string;
}

export interface SyncedCalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  source: 'GOOGLE' | 'LOCAL';
}

export interface CalendarProviderAdapter {
  providerName: 'GOOGLE' | 'OUTLOOK';
  syncEvent(businessId: string, event: CalendarEventPayload, googleEventId?: string | null): Promise<string>;
  cancelEvent(businessId: string, googleEventId: string): Promise<boolean>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOCK_FILE_PATH = path.join(__dirname, 'google_calendar_mock.json');

async function readMockEvents(): Promise<any[]> {
  try {
    const data = await fs.readFile(MOCK_FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

async function writeMockEvents(events: any[]): Promise<void> {
  await fs.writeFile(MOCK_FILE_PATH, JSON.stringify(events, null, 2), 'utf-8');
}

async function getGoogleCredentials(businessId: string) {
  // Check Integration table
  const integration = await prisma.integration.findFirst({
    where: { businessId, provider: 'GOOGLE_CALENDAR', enabled: true },
  });

  if (integration && integration.config) {
    try {
      const config = JSON.parse(integration.config);
      if (config.googleCalendarId && config.googleServiceAccountEmail && config.googlePrivateKey) {
        return {
          calendarId: config.googleCalendarId,
          clientEmail: config.googleServiceAccountEmail,
          privateKey: config.googlePrivateKey,
          realApi: true,
        };
      }
    } catch (e) {
      console.error('Failed to parse Google Calendar integration config', e);
    }
  }

  // Fallback to process.env
  if (process.env.GOOGLE_CALENDAR_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      privateKey: process.env.GOOGLE_PRIVATE_KEY,
      realApi: true,
    };
  }

  return { realApi: false };
}

async function getGoogleAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const formattedKey = privateKey.replace(/\\n/g, '\n');
  const token = jwt.sign(payload, formattedKey, { algorithm: 'RS256' });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${token}`,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google OAuth token retrieval failed: ${errorText}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

async function fetchGoogleCalendarEvents(calendarId: string, accessToken: string, timeMin: Date, timeMax: Date) {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}&singleEvents=true&orderBy=startTime`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to fetch Google Calendar events: ${errorText}`);
  }
  const data = await res.json() as { items: any[] };
  return data.items || [];
}

export class GoogleCalendarAdapter implements CalendarProviderAdapter {
  providerName = 'GOOGLE' as const;

  async listEvents(businessId: string, timeMin: Date, timeMax: Date): Promise<SyncedCalendarEvent[]> {
    const creds = await getGoogleCredentials(businessId);
    if (creds.realApi && creds.calendarId && creds.clientEmail && creds.privateKey) {
      try {
        const token = await getGoogleAccessToken(creds.clientEmail, creds.privateKey);
        const rawEvents = await fetchGoogleCalendarEvents(creds.calendarId, token, timeMin, timeMax);
        return rawEvents.map((item: any) => ({
          id: item.id,
          title: item.summary || 'Google Event',
          description: item.description || '',
          startTime: new Date(item.start.dateTime || item.start.date),
          endTime: new Date(item.end.dateTime || item.end.date),
          source: 'GOOGLE',
        }));
      } catch (err) {
        console.error('Real Google Calendar API failed, falling back to simulated mode:', err);
      }
    }

    // Simulated Fallback
    const mockEvents = await readMockEvents();
    return mockEvents
      .map((item: any) => ({
        id: item.id,
        title: item.summary || 'Simulated Google Event',
        description: item.description || '',
        startTime: new Date(item.start.dateTime || item.start.date),
        endTime: new Date(item.end.dateTime || item.end.date),
        source: 'GOOGLE',
      }))
      .filter((item: any) => item.startTime < timeMax && item.endTime > timeMin);
  }

  async syncEvent(businessId: string, event: CalendarEventPayload, googleEventId?: string | null): Promise<string> {
    const creds = await getGoogleCredentials(businessId);
    if (creds.realApi && creds.calendarId && creds.clientEmail && creds.privateKey) {
      try {
        const token = await getGoogleAccessToken(creds.clientEmail, creds.privateKey);
        const body = {
          summary: event.title,
          description: event.description,
          start: { dateTime: event.startTime.toISOString() },
          end: { dateTime: event.endTime.toISOString() },
          attendees: event.attendeeEmail ? [{ email: event.attendeeEmail }] : [],
        };

        let url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(creds.calendarId)}/events`;
        let method = 'POST';

        if (googleEventId) {
          url += `/${googleEventId}`;
          method = 'PUT';
        }

        const res = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Google Calendar API event sync failed: ${errText}`);
        }

        const data = await res.json() as { id: string };
        return data.id;
      } catch (err) {
        console.error('Real Google Calendar sync failed, syncing locally to mock:', err);
      }
    }

    // Simulated Fallback
    const mockEvents = await readMockEvents();
    const id = googleEventId || `gcal_mock_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const newEvent = {
      id,
      summary: event.title,
      description: event.description,
      start: { dateTime: event.startTime.toISOString() },
      end: { dateTime: event.endTime.toISOString() },
    };

    const index = mockEvents.findIndex((item: any) => item.id === id);
    if (index >= 0) {
      mockEvents[index] = newEvent;
    } else {
      mockEvents.push(newEvent);
    }

    await writeMockEvents(mockEvents);
    return id;
  }

  async cancelEvent(businessId: string, googleEventId: string): Promise<boolean> {
    const creds = await getGoogleCredentials(businessId);
    if (creds.realApi && creds.calendarId && creds.clientEmail && creds.privateKey) {
      try {
        const token = await getGoogleAccessToken(creds.clientEmail, creds.privateKey);
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(creds.calendarId)}/events/${googleEventId}`;
        const res = await fetch(url, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (res.ok || res.status === 404) {
          return true;
        } else {
          const errText = await res.text();
          throw new Error(`Google Calendar API delete failed: ${errText}`);
        }
      } catch (err) {
        console.error('Real Google Calendar cancel failed, cancelling locally in mock:', err);
      }
    }

    // Simulated Fallback
    const mockEvents = await readMockEvents();
    const filtered = mockEvents.filter((item: any) => item.id !== googleEventId);
    await writeMockEvents(filtered);
    return true;
  }

  async addSimulatorEvent(event: { summary: string; description: string; startTime: string; endTime: string }) {
    const mockEvents = await readMockEvents();
    const id = `gcal_mock_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    mockEvents.push({
      id,
      summary: event.summary,
      description: event.description,
      start: { dateTime: new Date(event.startTime).toISOString() },
      end: { dateTime: new Date(event.endTime).toISOString() },
    });
    await writeMockEvents(mockEvents);
    return id;
  }
}

export class CalendarSyncEngine {
  private static googleAdapter = new GoogleCalendarAdapter();

  static async listGoogleCalendarEvents(businessId: string, start: Date, end: Date) {
    return this.googleAdapter.listEvents(businessId, start, end);
  }

  static async syncAppointmentToCalendar(businessId: string, appointment: any) {
    try {
      const payload: CalendarEventPayload = {
        title: `Appointment: ${appointment.service?.name || 'Service'} with ${appointment.customer?.name || 'Customer'}`,
        description: `Handled by AI Receptionist. Status: ${appointment.status}. Channel: ${appointment.channel}. Notes: ${appointment.notes || ''}`,
        startTime: new Date(appointment.startTime),
        endTime: new Date(appointment.endTime),
        attendeeEmail: appointment.customer?.email || undefined,
      };

      const externalId = await this.googleAdapter.syncEvent(businessId, payload, appointment.googleCalendarEventId);

      if (externalId && appointment.googleCalendarEventId !== externalId) {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { googleCalendarEventId: externalId },
        });
      }
      return externalId;
    } catch (err) {
      console.error('Failed to sync appointment to external calendar', err);
      return null;
    }
  }

  static async deleteAppointmentFromCalendar(businessId: string, googleCalendarEventId: string) {
    try {
      return await this.googleAdapter.cancelEvent(businessId, googleCalendarEventId);
    } catch (err) {
      console.error('Failed to cancel event in external calendar', err);
      return false;
    }
  }

  static async addSimulatorEvent(event: { summary: string; description: string; startTime: string; endTime: string }) {
    return this.googleAdapter.addSimulatorEvent(event);
  }
}
