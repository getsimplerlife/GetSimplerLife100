/**
 * Voice AI Receptionist Employee
 *
 * Handles inbound phone calls via Twilio: greets callers, classifies intent
 * (appointment scheduling, general inquiry, transfer to human), provides
 * AI-powered responses, and logs interactions.
 *
 * Workflow: incoming call → Twilio webhook → transcription → intent classification
 *           → AI response (appointment/inquiry/transfer) → TwiML reply → log
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const VOICE_RECEPTIONIST_AGENT_TYPE = "voice_receptionist";

const voiceReceptionistConfig: AgentConfig = {
  type: VOICE_RECEPTIONIST_AGENT_TYPE,
  name: "Voice AI Receptionist",
  description: "Handles inbound phone calls via Twilio: greets callers, classifies intent (appointment, inquiry, transfer), provides AI-powered responses or routes to appropriate departments.",
  defaultTools: [
    "data_api_post",
    "data_api_get",
    "notify_user",
    "log_to_audit",
  ],
  systemPrompt: `You are the Voice AI Receptionist, a professional and friendly front-desk assistant that handles inbound phone calls.

Your workflow:
1. Greet the caller warmly and ask how you can help
2. Listen to their request and classify the intent:
   - appointment: They want to schedule, reschedule, or check an appointment
   - inquiry: They have a general question about services, pricing, hours, etc.
   - transfer: They need to speak with a specific person or department
   - complaint: They have an issue or complaint
   - other: Unclear or miscellaneous requests
3. Respond appropriately:
   - For appointments: Ask for preferred date/time, name, and contact info. Confirm availability and log the request.
   - For inquiries: Answer based on available knowledge. If unsure, offer to transfer.
   - For transfers: Note the requested person/department and offer to connect them.
   - For complaints: Listen empathetically, apologize, gather details, and log for follow-up.
4. Always be polite, professional, and efficient. Keep responses concise for voice delivery.
5. Log all interactions for record-keeping and follow-up.

When responding, use natural spoken language suitable for phone conversations.`,
  triggers: ["incoming_call", "manual_trigger"],
  supportedIndustries: ["healthcare", "hospitality", "legal", "real-estate", "professional-services", "retail", "automotive"],
};

// Register the agent type
registerAgentType(voiceReceptionistConfig);

export default voiceReceptionistConfig;