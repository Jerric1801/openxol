import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AnalysisModule } from './analysis'
import { GoogleGenerativeAI } from '@google/generative-ai'

vi.mock('@google/generative-ai', () => {
  const GoogleGenerativeAI = function () {
    return {
      getGenerativeModel: vi.fn().mockImplementation(() => ({
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () =>
              JSON.stringify({
                executiveSummary: 'Test Summary',
                keyDecisions: 'Test Decisions',
                actionItems: 'Test Actions',
                keyThemes: 'Test Themes'
              })
          }
        })
      }))
    }
  }
  return { GoogleGenerativeAI }
})

describe('AnalysisModule', () => {
  const mockConfig = {
    analysis: {
      apiKey: 'test-key',
      model: 'gemini-2.5-flash-lite'
    }
  } as any

  it('should analyze transcript text and return structured results', async () => {
    const module = new AnalysisModule(mockConfig)
    const result = await module.analyze('Hello world')

    expect(result.executiveSummary).toBe('Test Summary')
    expect(result.actionItems).toBe('Test Actions')
    expect(result.structured.keyDecisions).toBe('Test Decisions')
  })

  it('should throw error if transcript is empty', async () => {
    const module = new AnalysisModule(mockConfig)
    await expect(module.analyze('')).rejects.toThrow('Transcript text is empty')
  })

  it('should handle JSON parsing failures gracefully', async () => {
    const module = new AnalysisModule(mockConfig)
    const mockModel = (module as any).model
    mockModel.generateContent.mockResolvedValueOnce({
      response: {
        text: () => 'Not a JSON string'
      }
    })

    const result = await module.analyze('Hello world')
    expect(result.executiveSummary).toBe('Not a JSON string')
    expect(result.actionItems).toBe('')
  })
})
