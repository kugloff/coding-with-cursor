import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL_NAME = "gemini-2.5-flash";

export class GeminiConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "GeminiConfigurationError";
  }
}

export class GeminiApiError extends Error {
  /**
   * @param {string} message
   * @param {{ cause?: unknown, statusCode?: number }} [options]
   */
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "GeminiApiError";
    this.statusCode = options.statusCode;
  }
}

/**
 * Calls Google Gemini and returns the generated plain text.
 * @param {string} message User prompt / message
 * @returns {Promise<string>}
 */
export async function generateResponse(message) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new GeminiConfigurationError(
      "GEMINI_API_KEY is missing or empty. Set it in the environment before calling the API."
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey.trim());
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  let result;
  try {
    result = await model.generateContent(message);
  } catch (err) {
    throw mapUpstreamError(err);
  }

  const apiResponse = result?.response;
  if (!apiResponse) {
    throw new GeminiApiError("Gemini returned no response object");
  }

  let text;
  try {
    text = apiResponse.text();
  } catch (err) {
    throw new GeminiApiError("Failed to read text from Gemini response", {
      cause: err,
    });
  }

  if (typeof text !== "string" || !text.trim()) {
    throw new GeminiApiError("Gemini returned empty text");
  }

  return text.trim();
}

/**
 * @param {unknown} err
 * @returns {GeminiApiError}
 */
function mapUpstreamError(err) {
  const status = pickStatus(err);
  const detail = pickMessage(err);

  if (status === 401 || status === 403) {
    return new GeminiApiError(
      "Gemini API rejected the request (check GEMINI_API_KEY).",
      { cause: err, statusCode: status }
    );
  }

  if (status === 429) {
    return new GeminiApiError("Gemini API rate limit exceeded. Try again later.", {
      cause: err,
      statusCode: 429,
    });
  }

  if (status != null && status >= 500) {
    return new GeminiApiError("Gemini API is temporarily unavailable.", {
      cause: err,
      statusCode: 502,
    });
  }

  return new GeminiApiError(detail || "Gemini API request failed", {
    cause: err,
    statusCode: status && status >= 400 ? status : 502,
  });
}

/**
 * @param {unknown} err
 * @returns {number | undefined}
 */
function pickStatus(err) {
  if (err && typeof err === "object") {
    if ("status" in err && typeof err.status === "number") return err.status;
    if (
      "error" in err &&
      err.error &&
      typeof err.error === "object" &&
      "code" in err.error &&
      typeof err.error.code === "number"
    ) {
      return err.error.code;
    }
  }
  return undefined;
}

/**
 * @param {unknown} err
 * @returns {string | undefined}
 */
function pickMessage(err) {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return undefined;
}
