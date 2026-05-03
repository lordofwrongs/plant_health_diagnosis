import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const MAX_TURNS = 3

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { log_id, user_id, question, messages = [] } = await req.json()

    if (!log_id || !user_id || !question?.trim()) {
      return json({ error: 'Missing required fields: log_id, user_id, question' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''

    // Enforce turn limit before doing any work
    const userTurns = (messages as Message[]).filter(m => m.role === 'user').length
    if (userTurns >= MAX_TURNS) {
      return json({ error: 'max_turns_reached' }, 400)
    }

    // Fetch plant context
    const { data: log, error: logError } = await supabase
      .from('plant_logs')
      .select('PlantName, ScientificName, HealthStatus, VisualAnalysis, CarePlan, care_schedule, location_name, preferred_language')
      .eq('id', log_id)
      .single()

    if (logError || !log) {
      return json({ error: 'Plant not found' }, 404)
    }

    // For registered users, fetch prior Q&A on the same plant for personalisation
    let priorContext = ''
    const isGuest = !user_id || (user_id as string).startsWith('guest_')
    if (!isGuest && log.PlantName) {
      const { data: priorConvs } = await supabase
        .from('plant_conversations')
        .select('messages, log_id')
        .eq('user_id', user_id)
        .neq('log_id', log_id)
        .order('updated_at', { ascending: false })
        .limit(5)

      if (priorConvs && priorConvs.length > 0) {
        const priorLogIds = priorConvs.map((c: { log_id: string }) => c.log_id)
        const { data: priorLogs } = await supabase
          .from('plant_logs')
          .select('id, PlantName')
          .in('id', priorLogIds)

        const samePlantIds = new Set(
          (priorLogs ?? [])
            .filter((l: { id: string; PlantName: string }) =>
              l.PlantName?.toLowerCase() === log.PlantName?.toLowerCase()
            )
            .map((l: { id: string }) => l.id)
        )

        const relevantMsgs = priorConvs
          .filter((c: { log_id: string }) => samePlantIds.has(c.log_id))
          .flatMap((c: { messages: Message[] }) => (c.messages as Message[]).slice(-4))

        if (relevantMsgs.length > 0) {
          priorContext =
            '\n\nRELEVANT PRIOR CONVERSATIONS WITH THIS USER ABOUT THIS PLANT:\n' +
            relevantMsgs
              .map((m: Message) => `${m.role === 'user' ? 'User asked' : 'You answered'}: ${m.content}`)
              .join('\n')
        }
      }
    }

    const userLang = log.preferred_language || 'English'
    const scheduleText = log.care_schedule
      ? [
          log.care_schedule.water_every_days && `water every ${log.care_schedule.water_every_days} days`,
          log.care_schedule.fertilise_every_days && `fertilise every ${log.care_schedule.fertilise_every_days} days`,
        ]
          .filter(Boolean)
          .join(', ')
      : 'not available'

    const systemPrompt = `You are BotanIQ, a friendly plant care assistant. You are helping a user with their ${log.PlantName} (${log.ScientificName}).

PLANT DIAGNOSIS CONTEXT:
- Current health: ${log.HealthStatus}
- Location: ${log.location_name || 'Unknown'}
- Observed: ${(log.VisualAnalysis || '').slice(0, 400)}
- Care plan: ${(log.CarePlan || '').slice(0, 400)}
- Schedule: ${scheduleText}
${priorContext}

RULES:
- Answer ONLY questions about this plant's care, health, watering, pests, or identification
- Politely redirect off-topic questions back to plant care
- Keep answers to 2-4 sentences — concise and practical
- Use plain language, no botanical jargon
- Respond in ${userLang}
- Be warm and encouraging`

    const conversationHistory = messages as Message[]
    const newMsg: Message = { role: 'user', content: question.trim() }
    const allMessages = [...conversationHistory, newMsg]

    const contents = allMessages.map((m: Message) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 350,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      const err = await geminiRes.text()
      console.error('Gemini error:', err.slice(0, 200))
      return json({ error: 'AI service temporarily unavailable. Please try again.' }, 500)
    }

    const geminiData = await geminiRes.json()
    const answer: string | undefined = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    if (!answer) {
      return json({ error: 'Empty response from AI. Please try again.' }, 500)
    }

    const updatedMessages: Message[] = [
      ...allMessages,
      { role: 'assistant', content: answer },
    ]

    // Upsert conversation record
    const { data: existing } = await supabase
      .from('plant_conversations')
      .select('id')
      .eq('log_id', log_id)
      .eq('user_id', user_id)
      .maybeSingle()

    if (existing?.id) {
      await supabase
        .from('plant_conversations')
        .update({ messages: updatedMessages, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('plant_conversations')
        .insert({ log_id, user_id, messages: updatedMessages })
    }

    return json({ answer, messages: updatedMessages })
  } catch (err) {
    console.error('plant-chat fatal:', err)
    return json({ error: 'Unexpected error. Please try again.' }, 500)
  }
})
