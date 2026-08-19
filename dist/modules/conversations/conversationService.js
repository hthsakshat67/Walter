import { prisma } from '../../db/prisma.js';
export class ConversationService {
    static async listConversations(businessId, channel) {
        const where = { businessId };
        if (channel) {
            where.channel = { equals: channel, mode: 'insensitive' };
        }
        return prisma.conversation.findMany({
            where,
            include: {
                customer: true,
                messages: { orderBy: { timestamp: 'asc' } },
            },
            orderBy: { lastMessageAt: 'desc' },
        });
    }
    static async getById(businessId, id) {
        return prisma.conversation.findFirst({
            where: { id, businessId },
            include: { customer: true, messages: { orderBy: { timestamp: 'asc' } }, phoneCalls: true },
        });
    }
    static async addMessage(businessId, conversationId, senderType, content, externalId) {
        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, businessId },
        });
        if (!conversation)
            throw new Error('Conversation not found');
        const message = await prisma.message.create({
            data: {
                conversationId,
                senderType,
                content,
                externalId,
            },
        });
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { lastMessageAt: new Date() },
        });
        return message;
    }
}
