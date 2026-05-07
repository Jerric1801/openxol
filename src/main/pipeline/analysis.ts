import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai'
import log from 'electron-log'
import type { Config } from '../../types/config'
import type { AnalysisResult } from '../../types/pipeline'

export const DEFAULT_SYSTEM_PROMPT = `You are an expert executive assistant and meeting scribe. Analyze the provided meeting transcript to produce a structured, concise summary. Focus on:
- Executive Summary: A 3-4 sentence overview of the meeting's purpose and outcome.
- Key Decisions: A bulleted list of all major decisions made.
- Action Items Table: A markdown table with three columns: 'Action Item', 'Owner', and 'Deadline'. If a deadline is not explicitly mentioned, put 'TBD'.
- Key Themes: Brief notes on main discussion points.
Be concise, remove fluff, and ensure accountability is clear.`

export class AnalysisModule {
  private config: Config
  private apiKey: string | undefined
  private genAI: GoogleGenerativeAI | null = null
  private model: GenerativeModel | null = null

  constructor(config: Config) {
    this.config = config
    this.apiKey = config.analysis?.apiKey || process.env.GEMINI_API_KEY

    if (!this.apiKey) {
      log.warn('Gemini API key not configured')
    } else {
      this.genAI = new GoogleGenerativeAI(this.apiKey)
      const modelName = config.analysis?.model || 'gemini-2.5-flash-lite'

      this.model = this.genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json'
        }
      })
    }
  }

  async analyze(transcriptText: string): Promise<AnalysisResult> {
    if (!this.apiKey || !this.model) {
      throw new Error('Gemini API key or model not initialized')
    }

    if (!transcriptText?.trim()) {
      throw new Error('Transcript text is empty')
    }

    log.info(`Analyzing transcript: ${transcriptText.length} characters`)

    const prompt = this.buildAnalysisPrompt(transcriptText)

    try {
      log.info('Sending request to Gemini API...')
      const result = await this.model.generateContent(prompt)
      const response = await result.response
      const text = response.text()

      try {
        const jsonData = JSON.parse(text)
        return this.parseAnalysisFromJSON(jsonData, text)
      } catch (parseError) {
        log.warn('JSON parsing failed, falling back to basic mapping:', parseError)
        return this.fallbackMapping(text)
      }
    } catch (error: any) {
      log.error('Gemini API error:', error)
      throw new Error(`Analysis failed: ${error.message}`)
    }
  }

  private buildAnalysisPrompt(transcriptText: string): string {
    const systemContext = this.config.analysis?.systemPrompt || DEFAULT_SYSTEM_PROMPT

    return `${systemContext}

CRITICAL OUTPUT RULES — you MUST follow these exactly:
1. Return ONLY a valid JSON object. No markdown code fences, no extra text outside the JSON.
2. All field values must be formatted in GitHub-Flavored Markdown (GFM).
3. Use this exact JSON structure with these exact keys:

{
  "executiveSummary": "3–4 sentence prose overview of the meeting purpose and outcome.",
  "keyDecisions": "Bulleted list using GFM syntax (- item). One decision per bullet.",
  "actionItems": "GFM markdown table with header row and separator row:\\n| Action Item | Owner | Deadline |\\n|---|---|---|\\n| ... | ... | TBD |",
  "keyThemes": "Bulleted list using GFM syntax (- item). One theme per bullet with a brief explanation."
}

TRANSCRIPT:
${transcriptText}

Respond with the JSON object only.`
  }

  private parseAnalysisFromJSON(jsonData: any, rawText: string): AnalysisResult {
    return {
      raw: rawText,
      structured: {
        executiveSummary: jsonData.executiveSummary || '',
        keyDecisions: jsonData.keyDecisions || '',
        actionItems: jsonData.actionItems || '',
        keyThemes: jsonData.keyThemes || ''
      },
      executiveSummary: jsonData.executiveSummary || '',
      keyDecisions: jsonData.keyDecisions || '',
      actionItems: jsonData.actionItems || '',
      keyThemes: jsonData.keyThemes || ''
    }
  }

  private fallbackMapping(text: string): AnalysisResult {
    return {
      raw: text,
      structured: {
        executiveSummary: text,
        keyDecisions: '',
        actionItems: '',
        keyThemes: ''
      },
      executiveSummary: text,
      keyDecisions: '',
      actionItems: '',
      keyThemes: ''
    }
  }
}
