import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

const SYSTEM_PROMPT = `
You are a friendly English teacher named "Tutor" who answers only questions about the topic "Mass Media".
Answer briefly and clearly in English. 
DO NOT translate texts or help solve assignments or tests. 
If a question is unrelated to "Mass Media", politely say you can only discuss "Mass Media".
`;

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "No message provided" });
    }

    const forbidden = [/translate/i, /перевод/i, /решен/i, /answer\s*key/i];
    if (forbidden.some(p => p.test(message))) {
      return res.json({ reply: "Sorry, I can only discuss the topic 'Mass Media'." });
    }

    const mistralKey = process.env.MISTRAL_API_KEY;
    if (!mistralKey) {
      return res.status(500).json({ error: "Server misconfigured: missing MISTRAL_API_KEY" });
    }

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${mistralKey}`
      },
      body: JSON.stringify({
        model: "mistral-tiny",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: message }
        ],
        temperature: 0.5,
        max_tokens: 150
      })
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "Sorry, no response.";
    res.json({ reply });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/index.html");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Tutor server running on port ${PORT}`));
