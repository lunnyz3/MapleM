const axios = require("axios");
const crypto = require("crypto");
const { env } = require("../config/env");

const SESSION_EXPIRED_CODE = "SESSION_EXPIRED";
const CHATBOT_DISABLED_CODE = "CHATBOT_DISABLED";

function parseCookies(rawCookieHeader) {
  const header = String(rawCookieHeader || "").trim();
  if (!header) {
    return {};
  }

  return header.split(";").reduce((acc, pair) => {
    const [rawName, ...rawValueParts] = String(pair || "").trim().split("=");
    const name = decodeURIComponent(String(rawName || "").trim());
    if (!name) {
      return acc;
    }

    const value = decodeURIComponent(rawValueParts.join("=").trim());
    acc[name] = value;
    return acc;
  }, {});
}

function getCookieValue(req, cookieName) {
  const cookies = parseCookies(req.headers?.cookie);
  return String(cookies[cookieName] || "").trim();
}

function appendSetCookieHeader(res, cookieValue) {
  const parts = [
    `${encodeURIComponent(env.chatCookieName)}=${encodeURIComponent(cookieValue)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${env.chatCookieMaxAgeSec}`
  ];
  if (env.chatCookieSecure) {
    parts.push("Secure");
  }

  const nextCookieHeader = parts.join("; ");
  const prevSetCookie = res.getHeader("Set-Cookie");
  if (!prevSetCookie) {
    res.setHeader("Set-Cookie", [nextCookieHeader]);
    return;
  }

  const prevList = Array.isArray(prevSetCookie) ? prevSetCookie : [String(prevSetCookie)];
  res.setHeader("Set-Cookie", [...prevList, nextCookieHeader]);
}

function ensureChatSid(req, res) {
  const existing = getCookieValue(req, env.chatCookieName);
  if (existing) {
    return existing;
  }

  const created = crypto.randomUUID();
  appendSetCookieHeader(res, created);
  return created;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function validateCharacterScope(req, source = "query") {
  const input = source === "body" ? req.body || {} : req.query || {};
  const worldName = normalizeText(input.world_name);
  const characterName = normalizeText(input.character_name);

  if (!worldName || !characterName) {
    return {
      ok: false,
      error: {
        ok: false,
        code: "INVALID_CHARACTER_SCOPE",
        message: "world_name and character_name are required"
      }
    };
  }

  return {
    ok: true,
    worldName,
    characterName
  };
}

function normalizeErrorMessage(error) {
  const status = Number(error?.response?.status);
  if (Number.isFinite(status)) {
    return "Chatbot upstream request failed";
  }

  const code = String(error?.code || "").toUpperCase();
  if (code === "ECONNREFUSED") {
    return "Python chatbot service is not reachable";
  }
  if (code === "ETIMEDOUT" || code === "ECONNABORTED") {
    return "Python chatbot service timed out";
  }

  return String(error?.message || "Chatbot proxy request failed");
}

function resolvePythonUrl(pathname) {
  const base = String(env.pythonChatBaseUrl || "").trim().replace(/\/+$/, "");
  const path = `/${String(pathname || "").replace(/^\/+/, "")}`;
  return `${base}${path}`;
}

async function callPythonChat({ method, path, params, body }) {
  const response = await axios.request({
    method,
    url: resolvePythonUrl(path),
    params,
    data: body,
    timeout: env.chatProxyTimeoutMs,
    validateStatus: () => true
  });

  return response;
}

function sendFeatureDisabled(res, statusCode = 503) {
  return res.status(statusCode).json({
    ok: false,
    status: "unavailable",
    code: CHATBOT_DISABLED_CODE,
    message: "Chatbot is disabled. Enable CHATBOT_ENABLED=true to use chat endpoints."
  });
}

function relayProxyResponse(res, proxyResponse) {
  const statusCode = Number(proxyResponse?.status);
  const safeStatus = Number.isFinite(statusCode) ? statusCode : 502;
  const payload =
    proxyResponse?.data && typeof proxyResponse.data === "object"
      ? proxyResponse.data
      : { ok: false, message: "Invalid chatbot upstream payload" };
  return res.status(safeStatus).json(payload);
}

async function getChatSessionStatus(req, res) {
  if (!env.chatbotEnabled) {
    // A status probe is not an error: the page just hides the chat panel.
    return sendFeatureDisabled(res, 200);
  }

  const scope = validateCharacterScope(req, "query");
  if (!scope.ok) {
    return res.status(400).json(scope.error);
  }

  const chatSid = ensureChatSid(req, res);

  try {
    const upstream = await callPythonChat({
      method: "GET",
      path: "/v1/chat/session/status",
      params: {
        chat_sid: chatSid,
        world_name: scope.worldName,
        character_name: scope.characterName
      }
    });
    return relayProxyResponse(res, upstream);
  } catch (error) {
    return res.status(502).json({
      ok: false,
      status: "error",
      message: normalizeErrorMessage(error)
    });
  }
}

async function postChatMessage(req, res) {
  if (!env.chatbotEnabled) {
    return sendFeatureDisabled(res);
  }

  const scope = validateCharacterScope(req, "body");
  if (!scope.ok) {
    return res.status(400).json(scope.error);
  }

  const message = normalizeText(req.body?.message);
  if (!message) {
    return res.status(400).json({
      ok: false,
      code: "INVALID_MESSAGE",
      message: "message is required"
    });
  }

  const chatSid = ensureChatSid(req, res);

  try {
    const upstream = await callPythonChat({
      method: "POST",
      path: "/v1/chat/message",
      body: {
        chat_sid: chatSid,
        world_name: scope.worldName,
        character_name: scope.characterName,
        message
      }
    });

    if (Number(upstream?.status) === 409 && upstream?.data?.code === SESSION_EXPIRED_CODE) {
      return relayProxyResponse(res, upstream);
    }

    return relayProxyResponse(res, upstream);
  } catch (error) {
    return res.status(502).json({
      ok: false,
      status: "error",
      message: normalizeErrorMessage(error)
    });
  }
}

async function resetChatSession(req, res) {
  if (!env.chatbotEnabled) {
    return sendFeatureDisabled(res);
  }

  const scope = validateCharacterScope(req, "body");
  if (!scope.ok) {
    return res.status(400).json(scope.error);
  }

  const chatSid = ensureChatSid(req, res);

  try {
    const upstream = await callPythonChat({
      method: "POST",
      path: "/v1/chat/session/reset",
      body: {
        chat_sid: chatSid,
        world_name: scope.worldName,
        character_name: scope.characterName
      }
    });

    return relayProxyResponse(res, upstream);
  } catch (error) {
    return res.status(502).json({
      ok: false,
      status: "error",
      message: normalizeErrorMessage(error)
    });
  }
}

module.exports = {
  getChatSessionStatus,
  postChatMessage,
  resetChatSession
};
