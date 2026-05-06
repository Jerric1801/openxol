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
                synthesis: 'Test Synthesis',
                actionItems: 'Test Actions',
                critique: 'Test Critique',
                insights: 'Test Insights'
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
      model: 'gemini-2.0-flash-exp'
    }
  } as any

  it('should analyze transcript text and return structured results', async () => {
    const module = new AnalysisModule(mockConfig)
    const result = await module.analyze('Hello world')

    expect(result.synthesis).toBe('Test Synthesis')
    expect(result.actionItems).toBe('Test Actions')
    expect(result.structured.critique).toBe('Test Critique')
  })

  it('should throw error if transcript is empty', async () => {
    const module = new AnalysisModule(mockConfig)
    await expect(module.analyze('')).rejects.toThrow('Transcript text is empty')
  })

  it('should handle JSON parsing failures gracefully', async () => {
    const module = new AnalysisModule(mockConfig)
    // Manually override the mock for this test
    const mockModel = (module as any).model
    mockModel.generateContent.mockResolvedValueOnce({
      response: {
        text: () => 'Not a JSON string'
      }
    })

    const result = await module.analyze('Hello world')
    expect(result.synthesis).toBe('Not a JSON string')
    expect(result.actionItems).toBe('')
  })
})
