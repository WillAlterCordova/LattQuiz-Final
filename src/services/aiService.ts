import { AppError, ErrorCategory } from "./errorService";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

async function isAiEnabled() {
  try {
    const configSnap = await getDoc(doc(db, 'config', 'global'));
    if (configSnap.exists()) {
      return configSnap.data().aiEnabled !== false;
    }
  } catch (e) {
    console.warn("Could not check global AI config, defaulting to enabled", e);
  }
  return true;
}

export async function generateQuestionsAI(
  topics: string | string[], 
  count: number = 5, 
  type: string = 'CLASICO', 
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' = 'MEDIUM',
  title?: string,
  template?: string
) {
  // Check global toggle
  const enabled = await isAiEnabled();
  if (!enabled) {
    throw new AppError({
      message: "La implementación de IA ha sido suspendida temporalmente por el administrador para optimizar recursos.",
      category: ErrorCategory.AI
    });
  }

  const topicsStr = Array.isArray(topics) ? topics.join(", ") : topics;

  try {
    const response = await fetch('/api/ai/generate-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: topicsStr,
        difficulty,
        count,
        type,
        title,
        template
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.questions || [];
  } catch (error: any) {
    console.error("AI Generation Error details:", error);
    throw new AppError({
      message: `Error técnico con la IA: ${error.message?.slice(0, 50)}${error.message?.length > 50 ? '...' : ''}. Por favor intenta de nuevo.`,
      category: ErrorCategory.AI,
      originalError: error,
      context: { topics: topicsStr, type }
    });
  }
}

export async function generateFeedbackAI(question: string, userAnswer: string, isCorrect: boolean) {
  try {
    const response = await fetch('/api/ai/generate-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, userAnswer, isCorrect })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.feedback;
  } catch (error: any) {
    console.error("AI Feedback Error:", error);
    return isCorrect ? "¡Excelente trabajo!" : "Sigue practicando, tú puedes.";
  }
}

export async function generateMissionSummaryAI(responses: any[]) {
  try {
    const response = await fetch('/api/ai/generate-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responses })
    });

    if (!response.ok) throw new Error("Summary API failed");

    const data = await response.json();
    return data.summary;
  } catch (error: any) {
    console.error("AI Summary Error:", error);
    return "Misión completada con éxito. Revisa tus respuestas para identificar áreas de mejora.";
  }
}
