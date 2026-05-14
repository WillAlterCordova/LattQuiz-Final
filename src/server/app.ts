import express from "express";
import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

export function createExpressApp() {
  const app = express();
  app.use(express.json());

  // Initialize Groq client lazily
  let groq: Groq | null = null;
  const getGroq = () => {
    if (!groq) {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        throw new Error("GROQ_API_KEY is missing in environment variables");
      }
      groq = new Groq({ apiKey });
    }
    return groq;
  };

  // AI Generation Endpoint
  app.post("/api/ai/generate-questions", async (req, res) => {
    try {
      const { topic, difficulty, count, type } = req.body;
      const client = getGroq();

      const prompt = `Genera ${count} preguntas de tipo ${type} sobre el tema "${topic}" con una dificultad ${difficulty}. 
      Responde EXCLUSIVAMENTE en formato JSON con la siguiente estructura:
      {
        "questions": [
          {
            "text": "la pregunta",
            "type": "${type}",
            "options": ["opcion1", "opcion2", "opcion3", "opcion4"],
            "correctAnswer": "la respuesta correcta exacta",
            "explanation": "explicación breve",
            "difficulty": "${difficulty}",
            "points": 10
          }
        ]
      }
      Asegúrate de que las opciones sean coherentes y una sea claramente la correcta.`;

      const completion = await client.chat.completions.create({
        messages: [
          { role: "system", content: "Eres un experto diseñador de exámenes pedagógicos. Generas contenido educativo de alta calidad en formato JSON." },
          { role: "user", content: prompt }
        ],
        model: "llama-3.3-70b-versatile",
        response_format: { type: "json_object" }
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) throw new Error("No data received from Groq");

      res.json(JSON.parse(responseContent));
    } catch (error: any) {
      console.error("Groq AI Error:", error);
      res.status(500).json({ error: error.message || "Error generating AI questions" });
    }
  });

  // Feedback Generation Endpoint
  app.post("/api/ai/generate-feedback", async (req, res) => {
    try {
      const { question, userAnswer, isCorrect } = req.body;
      const client = getGroq();

      const prompt = `Analiza la siguiente interacción en un quiz:
      Pregunta: ${question}
      Respuesta del usuario: ${userAnswer}
      Resultado: ${isCorrect ? 'Correcto' : 'Incorrecto'}
      
      Genera un feedback breve, motivador y educativo (máximo 2 frases). 
      Si es incorrecto, explica por qué sin ser desalentador.
      Si es correcto, refuerza el conocimiento.`;

      const completion = await client.chat.completions.create({
        messages: [
          { role: "system", content: "Eres un tutor virtual motivador y experto." },
          { role: "user", content: prompt }
        ],
        model: "llama-3.1-8b-instant",
      });

      res.json({ feedback: completion.choices[0]?.message?.content });
    } catch (error: any) {
      console.error("Groq Feedback Error:", error);
      res.status(500).json({ error: error.message || "Error generating AI feedback" });
    }
  });

  // Summary Generation Endpoint
  app.post("/api/ai/generate-summary", async (req, res) => {
    try {
      const { responses } = req.body;
      const client = getGroq();

      const summaryData = responses.map((r: any) => 
        `P: ${r.questionText} | R: ${r.studentAnswer} | Result: ${r.isCorrect ? 'Correct' : 'Incorrect'} (Correct was: ${r.correctAnswer})`
      ).join("\n");

      const prompt = `Analiza el desempeño global del estudiante en la misión basándote en estas respuestas:
      ${summaryData}
      
      Genera un resumen pedagógico (máximo 3 frases) que destaque sus fortalezas y mencione en qué tema específico debe enfocarse para mejorar. 
      Habla directamente al estudiante con un tono alentador y profesional.`;

      const completion = await client.chat.completions.create({
        messages: [
          { role: "system", content: "Eres un mentor académico experto en análisis de desempeño neural y pedagógico." },
          { role: "user", content: prompt }
        ],
        model: "llama-3.1-8b-instant",
      });

      res.json({ summary: completion.choices[0]?.message?.content });
    } catch (error: any) {
      console.error("Groq Summary Error:", error);
      res.status(500).json({ error: error.message || "Error generating AI summary" });
    }
  });

  return app;
}
