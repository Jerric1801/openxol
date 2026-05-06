"use strict";
const path = require("path");
const os = require("os");
const log = require("electron-log");
const child_process = require("child_process");
const fs = require("fs");
const fsPromises = require("fs/promises");
const setupManager = require("./chunks/setup-manager-Qv2tAgHY.js");
const generativeAi = require("@google/generative-ai");
const docx = require("docx");
require("https");
require("electron");
class TranscriptionModule {
  config;
  constructor(config) {
    this.config = config;
  }
  async convertAudio(audioPath) {
    const ext = setupManager.FileUtils.getFileExtension(audioPath);
    if (ext === "wav") {
      const workingDir2 = await setupManager.FileUtils.getWorkingDirectory();
      const fileName2 = path.basename(audioPath);
      const outputPath2 = path.join(workingDir2, fileName2);
      await fsPromises.copyFile(audioPath, outputPath2);
      return outputPath2;
    }
    const workingDir = await setupManager.FileUtils.getWorkingDirectory();
    const fileName = setupManager.FileUtils.getFileNameWithoutExtension(path.basename(audioPath));
    const outputPath = path.join(workingDir, `${fileName}.wav`);
    const ffmpegPath = setupManager.getBinaryPath("ffmpeg");
    if (!await setupManager.FileUtils.fileExists(ffmpegPath)) {
      const setupManager$1 = new setupManager.SetupManager();
      const instructions = setupManager$1.getInstallationInstructions("ffmpeg");
      throw new Error(
        `FFmpeg binary not found at: ${ffmpegPath}

${instructions}

Please complete the setup first or install FFmpeg manually.`
      );
    }
    return new Promise((resolve, reject) => {
      const proc = child_process.spawn(ffmpegPath, [
        "-i",
        audioPath,
        "-ar",
        "16000",
        // Sample rate 16kHz
        "-ac",
        "1",
        // Mono
        "-y",
        // Overwrite output file
        outputPath
      ]);
      let stderr = "";
      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      proc.on("close", async (code) => {
        const outputExists = await setupManager.FileUtils.fileExists(outputPath);
        if (code === 0 || outputExists) {
          resolve(outputPath);
        } else {
          reject(new Error(`Audio conversion failed: ${stderr || "Unknown error"}`));
        }
      });
      proc.on("error", (error) => {
        if (error.code === "ENOENT") {
          const setupManager$1 = new setupManager.SetupManager();
          const instructions = setupManager$1.getInstallationInstructions("ffmpeg");
          reject(new Error(`FFmpeg binary not found. ${instructions}`));
        } else {
          reject(new Error(`Failed to start ffmpeg: ${error.message}`));
        }
      });
    });
  }
  async transcribe(audioPath) {
    const whisperBin = setupManager.getBinaryPath("whisper");
    const modelPath = await setupManager.getModelPath(this.config.transcription.model || "base.en");
    if (!await setupManager.FileUtils.fileExists(whisperBin)) {
      const setupManager$1 = new setupManager.SetupManager();
      const instructions = setupManager$1.getInstallationInstructions("whisper");
      throw new Error(
        `Whisper binary not found at: ${whisperBin}

${instructions}

Please complete the setup first or install Whisper manually.`
      );
    }
    try {
      try {
        const stats = fs.lstatSync(whisperBin);
        if (stats.isSymbolicLink()) {
          const realPath = fs.realpathSync(whisperBin);
          log.info(`Binary is a symlink pointing to: ${realPath}`);
          if (realPath.includes("pyenv") || realPath.includes("python") || realPath.includes("pip") || realPath.includes(".pyenv")) {
            throw new Error(`Wrong binary detected: Python whisper CLI instead of whisper.cpp`);
          }
        }
      } catch (symlinkError) {
        if (symlinkError.message.includes("Wrong binary detected")) {
          throw symlinkError;
        }
        log.debug("Symlink check failed:", symlinkError.message);
      }
      const helpOutput = child_process.execSync(
        `"${whisperBin}" --help 2>&1 | head -50 || "${whisperBin}" -h 2>&1 | head -50 || true`,
        {
          encoding: "utf-8",
          timeout: 2e3,
          maxBuffer: 16384
        }
      );
      const isPythonWhisper = helpOutput.includes("--output_format {txt,vtt,srt,tsv,json,all}") || helpOutput.includes("--output_format/-f") || helpOutput.includes("usage: whisper") && helpOutput.includes("--output_format") || helpOutput.includes("--model MODEL") && helpOutput.includes("--output_format") || helpOutput.includes("--output_dir OUTPUT_DIR");
      const isWhisperCpp = helpOutput.includes("--output-json") || helpOutput.includes("-oj") || helpOutput.includes("whisper-cli") || helpOutput.includes("--file FNAME") && helpOutput.includes("input audio file") || helpOutput.includes("file0 file1 ...") || helpOutput.includes("supported audio formats:");
      if (isPythonWhisper && !isWhisperCpp) {
        throw new Error(`Wrong binary detected: Python whisper CLI instead of whisper.cpp`);
      }
    } catch (error) {
      if (error.message.includes("Wrong binary detected")) {
        throw error;
      }
      log.warn("Binary validation check failed:", error.message);
    }
    if (!await setupManager.FileUtils.fileExists(modelPath)) {
      throw new Error(`Whisper model not found at ${modelPath}. Please complete setup.`);
    }
    const wavPath = await this.convertAudio(audioPath);
    const workingDir = await setupManager.FileUtils.getWorkingDirectory();
    const outputBaseName = setupManager.FileUtils.getFileNameWithoutExtension(path.basename(wavPath));
    const jsonOutputPath = path.join(workingDir, `${outputBaseName}.json`);
    return new Promise((resolve, reject) => {
      const args = [
        "-m",
        modelPath,
        "-f",
        wavPath,
        "-of",
        path.join(workingDir, outputBaseName),
        "-oj",
        "-nt"
      ];
      if (this.config.transcription.language) {
        args.push("-l", this.config.transcription.language);
      }
      log.info(`Running whisper.cpp: ${whisperBin} ${args.join(" ")}`);
      const proc = child_process.spawn(whisperBin, args);
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      proc.stderr.on("data", (data) => {
        stderr += data.toString();
        log.debug("Whisper progress:", data.toString());
      });
      proc.on("close", async (code) => {
        if (code === 0) {
          try {
            await new Promise((resolve2) => setTimeout(resolve2, 100));
            let result;
            if (await setupManager.FileUtils.fileExists(jsonOutputPath)) {
              const content = await fsPromises.readFile(jsonOutputPath, "utf-8");
              result = JSON.parse(content);
            } else if (stdout.trim()) {
              result = JSON.parse(stdout);
            } else {
              throw new Error("No transcription output found");
            }
            let transcriptText = "";
            let segments = [];
            let language = "";
            if (result.text) {
              transcriptText = result.text;
              segments = result.segments || [];
              language = result.language || "";
            } else if (result.transcription && Array.isArray(result.transcription) && result.transcription.length > 0) {
              transcriptText = result.transcription.map((item) => item.text || "").join(" ");
              segments = result.transcription.map((item) => ({
                text: item.text || "",
                start: item.offsets?.from ? item.offsets.from / 1e3 : 0,
                end: item.offsets?.to ? item.offsets.to / 1e3 : 0
              }));
              language = result.result?.language || result.params?.language || "";
            } else if (result.segments && Array.isArray(result.segments)) {
              transcriptText = result.segments.map((s) => s.text || "").join(" ");
              segments = result.segments;
              language = result.language || "";
            }
            await setupManager.FileUtils.cleanupFile(wavPath);
            await setupManager.FileUtils.cleanupFile(jsonOutputPath);
            resolve({
              text: transcriptText,
              segments,
              language,
              raw: result
            });
          } catch (error) {
            reject(new Error(`Failed to parse transcription: ${error.message}`));
          }
        } else {
          reject(new Error(`Transcription failed with code ${code}: ${stderr}`));
        }
      });
      proc.on("error", (error) => {
        reject(new Error(`Failed to start whisper: ${error.message}`));
      });
    });
  }
}
class DiarizationModule {
  config;
  currentProcess = null;
  constructor(config) {
    this.config = config;
  }
  async diarize(audioPath, transcript) {
    if (this.config.diarization.method === "whisper-native") {
      return await this.diarizeWithWhisper(audioPath);
    }
    return transcript;
  }
  async diarizeWithWhisper(audioPath) {
    const whisperBin = setupManager.getBinaryPath("whisper");
    const modelPath = await setupManager.getModelPath(this.config.transcription?.model || "base.en");
    if (!await setupManager.FileUtils.fileExists(whisperBin)) {
      const setupManager$1 = new setupManager.SetupManager();
      const instructions = setupManager$1.getInstallationInstructions("whisper");
      throw new Error(`Whisper binary not found at: ${whisperBin}

${instructions}`);
    }
    try {
      const helpOutput = child_process.execSync(
        `"${whisperBin}" --help 2>&1 | head -50 || "${whisperBin}" -h 2>&1 | head -50 || true`,
        {
          encoding: "utf-8",
          timeout: 2e3,
          maxBuffer: 16384
        }
      );
      const isPythonWhisper = helpOutput.includes("--output_format") || helpOutput.includes("argument --output_format/-f") || helpOutput.includes("usage: whisper") && !helpOutput.includes("whisper-cli");
      const isWhisperCpp = helpOutput.includes("--output-json") || helpOutput.includes("-oj") || helpOutput.includes("whisper-cli") || helpOutput.includes("file0 file1 ...");
      if (isPythonWhisper && !isWhisperCpp) {
        throw new Error(`Wrong binary detected: Python whisper CLI instead of whisper.cpp`);
      }
    } catch (error) {
      if (error.message.includes("Wrong binary detected")) {
        throw error;
      }
      log.warn("Binary validation check failed:", error.message);
    }
    const ext = setupManager.FileUtils.getFileExtension(audioPath);
    let wavPath;
    const workingDir = await setupManager.FileUtils.getWorkingDirectory();
    if (ext === "wav") {
      const fileName = path.basename(audioPath);
      wavPath = path.join(workingDir, `diarize_${fileName}`);
      await fsPromises.copyFile(audioPath, wavPath);
    } else {
      const transcription = new TranscriptionModule(this.config);
      wavPath = await transcription.convertAudio(audioPath);
    }
    const outputBaseName = setupManager.FileUtils.getFileNameWithoutExtension(path.basename(wavPath));
    const jsonOutputPath = path.join(workingDir, `${outputBaseName}.json`);
    return new Promise((resolve, reject) => {
      const args = [
        "-m",
        modelPath,
        "-f",
        wavPath,
        "-of",
        path.join(workingDir, outputBaseName),
        "-di",
        "-oj"
      ];
      log.info(`Running whisper diarization: ${whisperBin} ${args.join(" ")}`);
      const proc = child_process.spawn(whisperBin, args);
      let stdout = "";
      let stderr = "";
      const timeoutMs = 30 * 60 * 1e3;
      const timeout = setTimeout(() => {
        if (!proc.killed) {
          log.error("Diarization timeout - killing process");
          proc.kill("SIGTERM");
          reject(new Error("Diarization timed out after 30 minutes"));
        }
      }, timeoutMs);
      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      proc.stderr.on("data", (data) => {
        stderr += data.toString();
        log.debug("Whisper diarization progress:", data.toString());
      });
      proc.on("close", async (code) => {
        clearTimeout(timeout);
        this.currentProcess = null;
        if (code === 0) {
          try {
            let result;
            try {
              const content = await fsPromises.readFile(jsonOutputPath, "utf-8");
              result = JSON.parse(content);
            } catch {
              result = JSON.parse(stdout);
            }
            await setupManager.FileUtils.cleanupFile(wavPath);
            await setupManager.FileUtils.cleanupFile(jsonOutputPath);
            resolve({
              text: result.text || "",
              segments: result.segments || [],
              raw: result
            });
          } catch (error) {
            reject(new Error(`Failed to parse diarization output: ${error.message}`));
          }
        } else {
          reject(new Error(`Diarization failed with code ${code}: ${stderr}`));
        }
      });
      proc.on("error", (error) => {
        clearTimeout(timeout);
        this.currentProcess = null;
        reject(new Error(`Failed to start whisper diarization: ${error.message}`));
      });
      this.currentProcess = proc;
    });
  }
  cancel() {
    if (this.currentProcess && !this.currentProcess.killed) {
      log.info("Cancelling diarization process...");
      this.currentProcess.kill("SIGTERM");
    }
  }
}
class AnalysisModule {
  config;
  apiKey;
  genAI = null;
  model = null;
  constructor(config) {
    this.config = config;
    this.apiKey = config.analysis?.apiKey || process.env.GEMINI_API_KEY;
    if (!this.apiKey) {
      log.warn("Gemini API key not configured");
    } else {
      this.genAI = new generativeAi.GoogleGenerativeAI(this.apiKey);
      const modelName = config.analysis?.model || "gemini-2.0-flash-exp";
      this.model = this.genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json"
        }
      });
    }
  }
  async analyze(transcriptText) {
    if (!this.apiKey || !this.model) {
      throw new Error("Gemini API key or model not initialized");
    }
    if (!transcriptText?.trim()) {
      throw new Error("Transcript text is empty");
    }
    log.info(`Analyzing transcript: ${transcriptText.length} characters`);
    const prompt = this.buildAnalysisPrompt(transcriptText);
    try {
      log.info("Sending request to Gemini API...");
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      try {
        const jsonData = JSON.parse(text);
        return this.parseAnalysisFromJSON(jsonData, text);
      } catch (parseError) {
        log.warn("JSON parsing failed, falling back to basic mapping:", parseError);
        return this.fallbackMapping(text);
      }
    } catch (error) {
      log.error("Gemini API error:", error);
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
    return {
      raw: rawText,
      structured: {
        synthesis: jsonData.synthesis || "",
        actionItems: jsonData.actionItems || "",
        critique: jsonData.critique || "",
        insights: jsonData.insights || ""
      },
      synthesis: jsonData.synthesis || "",
      actionItems: jsonData.actionItems || "",
      critique: jsonData.critique || "",
      insights: jsonData.insights || ""
    };
  }
  fallbackMapping(text) {
    return {
      raw: text,
      structured: {
        synthesis: text,
        actionItems: "",
        critique: "",
        insights: ""
      },
      synthesis: text,
      actionItems: "",
      critique: "",
      insights: ""
    };
  }
}
class DocxGenModule {
  config;
  constructor(config) {
    this.config = config;
  }
  async generateReport(transcript, diarized, analysis, outputPath) {
    const doc = new docx.Document({
      sections: [
        {
          properties: {},
          children: [
            new docx.Paragraph({
              text: "Meeting Analysis Report",
              heading: docx.HeadingLevel.TITLE,
              spacing: { after: 400 }
            }),
            ...this.createSynthesisSection(analysis),
            ...this.createActionItemsSection(analysis),
            ...this.createCritiqueSection(analysis),
            ...this.createInsightsSection(analysis),
            ...this.createTranscriptSection(transcript, diarized),
            ...this.createSpeakerAnalysisSection(diarized)
          ]
        }
      ]
    });
    try {
      const buffer = await docx.Packer.toBuffer(doc);
      await fsPromises.writeFile(outputPath, buffer);
      log.info(`DOCX report saved to: ${outputPath}`);
      return outputPath;
    } catch (error) {
      log.error("Failed to generate DOCX:", error);
      throw error;
    }
  }
  createSynthesisSection(analysis) {
    if (!analysis?.synthesis) return [];
    return [
      new docx.Paragraph({
        text: "Meeting Synthesis",
        heading: docx.HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new docx.Paragraph({
        text: analysis.synthesis,
        spacing: { after: 300 }
      })
    ];
  }
  createActionItemsSection(analysis) {
    if (!analysis?.actionItems) return [];
    return [
      new docx.Paragraph({
        text: "Action Items",
        heading: docx.HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new docx.Paragraph({
        text: analysis.actionItems,
        spacing: { after: 300 }
      })
    ];
  }
  createCritiqueSection(analysis) {
    if (!analysis?.critique) return [];
    return [
      new docx.Paragraph({
        text: "Critique & Analysis",
        heading: docx.HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new docx.Paragraph({
        text: analysis.critique,
        spacing: { after: 300 }
      })
    ];
  }
  createInsightsSection(analysis) {
    if (!analysis?.insights) return [];
    return [
      new docx.Paragraph({
        text: "Key Insights",
        heading: docx.HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new docx.Paragraph({
        text: analysis.insights,
        spacing: { after: 300 }
      })
    ];
  }
  createTranscriptSection(transcript, diarized) {
    const transcriptText = diarized?.text || transcript?.text;
    if (!transcriptText) return [];
    return [
      new docx.Paragraph({
        text: "Full Transcript",
        heading: docx.HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      ...this.formatTranscript(transcriptText, diarized)
    ];
  }
  formatTranscript(text, diarized) {
    if (diarized?.segments) {
      return diarized.segments.map((segment) => {
        const speaker = segment.speaker ? `[${segment.speaker}] ` : "";
        return new docx.Paragraph({
          text: `${speaker}${segment.text || ""}`,
          spacing: { after: 100 }
        });
      });
    }
    return text.split("\n").filter((p) => p.trim()).map(
      (p) => new docx.Paragraph({
        text: p.trim(),
        spacing: { after: 100 }
      })
    );
  }
  createSpeakerAnalysisSection(diarized) {
    const speakers = diarized?.segments?.map((s) => s.speaker).filter(Boolean);
    const uniqueSpeakers = Array.from(new Set(speakers));
    if (!uniqueSpeakers.length || !this.config.document?.includeSpeakerAnalysis) {
      return [];
    }
    return [
      new docx.Paragraph({
        text: "Speaker Analysis",
        heading: docx.HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new docx.Paragraph({
        text: `Total speakers identified: ${uniqueSpeakers.length}`,
        spacing: { after: 200 }
      }),
      ...uniqueSpeakers.map(
        (speaker) => new docx.Paragraph({
          text: `- ${speaker}`,
          spacing: { after: 100 }
        })
      )
    ];
  }
}
class MeetingPipeline {
  config;
  transcription;
  diarization;
  analysis;
  docxGen;
  isCancelled = false;
  constructor(config) {
    this.config = config;
    this.transcription = new TranscriptionModule(config);
    this.diarization = new DiarizationModule(config);
    this.analysis = new AnalysisModule(config);
    this.docxGen = new DocxGenModule(config);
  }
  cancel() {
    this.isCancelled = true;
    this.diarization.cancel();
    log.info("Pipeline cancellation requested");
  }
  async process(audioPath, onProgress = () => {
  }) {
    log.info(`Starting pipeline for: ${audioPath}`);
    const results = {
      audioPath,
      transcript: null,
      diarized: null,
      analysis: null,
      docxPath: null,
      errors: []
    };
    try {
      onProgress({
        step: "transcription",
        progress: 0,
        message: "Starting transcription..."
      });
      results.transcript = await this.transcription.transcribe(audioPath);
      onProgress({
        step: "transcription",
        progress: 25,
        message: "Transcription completed",
        type: "partial-result",
        result: { transcript: results.transcript }
      });
      if (this.config.diarization.enabled && !this.isCancelled) {
        try {
          onProgress({
            step: "diarization",
            progress: 25,
            message: "Starting diarization..."
          });
          results.diarized = await this.diarization.diarize(audioPath, results.transcript);
          onProgress({
            step: "diarization",
            progress: 50,
            message: "Diarization completed"
          });
        } catch (error) {
          log.error("Diarization failed:", error);
          results.errors.push({ step: "diarization", error: error.message, critical: false });
        }
      }
      if (this.config.analysis.enabled && !this.isCancelled) {
        try {
          const transcriptToAnalyze = results.diarized?.text || results.transcript.text;
          onProgress({
            step: "analysis",
            progress: 50,
            message: "Starting AI analysis..."
          });
          results.analysis = await this.analysis.analyze(transcriptToAnalyze);
          onProgress({
            step: "analysis",
            progress: 75,
            message: "Analysis completed"
          });
        } catch (error) {
          log.error("Analysis failed:", error);
          results.errors.push({ step: "analysis", error: error.message, critical: false });
        }
      }
      if (this.config.document.enabled && !this.isCancelled) {
        try {
          onProgress({
            step: "document",
            progress: 75,
            message: "Generating report..."
          });
          const outputDir = this.config.output.directory || path.join(os.homedir(), "Meeting Analysis");
          await setupManager.FileUtils.ensureDirectoryExists(outputDir);
          const fileName = setupManager.FileUtils.getFileNameWithoutExtension(audioPath);
          const timestamp = this.config.output.useTimestampedDirs ? (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, -5) : "";
          const outputPath = path.join(
            outputDir,
            timestamp ? `${timestamp}_${fileName}_report.docx` : `${fileName}_report.docx`
          );
          results.docxPath = await this.docxGen.generateReport(
            results.transcript,
            results.diarized,
            results.analysis,
            outputPath
          );
          onProgress({
            step: "document",
            progress: 100,
            message: "Report generated"
          });
        } catch (error) {
          log.error("DOCX generation failed:", error);
          results.errors.push({ step: "docx", error: error.message, critical: false });
        }
      }
      onProgress({
        step: "complete",
        progress: 100,
        message: "Processing complete!"
      });
      return results;
    } catch (error) {
      log.error("Pipeline error:", error);
      results.errors.push({ step: "pipeline", error: error.message, critical: true });
      return results;
    }
  }
}
if (process.parentPort) {
  process.parentPort.on("message", async (e) => {
    const { type, audioPath, config } = e.data;
    if (type === "start") {
      const pipeline = new MeetingPipeline(config);
      try {
        const result = await pipeline.process(audioPath, (progress) => {
          process.parentPort?.postMessage({ type: "progress", data: progress });
        });
        process.parentPort?.postMessage({ type: "result", data: result });
      } catch (error) {
        process.parentPort?.postMessage({
          type: "error",
          data: { message: error.message, stack: error.stack }
        });
      }
    }
  });
}
