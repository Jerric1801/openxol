const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = require('docx');
const fs = require('fs').promises;
const FileUtils = require('../utils/file-utils');
const log = require('electron-log');

class DocxGenModule {
  constructor(config) {
    this.config = config;
  }

  async generateReport(transcript, diarized, analysis, outputPath) {
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          // Title
          new Paragraph({
            text: 'Meeting Analysis Report',
            heading: HeadingLevel.TITLE,
            spacing: { after: 400 }
          }),

          // Meeting Synthesis
          ...this.createSynthesisSection(analysis),

          // Action Items
          ...this.createActionItemsSection(analysis),

          // Critique & Analysis
          ...this.createCritiqueSection(analysis),

          // Key Insights
          ...this.createInsightsSection(analysis),

          // Transcript Section
          ...this.createTranscriptSection(transcript, diarized),

          // Speaker Analysis (if diarized)
          ...this.createSpeakerAnalysisSection(diarized)
        ]
      }]
    });

    try {
      const buffer = await Packer.toBuffer(doc);
      await fs.writeFile(outputPath, buffer);
      log.info(`DOCX report saved to: ${outputPath}`);
      return outputPath;
    } catch (error) {
      log.error('Failed to generate DOCX:', error);
      throw error;
    }
  }

  createSynthesisSection(analysis) {
    if (!analysis || !analysis.synthesis) {
      return [];
    }

    return [
      new Paragraph({
        text: 'Meeting Synthesis',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new Paragraph({
        text: analysis.synthesis || analysis.raw || '',
        spacing: { after: 300 }
      })
    ];
  }

  createActionItemsSection(analysis) {
    if (!analysis || !analysis.actionItems) {
      return [];
    }

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
    ];
  }

  createCritiqueSection(analysis) {
    if (!analysis || !analysis.critique) {
      return [];
    }

    return [
      new Paragraph({
        text: 'Critique & Analysis',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new Paragraph({
        text: analysis.critique,
        spacing: { after: 300 }
      })
    ];
  }

  createInsightsSection(analysis) {
    if (!analysis || !analysis.insights) {
      return [];
    }

    return [
      new Paragraph({
        text: 'Key Insights',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new Paragraph({
        text: analysis.insights,
        spacing: { after: 300 }
      })
    ];
  }

  createTranscriptSection(transcript, diarized) {
    // Safely extract text from transcript object
    let transcriptText = '';
    if (diarized) {
      transcriptText = typeof diarized === 'string' ? diarized : (diarized.text || '');
    }
    if (!transcriptText && transcript) {
      transcriptText = typeof transcript === 'string' ? transcript : (transcript.text || '');
    }
    
    if (!transcriptText) {
      return [];
    }

    return [
      new Paragraph({
        text: 'Full Transcript',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      ...this.formatTranscript(transcriptText, diarized)
    ];
  }

  formatTranscript(text, diarized) {
    if (diarized && diarized.segments) {
      // Format with speaker labels
      return diarized.segments.map(segment => {
        const speaker = segment.speaker ? `[${segment.speaker}] ` : '';
        return new Paragraph({
          text: `${speaker}${segment.text || ''}`,
          spacing: { after: 100 }
        });
      });
    }

    // Simple text formatting
    const paragraphs = text.split('\n').filter(p => p.trim());
    return paragraphs.map(p => new Paragraph({
      text: p.trim(),
      spacing: { after: 100 }
    }));
  }

  createSpeakerAnalysisSection(diarized) {
    if (!diarized || !diarized.speakers || diarized.speakers.length === 0) {
      return [];
    }

    if (!this.config.document?.includeSpeakerAnalysis) {
      return [];
    }

    return [
      new Paragraph({
        text: 'Speaker Analysis',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new Paragraph({
        text: `Total speakers identified: ${diarized.speakers.length}`,
        spacing: { after: 200 }
      }),
      ...diarized.speakers.map(speaker => 
        new Paragraph({
          text: `- ${speaker}`,
          spacing: { after: 100 }
        })
      )
    ];
  }
}

module.exports = DocxGenModule;




