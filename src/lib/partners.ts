import "server-only";

// Which partner integrations are live. Shown honestly on /partners (D-36). Never exposes key values.
export const ELEVENLABS = {
  apiKey: () => process.env.ELEVENLABS_API_KEY,
  voiceId: () => process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
  ttsModel: () => process.env.ELEVENLABS_MODEL_ID || "eleven_v3",
  sttModel: () => process.env.ELEVENLABS_STT_MODEL || "scribe_v2",
  agentId: () => process.env.ELEVENLABS_AGENT_ID,
};

export function partnerStatus() {
  const el = Boolean(ELEVENLABS.apiKey());
  return {
    claude: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    elevenlabsTts: el,
    elevenlabsStt: el,
    elevenlabsAgent: el && Boolean(ELEVENLABS.agentId()),
    tokenomist: Boolean(process.env.TOKENOMIST_API_KEY),
    avalanche: Boolean(process.env.AVALANCHE_PRIVATE_KEY),
  };
}
