const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");
const multer = require("multer");
const { env } = require("../config/env");

const DEFAULT_UPLOAD_DIR = "uploads/item-share";
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

let cleanupTimer = null;

function normalizeUploadDir() {
  const normalized = String(env.shareItemImagePublicDir || "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  return normalized || DEFAULT_UPLOAD_DIR;
}

function resolveUploadDirPath() {
  const publicRoot = path.join(__dirname, "..", "..", "public");
  const relativePath = normalizeUploadDir();
  const segments = relativePath.split("/").filter(Boolean);
  return path.join(publicRoot, ...segments);
}

function buildPublicImagePath(fileName) {
  return `/${normalizeUploadDir()}/${fileName}`;
}

async function ensureShareUploadDir() {
  await fsp.mkdir(resolveUploadDirPath(), { recursive: true });
}

function isPngFile(file) {
  if (!file?.buffer || !(file.buffer instanceof Buffer)) {
    return false;
  }
  if (file.buffer.length < PNG_SIGNATURE.length) {
    return false;
  }
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (file.buffer[index] !== PNG_SIGNATURE[index]) {
      return false;
    }
  }
  return true;
}

function sanitizeMetadataText(value, maxLen = 120) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLen);
}

async function cleanupExpiredShareImages(options = {}) {
  await ensureShareUploadDir();

  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const ttlMs = Math.max(1000, Number(env.shareItemImageTtlSec) * 1000);
  const expireBefore = now - ttlMs;
  const baseDir = resolveUploadDirPath();

  const entries = await fsp.readdir(baseDir, { withFileTypes: true });
  const deleteJobs = entries
    .filter((entry) => entry.isFile())
    .map(async (entry) => {
      const filePath = path.join(baseDir, entry.name);
      const stat = await fsp.stat(filePath);
      if (stat.mtimeMs > expireBefore) {
        return false;
      }

      await fsp.unlink(filePath);
      return true;
    });

  const results = await Promise.allSettled(deleteJobs);
  return results.reduce(
    (acc, result) => {
      if (result.status === "fulfilled" && result.value) {
        acc.removedCount += 1;
        return acc;
      }
      if (result.status === "rejected") {
        acc.errors.push(String(result.reason?.message || result.reason || "cleanup_failed"));
      }
      return acc;
    },
    { removedCount: 0, errors: [] },
  );
}

function initShareImageCleanupJob() {
  if (cleanupTimer) {
    return cleanupTimer;
  }

  cleanupExpiredShareImages().catch((error) => {
    console.warn("[share] initial cleanup failed:", error?.message || error);
  });

  cleanupTimer = setInterval(() => {
    cleanupExpiredShareImages().catch((error) => {
      console.warn("[share] scheduled cleanup failed:", error?.message || error);
    });
  }, env.shareItemImageCleanupIntervalMs);

  if (typeof cleanupTimer.unref === "function") {
    cleanupTimer.unref();
  }
  return cleanupTimer;
}

const uploadItemImageParser = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.shareItemImageMaxBytes,
    files: 1,
  },
}).single("image");

function parseItemImageUpload(req, res, next) {
  uploadItemImageParser(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          ok: false,
          code: "IMAGE_TOO_LARGE",
          message: `image file must be <= ${env.shareItemImageMaxBytes} bytes`,
        });
        return;
      }

      res.status(400).json({
        ok: false,
        code: "INVALID_UPLOAD_PAYLOAD",
        message: String(error.message || "invalid upload payload"),
      });
      return;
    }

    res.status(400).json({
      ok: false,
      code: "INVALID_UPLOAD_PAYLOAD",
      message: String(error?.message || "invalid upload payload"),
    });
  });
}

async function postShareItemImage(req, res) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        ok: false,
        code: "IMAGE_REQUIRED",
        message: "image (PNG file) is required",
      });
    }

    if (String(file.mimetype || "").toLowerCase() !== "image/png" || !isPngFile(file)) {
      return res.status(400).json({
        ok: false,
        code: "PNG_ONLY",
        message: "only PNG images are supported",
      });
    }

    await ensureShareUploadDir();

    const itemName = sanitizeMetadataText(req.body?.item_name || "");
    const characterName = sanitizeMetadataText(req.body?.character_name || "");
    const worldName = sanitizeMetadataText(req.body?.world_name || "");
    const metadataLabel = [worldName, characterName, itemName].filter(Boolean).join(" ");
    const metadataSuffix = metadataLabel ? `-${metadataLabel}` : "";
    const safeMetadataSuffix = metadataSuffix
      .replace(/[^\w\uAC00-\uD7AF-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
    const fileName = `${Date.now()}-${crypto.randomUUID()}${safeMetadataSuffix ? `-${safeMetadataSuffix}` : ""}.png`;

    const uploadPath = path.join(resolveUploadDirPath(), fileName);
    await fsp.writeFile(uploadPath, file.buffer);

    const expiresAt = new Date(Date.now() + env.shareItemImageTtlSec * 1000).toISOString();
    return res.status(201).json({
      ok: true,
      imageUrl: buildPublicImagePath(fileName),
      expiresAt,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      code: "IMAGE_UPLOAD_FAILED",
      message: String(error?.message || "failed to upload item image"),
    });
  }
}

function getShareClientConfig(req, res) {
  res.json({
    ok: true,
    kakaoJsKey: env.kakaoJsKey,
    kakaoEnabled: !!env.kakaoJsKey,
    imageUploadMaxBytes: env.shareItemImageMaxBytes,
    imageTtlSec: env.shareItemImageTtlSec,
  });
}

module.exports = {
  cleanupExpiredShareImages,
  getShareClientConfig,
  initShareImageCleanupJob,
  parseItemImageUpload,
  postShareItemImage,
};
