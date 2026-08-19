export class GoogleCalendarAdapter {
    providerName = 'GOOGLE';
    async syncEvent(businessId, event) {
        // Standard provider abstraction stub: Returns synchronized external event record
        return {
            externalId: `gcal_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            status: 'SYNCHRONIZED',
        };
    }
    async cancelEvent(businessId, externalId) {
        return { success: true };
    }
}
export class CalendarSyncEngine {
    static googleAdapter = new GoogleCalendarAdapter();
    static async syncAppointmentToCalendar(businessId, appointment) {
        try {
            const payload = {
                title: `Appointment: ${appointment.service?.name || 'Service'} with ${appointment.customer?.name || 'Customer'}`,
                description: `Handled by AI Receptionist. Status: ${appointment.status}`,
                startTime: new Date(appointment.startTime),
                endTime: new Date(appointment.endTime),
                attendeeEmail: appointment.customer?.email,
            };
            return await this.googleAdapter.syncEvent(businessId, payload);
        }
        catch (err) {
            console.error('Failed to sync appointment to external calendar', err);
            return null;
        }
    }
}
