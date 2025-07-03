// api/debug-env.js
export default async function handler(req, res) {
  res.json({
    hasApifyToken: !!process.env.APIFY_TOKEN,
    hasWhaleAgentCallerId: !!process.env.WHALEAGENT_CALLER_ACTOR_ID,
    hasWhaleAgentProcessorId: !!process.env.WHALEAGENT_PROCESSOR_ACTOR_ID,
    whaleAgentCallerId: process.env.WHALEAGENT_CALLER_ACTOR_ID ? 'Set' : 'Missing',
    nodeEnv: process.env.NODE_ENV,
    allEnvKeys: Object.keys(process.env).filter(key => key.includes('WHALE')).sort()
  });
}