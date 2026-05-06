import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai'
import log from 'electron-log'
import type { Config } from '../../types/config'
import type { AnalysisResult } from '../../types/pipeline'

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
      const modelName = config.analysis?.model || 'gemini-2.0-flash-exp'
      
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
    return `Analyze this meeting transcript and provide a comprehensive analysis. Return your response as a JSON object with the following structure:

{
  "synthesis": "Summary of main topics discussed, key decisions made, and important points raised",
  "actionItems": "Specific tasks identified with assignees (if mentioned) and timelines or deadlines (if mentioned)",
  "critique": "Quality assessment of the meeting, areas for improvement, and effectiveness of communication",
  "insights": "Important learnings, innovative ideas discussed, and strategic considerations"
}

Transcript:
${transcriptText}

Provide a detailed analysis in the exact JSON format specified above.`
  }

  private parseAnalysisFromJSON(jsonData: any, rawText: string): AnalysisResult {
    return {
      raw: rawText,
      structured: {
        synthesis: jsonData.synthesis || '',
        actionItems: jsonData.actionItems || '',
        critique: jsonData.critique || '',
        insights: jsonData.insights || ''
      },
      synthesis: jsonData.synthesis || '',
      actionItems: jsonData.actionItems || '',
      critique: jsonData.critique || '',
      insights: jsonData.insights || ''
    }
  }

  private fallbackMapping(text: string): AnalysisResult {
    return {
      raw: text,
      structured: {
        synthesis: text,
        actionItems: '',
        critique: '',
        insights: ''
      },
      synthesis: text,
      actionItems: '',
      critique: '',
      insights: ''
    }
  }
}
