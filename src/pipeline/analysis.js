const { GoogleGenerativeAI } = require('@google/generative-ai');
const log = require('electron-log');

class AnalysisModule {
  constructor(config) {
    this.config = config;
    this.apiKey = config.analysis?.apiKey || process.env.GEMINI_API_KEY;
    
    if (!this.apiKey) {
      log.warn('Gemini API key not configured');
    } else {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      // Use Gemini 2.5 Flash-Lite as default (cheapest option)
      const modelName = config.analysis?.model || 'gemini-2.5-flash-lite';
      
      // Configure model with JSON response mode for structured output
      // Note: JSON mode is supported in Gemini 2.5+ and 3.0+ models
      const isJsonModeSupported = modelName.includes('2.5') || modelName.includes('3.');
      this.model = this.genAI.getGenerativeModel({ 
        model: modelName,
        ...(isJsonModeSupported && {
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      });
    }
  }

  async analyze(transcriptText) {
    if (!this.apiKey) {
      throw new Error('Gemini API key is required for analysis');
    }

    if (!this.model) {
      throw new Error('Gemini model not initialized');
    }

    // Validate transcript text
    if (!transcriptText || typeof transcriptText !== 'string') {
      log.error('Invalid transcript text provided to analysis:', typeof transcriptText);
      throw new Error('Invalid transcript text: must be a non-empty string');
    }

    if (transcriptText.trim().length === 0) {
      log.error('Empty transcript text provided to analysis');
      throw new Error('Transcript text is empty');
    }

    log.info(`Analyzing transcript: ${transcriptText.length} characters, ${transcriptText.split(/\s+/).length} words`);

    const prompt = this.buildAnalysisPrompt(transcriptText);

    try {
      log.info('Sending request to Gemini API...');
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Parse JSON response (Gemini is configured to return JSON)
      try {
        const jsonData = JSON.parse(text);
        return this.parseAnalysisFromJSON(jsonData, text);
      } catch (parseError) {
        // Fallback: if JSON parsing fails, try old regex parsing
        log.warn('JSON parsing failed, falling back to regex parsing:', parseError);
        return this.parseAnalysis(text);
      }
    } catch (error) {
      log.error('Gemini API error:', error);
      throw new Error(`Analysis failed: ${error.message}`);
    }
  }

  buildAnalysisPrompt(transcriptText) {
    return `Analyze this meeting transcript and provide a comprehensive analysis. Return your response as a JSON object with the following structure:

{
  "synthesis": "Summary of main topics discussed, key decisions made, and important points raised",
  "actionItems": "Specific tasks identified with assignees (if mentioned) and timelines or deadlines (if mentioned)",
  "critique": "Quality assessment of the meeting, areas for improvement, and effectiveness of communication",
  "insights": "Important learnings, innovative ideas discussed, and strategic considerations"
}

Transcript:
${transcriptText}

Provide a detailed analysis in the exact JSON format specified above.`;
  }

  parseAnalysisFromJSON(jsonData, rawText) {
    // Parse structured JSON response from Gemini
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
    };
  }

  parseAnalysis(text) {
    // Fallback parsing using separator strategy (more reliable than regex)
    // Look for clear section separators
    const sections = {
      synthesis: '',
      actionItems: '',
      critique: '',
      insights: ''
    };

    // Try to split by common separators
    const separators = [
      /###?\s*SYNTHESIS:?\s*/i,
      /###?\s*ACTION\s*ITEMS?:?\s*/i,
      /###?\s*CRITIQUE:?\s*/i,
      /###?\s*INSIGHTS?:?\s*/i
    ];

    // Simple approach: split by "###" markers if present
    if (text.includes('###')) {
      const parts = text.split(/###/);
      parts.forEach(part => {
        const lowerPart = part.toLowerCase();
        if (lowerPart.includes('synthesis')) {
          sections.synthesis = part.replace(/.*?synthesis:?\s*/i, '').trim();
        } else if (lowerPart.includes('action')) {
          sections.actionItems = part.replace(/.*?action\s*items?:?\s*/i, '').trim();
        } else if (lowerPart.includes('critique')) {
          sections.critique = part.replace(/.*?critique:?\s*/i, '').trim();
        } else if (lowerPart.includes('insight')) {
          sections.insights = part.replace(/.*?insights?:?\s*/i, '').trim();
        }
      });
    } else {
      // If no clear separators, use the full text as synthesis
      sections.synthesis = text;
    }

    return {
      raw: text,
      structured: sections,
      synthesis: sections.synthesis || text,
      actionItems: sections.actionItems || '',
      critique: sections.critique || '',
      insights: sections.insights || ''
    };
  }
}

module.exports = AnalysisModule;




