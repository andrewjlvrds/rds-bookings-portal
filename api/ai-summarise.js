export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var { lodge, tour, thread, emailCount } = req.body || {};

  if (!thread || !thread.trim()) {
    return res.status(400).json({ error: 'No email thread provided' });
  }

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  // Truncate thread if too long (keep under ~12k tokens)
  var maxChars = 40000;
  if (thread.length > maxChars) {
    thread = thread.substring(0, maxChars) + '\n\n[... truncated]';
  }

  var systemPrompt = `You are a booking assistant for Ride Down South (RDS), a premium guided motorcycle tour operator in Southern Africa. Summarise email correspondence between RDS and lodges concisely.

Focus on:
- Booking status: confirmed, pending, declined, waitlisted
- Dates and room allocations discussed
- Rates quoted (per person/per room, what's included)
- Deposit/payment terms mentioned
- Any special requests or issues raised
- Next action needed

Be concise and factual. Use bullet points. No fluff.`;

  var userPrompt = `Summarise this email correspondence between Ride Down South and ${lodge || 'a lodge'} for the ${tour || 'upcoming'} tour (${emailCount || 'multiple'} emails).

EMAIL THREAD:
${thread}`;

  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      var errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
      return res.status(500).json({ error: 'AI API error: ' + response.status });
    }

    var data = await response.json();
    var summaryText = '';
    if (data.content && data.content.length > 0) {
      summaryText = data.content.map(function(c) { return c.text || ''; }).join('');
    }

    res.status(200).json({ success: true, summary: summaryText });
  } catch (err) {
    console.error('ai-summarise error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
