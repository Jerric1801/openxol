import { Document, Packer, Paragraph, HeadingLevel } from 'docx'
import fsPromises from 'fs/promises'
import log from 'electron-log'
import type { Config } from '../../types/config'
import type { TranscriptResult, AnalysisResult } from '../../types/pipeline'

export class DocxGenModule {
  private config: Config

  constructor(config: Config) {
    this.config = config
  }

  async generateReport(
    transcript: TranscriptResult | null,
    diarized: TranscriptResult | null,
    analysis: AnalysisResult | null,
    outputPath: string
  ): Promise<string> {
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              text: 'Meeting Analysis Report',
              heading: HeadingLevel.TITLE,
              spacing: { after: 400 }
            }),
            ...this.createExecutiveSummarySection(analysis),
            ...this.createKeyDecisionsSection(analysis),
            ...this.createActionItemsSection(analysis),
            ...this.createKeyThemesSection(analysis),
            ...this.createTranscriptSection(transcript, diarized),
            ...this.createSpeakerAnalysisSection(diarized)
          ]
        }
      ]
    })

    try {
      const buffer = await Packer.toBuffer(doc)
      await fsPromises.writeFile(outputPath, buffer)
      log.info(`DOCX report saved to: ${outputPath}`)
      return outputPath
    } catch (error) {
      log.error('Failed to generate DOCX:', error)
      throw error
    }
  }

  private createExecutiveSummarySection(analysis: AnalysisResult | null): Paragraph[] {
    if (!analysis?.executiveSummary) return []
    return [
      new Paragraph({
        text: 'Executive Summary',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new Paragraph({
        text: analysis.executiveSummary,
        spacing: { after: 300 }
      })
    ]
  }

  private createKeyDecisionsSection(analysis: AnalysisResult | null): Paragraph[] {
    if (!analysis?.keyDecisions) return []
    return [
      new Paragraph({
        text: 'Key Decisions',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new Paragraph({
        text: analysis.keyDecisions,
        spacing: { after: 300 }
      })
    ]
  }

  private createActionItemsSection(analysis: AnalysisResult | null): Paragraph[] {
    if (!analysis?.actionItems) return []
    return [
      new Paragraph({
        text: 'Action Items',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new Paragraph({
        text: analysis.actionItems,
        spacing: { after: 300 }
      })
    ]
  }

  private createKeyThemesSection(analysis: AnalysisResult | null): Paragraph[] {
    if (!analysis?.keyThemes) return []
    return [
      new Paragraph({
        text: 'Key Themes',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new Paragraph({
        text: analysis.keyThemes,
        spacing: { after: 300 }
      })
    ]
  }

  private createTranscriptSection(
    transcript: TranscriptResult | null,
    diarized: TranscriptResult | null
  ): Paragraph[] {
    const transcriptText = diarized?.text || transcript?.text
    if (!transcriptText) return []

    return [
      new Paragraph({
        text: 'Full Transcript',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      ...this.formatTranscript(transcriptText, diarized)
    ]
  }

  private formatTranscript(text: string, diarized: TranscriptResult | null): Paragraph[] {
    if (diarized?.segments) {
      return diarized.segments.map((segment) => {
        const speaker = segment.speaker ? `[${segment.speaker}] ` : ''
        return new Paragraph({
          text: `${speaker}${segment.text || ''}`,
          spacing: { after: 100 }
        })
      })
    }

    return text
      .split('\n')
      .filter((p) => p.trim())
      .map(
        (p) =>
          new Paragraph({
            text: p.trim(),
            spacing: { after: 100 }
          })
      )
  }

  private createSpeakerAnalysisSection(diarized: TranscriptResult | null): Paragraph[] {
    const speakers = diarized?.segments?.map((s) => s.speaker).filter(Boolean) as string[]
    const uniqueSpeakers = Array.from(new Set(speakers))

    if (!uniqueSpeakers.length || !this.config.document?.includeSpeakerAnalysis) {
      return []
    }

    return [
      new Paragraph({
        text: 'Speaker Analysis',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new Paragraph({
        text: `Total speakers identified: ${uniqueSpeakers.length}`,
        spacing: { after: 200 }
      }),
      ...uniqueSpeakers.map(
        (speaker) =>
          new Paragraph({
            text: `- ${speaker}`,
            spacing: { after: 100 }
          })
      )
    ]
  }
}
