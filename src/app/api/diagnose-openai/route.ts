import { NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function GET() {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'OPENAI_API_KEY is not set' }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: 'Reply with the single word: ok' }
      ],
      max_tokens: 2
    })

    const content = completion.choices?.[0]?.message?.content || ''
    const ok = /\bok\b/i.test(content)

    return NextResponse.json({ ok, content })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status: 500 })
  }
}


