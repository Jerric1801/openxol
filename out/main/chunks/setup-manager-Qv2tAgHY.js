"use strict";
const https = require("https");
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const log = require("electron-log");
const os = require("os");
const electron = require("electron");
class FileUtils {
  static async getWorkingDirectory() {
    let baseTempDir;
    try {
      baseTempDir = electron.app.getPath("temp");
    } catch (e) {
      baseTempDir = os.tmpdir();
    }
    const workingDir = path.join(baseTempDir, "Meeting Analysis", "temp");
    await this.ensureDirectoryExists(workingDir);
    return workingDir;
  }
  static async ensureDirectoryExists(dirPath) {
    try {
      await fsPromises.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
    }
  }
  static async writeFile(filePath, content) {
    await this.ensureDirectoryExists(path.dirname(filePath));
    await fsPromises.writeFile(filePath, content, "utf-8");
  }
  static async readFile(filePath) {
    return await fsPromises.readFile(filePath, "utf-8");
  }
  static getFileExtension(filePath) {
    return path.extname(filePath).toLowerCase().slice(1);
  }
  static getFileNameWithoutExtension(filePath) {
    return path.basename(filePath, path.extname(filePath));
  }
  static async fileExists(filePath) {
    try {
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  static formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  }
  static async cleanupFile(filePath) {
    try {
      await fsPromises.unlink(filePath);
      log.debug(`Cleaned up temp file: ${filePath}`);
    } catch (error) {
      log.warn(`Failed to cleanup temp file ${filePath}:`, error.message);
    }
  }
}
const PLATFORM_DIR = process.platform === "win32" ? "win32" : process.platform === "linux" ? "linux" : "darwin";
function isPackaged() {
  return process.env["APP_IS_PACKAGED"] === "1";
}
function appPath() {
  return process.env["APP_PATH"] || "";
}
function getBinaryDir() {
  if (isPackaged()) {
    const candidates = [
      path.join(process.resourcesPath, "bin", PLATFORM_DIR),
      path.join(appPath(), "..", "bin", PLATFORM_DIR),
      path.join(process.resourcesPath, "..", "bin", PLATFORM_DIR)
    ];
    for (const dir of candidates) {
      if (fs.existsSync(dir)) {
        log.info(`Binary dir resolved: ${dir}`);
        return dir;
      }
    }
    log.warn(`No binary dir found. Tried: ${candidates.join(", ")}`);
    return candidates[0] || "";
  }
  return path.join(appPath(), "bin", PLATFORM_DIR);
}
function getBinaryPath(name) {
  const filename = process.platform === "win32" ? `${name}.exe` : name;
  return path.join(getBinaryDir(), filename);
}
async function getModelPath(modelName = "base.en") {
  const userData = process.env["APP_USER_DATA"] || "";
  const userDataPath = path.join(userData, "models", "whisper", `ggml-${modelName}.bin`);
  if (await FileUtils.fileExists(userDataPath)) {
    log.info(`Model resolved from userData: ${userDataPath}`);
    return userDataPath;
  }
  const bundledPath = isPackaged() ? path.join(process.resourcesPath, "resources", "models", "whisper", `ggml-${modelName}.bin`) : path.join(__dirname, "../../resources/models/whisper", `ggml-${modelName}.bin`);
  if (await FileUtils.fileExists(bundledPath)) {
    log.info(`Model resolved from bundle: ${bundledPath}`);
    return bundledPath;
  }
  log.warn(`Model not found in userData or bundle. Will download to: ${userDataPath}`);
  return userDataPath;
}
const ensureDir = async (dir) => {
  try {
    await fsPromises.access(dir);
  } catch {
    await fsPromises.mkdir(dir, { recursive: true });
  }
};
class SetupManager {
  setupDataPath;
  modelsPath;
  constructor() {
    const userData = process.env["APP_USER_DATA"] || "";
    this.setupDataPath = path.join(userData, "setup.json");
    this.modelsPath = path.join(userData, "models", "whisper");
  }
  getBinaryPath(name) {
    return getBinaryPath(name);
  }
  async checkFileExists(filePath) {
    try {
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  async checkSetupComplete() {
    const whisperPath = this.getBinaryPath("whisper");
    const ffmpegPath = this.getBinaryPath("ffmpeg");
    const modelPath = await getModelPath("base.en");
    const whisperOk = await this.checkFileExists(whisperPath);
    const ffmpegOk = await this.checkFileExists(ffmpegPath);
    const modelOk = await this.checkFileExists(modelPath);
    const missing = [];
    if (!whisperOk) missing.push("whisper binary");
    if (!ffmpegOk) missing.push("ffmpeg binary");
    if (!modelOk) missing.push("AI Model (base.en)");
    return {
      complete: whisperOk && ffmpegOk && modelOk,
      missing
    };
  }
  async downloadModel(modelName, onProgress) {
    const fileName = `ggml-${modelName}.bin`;
    const destPath = path.join(this.modelsPath, fileName);
    const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${fileName}`;
    if (await this.checkFileExists(destPath)) {
      log.info(`Model ${modelName} already exists at ${destPath}`);
      return destPath;
    }
    await ensureDir(this.modelsPath);
    return new Promise((resolve, reject) => {
      const download = (downloadUrl) => {
        https.get(downloadUrl, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            log.info(`Redirecting to: ${response.headers.location}`);
            return download(response.headers.location);
          }
          if (response.statusCode !== 200) {
            return reject(new Error(`Download failed: HTTP ${response.statusCode}`));
          }
          const totalSize = parseInt(response.headers["content-length"] || "0", 10);
          let downloaded = 0;
          const fileStream = fs.createWriteStream(destPath);
          response.on("data", (chunk) => {
            downloaded += chunk.length;
            fileStream.write(chunk);
            if (onProgress && totalSize) {
              onProgress({
                step: "model",
                progress: downloaded / totalSize * 100,
                message: `Downloading Model... ${Math.round(downloaded / totalSize * 100)}%`
              });
            }
          });
          response.on("end", () => {
            fileStream.end();
            fileStream.on("finish", () => {
              log.info(`Model downloaded successfully to ${destPath}`);
              resolve(destPath);
            });
          });
          fileStream.on("error", (err) => {
            fsPromises.unlink(destPath).catch(() => {
            });
            reject(err);
          });
        }).on("error", (err) => {
          fsPromises.unlink(destPath).catch(() => {
          });
          reject(err);
        });
      };
      log.info(`Starting download from ${url}`);
      download(url);
    });
  }
  async performSetup(onProgress) {
    const whisperPath = this.getBinaryPath("whisper");
    const ffmpegPath = this.getBinaryPath("ffmpeg");
    if (!await this.checkFileExists(whisperPath)) {
      const errorMsg = `Critical: Whisper binary not found at ${whisperPath}`;
      log.error(errorMsg);
      if (onProgress) {
        onProgress({ step: "error", message: errorMsg, progress: 0 });
      }
      throw new Error(errorMsg);
    }
    if (!await this.checkFileExists(ffmpegPath)) {
      const errorMsg = `Critical: FFmpeg binary not found at ${ffmpegPath}`;
      log.error(errorMsg);
      if (onProgress) {
        onProgress({ step: "error", message: errorMsg, progress: 0 });
      }
      throw new Error(errorMsg);
    }
    log.info("Binaries verified. Starting model download...");
    try {
      if (onProgress) {
        onProgress({ step: "model", message: "Starting download...", progress: 0 });
      }
      await this.downloadModel("base.en", onProgress);
      if (onProgress) {
        onProgress({
          step: "model",
          message: "Model ready",
          progress: 100
        });
      }
    } catch (error) {
      log.error("Model download failed:", error);
      const errorMsg = `Failed to download AI Model: ${error.message}`;
      if (onProgress) {
        onProgress({ step: "error", message: errorMsg, progress: 0 });
      }
      throw error;
    }
    const modelPath = path.join(this.modelsPath, "ggml-base.en.bin");
    if (!await this.checkFileExists(modelPath)) {
      const errorMsg = "Model download completed but file not found";
      log.error(errorMsg);
      throw new Error(errorMsg);
    }
    log.info("Setup completed successfully");
    if (onProgress) {
      onProgress({
        step: "complete",
        message: "Setup complete!",
        progress: 100
      });
    }
    return { success: true };
  }
  getInstallationInstructions(name) {
    const platform = process.platform;
    const arch = process.arch;
    if (process.env["APP_IS_PACKAGED"] === "1") {
      return `Required binary '${name}' is missing from this installation. Please re-download OpenXol from the official website.`;
    }
    if (name === "whisper") {
      if (platform === "darwin") {
        const archFlag = arch === "arm64" ? "-DGGML_METAL=ON" : "";
        return `whisper.cpp binary missing (macOS ${arch}). Build from source:
1. git clone https://github.com/ggerganov/whisper.cpp
2. cd whisper.cpp && mkdir build && cd build
3. cmake ${archFlag} .. && make -j
4. cp build/bin/whisper-cli <project>/bin/darwin/whisper
5. chmod +x <project>/bin/darwin/whisper`;
      } else if (platform === "win32") {
        return `whisper.cpp binary missing (Windows). Download from:
https://github.com/ggerganov/whisper.cpp/releases
Place whisper.exe in: bin/win32/whisper.exe`;
      } else {
        return `whisper.cpp binary missing (Linux ${arch}). Build from source:
1. git clone https://github.com/ggerganov/whisper.cpp
2. cd whisper.cpp && mkdir build && cd build && cmake .. && make -j
3. cp build/bin/whisper-cli <project>/bin/linux/whisper
4. chmod +x <project>/bin/linux/whisper`;
      }
    } else if (name === "ffmpeg") {
      if (platform === "darwin") {
        return `ffmpeg binary missing (macOS ${arch}):
brew install ffmpeg && cp $(which ffmpeg) bin/darwin/ffmpeg && chmod +x bin/darwin/ffmpeg`;
      } else if (platform === "win32") {
        return `ffmpeg binary missing (Windows). Download from https://www.gyan.dev/ffmpeg/builds/
Place ffmpeg.exe in: bin/win32/ffmpeg.exe`;
      } else {
        return `ffmpeg binary missing (Linux ${arch}):
sudo apt install ffmpeg   # or equivalent for your distro
cp $(which ffmpeg) bin/linux/ffmpeg && chmod +x bin/linux/ffmpeg`;
      }
    }
    return `Binary '${name}' not found for ${platform}/${arch}. Place it in bin/${PLATFORM_DIR}/.`;
  }
}
exports.FileUtils = FileUtils;
exports.SetupManager = SetupManager;
exports.getBinaryPath = getBinaryPath;
exports.getModelPath = getModelPath;
