// server.js
import express from "express";
import fetch from "node-fetch";
import rateLimit from "express-rate-limit";

const app = express();
app.use(express.json());

// ограничение запросов по IP (защита от злоупотреблений)
app.use(rateLimit({
  windowMs: 60*60*1000, // 1 час
  max: 60,
  message: { error: "Too many requests, try later." }
}));

const ipAttempts = {};
const MAX_ATTEMPTS_PER_IP = 10;

// Системное сообщение — ЖЁСТКО ограничивает ответ по теме Mass Media
const SYSTEM_PROMPT = `
You are "Tutor", an English teacher who ONLY answers questions about the topic "Mass Media".
Answer shortly, simply, and in English. DO NOT provide translations and DO NOT solve exercises or give test answers.
If question is outside Mass Media, reply: "I can only answer questions about Mass Media."
`;

// Примерный URL Mistral — при необходимости замени на точный из твоей документации
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/"; // проверь в своей доке
const MISTRAL_MODEL = "mistral-tiny"; // замени на нужную модель

app.post("/api/chat", async (req, res) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    ipAttempts[ip] = ipAttempts[ip] || 0;
    if (ipAttempts[ip] >= MAX_ATTEMPTS_PER_IP) {
      return res.status(429).json({ error: "Limit of questions reached for this session." });
    }

    const { question } = req.body;
    if (!question || typeof question !== "string" || question.trim() === "") {
      return res.status(400).json({ error: "Empty question" });
    }

    // простая фильтрация на попытки получить ответы на задания или переводы
    const forbidden = /(translate|перевод|answer key|решен|решать|ответ)/i;
    if (forbidden.test(question)) {
      return res.status(400).json({ error: "Questions asking for translations or solved answers are not allowed." });
    }

    // формируем payload для Mistral — если у тебя другой формат, подставь нужный
    const payload = {
      model: MISTRAL_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: question }
      ],
      temperature: 0.2,
      max_tokens: 160
    };

    const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
    if (!MISTRAL_API_KEY) return res.status(500).json({ error: "Server misconfigured: missing MISTRAL_API_KEY" });

    const r = await fetch(MISTRAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MISTRAL_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json();
    if (!r.ok) {
      console.error("Mistral error:", data);
      return res.status(500).json({ error: "AI service error" });
    }

    // Здесь структура ответа может отличаться у Mistral — подстрой под реальную
    const assistantText = data.choices?.[0]?.message?.content?.trim() 
                          || data.output?.[0]?.content?.[0]?.text?.trim()
                          || null;

    if (!assistantText) return res.status(500).json({ error: "No answer from AI" });

    ipAttempts[ip]++;

    res.json({ answer: assistantText, remaining: MAX_ATTEMPTS_PER_IP - ipAttempts[ip] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
