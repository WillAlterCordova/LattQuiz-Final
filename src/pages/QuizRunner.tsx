import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router';
import { useAuthStore } from '../store/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, Calculator, X, Trophy, Users, Star, ArrowRight, ShieldAlert, Zap, RefreshCw, Eye, BrainCircuit, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { collection, doc, addDoc, runTransaction } from 'firebase/firestore';
// @ts-ignore
import { evaluate } from 'mathjs';
import { supabase } from '../lib/supabase';
import { errorService } from '../services/errorService';
import { generateQuestionsAI, generateFeedbackAI } from '../services/aiService';
import { notify } from '../components/NeonNotification';
import { WILDCARDS, WildcardType } from '../components/WildcardSystem';
import 'katex/dist/katex.min.css';
// @ts-ignore
import { InlineMath } from 'react-katex';
import { Volume2 } from 'lucide-react';
import playSound from '../lib/sounds';

export default function QuizRunner() {
  const { quizId, sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  
  const [session, setSession] = useState<any>(null);
  const [quiz, setQuiz] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [participant, setParticipant] = useState<any>(null);
  const [globalTimeRemaining, setGlobalTimeRemaining] = useState<number | null>(null);
  const [isNotAvailable, setIsNotAvailable] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  
  const [blockedReason, setBlockedReason] = useState('');
  const [warnings, setWarnings] = useState(0);
  const [showWarningModal, setShowWarningModal] = useState(true);
  const [showKickedModal, setShowKickedModal] = useState(false);
  const [globalConfig, setGlobalConfig] = useState<any>({ maxProtocolViolations: 3 });
  const [globalRankingsEnabled, setGlobalRankingsEnabled] = useState(true);
  const maxWarnings = 3;

  // Load global config
  useEffect(() => {
    const fetchConfig = async () => {
      const { data } = await supabase.from('config').select('*').eq('id', 'global').single();
      if (data) {
        setGlobalConfig(data.data);
        setGlobalRankingsEnabled(data.data.rankingsEnabled !== false);
      }
    };
    fetchConfig();

    const channel = supabase.channel('quiz_runner_config')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'config', filter: `id=eq.global` }, () => {
        fetchConfig();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const [calcOpen, setCalcOpen] = useState(false);
  const [calcInput, setCalcInput] = useState('');

  const [answering, setAnswering] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<{ correct: boolean, points: number } | null>(null);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [loadingAiFeedback, setLoadingAiFeedback] = useState(false);
  const [soloQuestionIndex, setSoloQuestionIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [responses, setResponses] = useState<any[]>([]);
  const [summaryAiFeedback, setSummaryAiFeedback] = useState<string | null>(null);
  const [loadingSummaryAi, setLoadingSummaryAi] = useState(false);
  
  // Feedback Surveys
  const [survey, setSurvey] = useState<any>(null);
  const [surveyCompleted, setSurveyCompleted] = useState(false);
  const [surveyResponses, setSurveyResponses] = useState<Record<string, any>>({});
  const [isSubmittingSurvey, setIsSubmittingSurvey] = useState(false);

  // Load Session if applicable
  useEffect(() => {
    if (!sessionId || !user) return;
    
    // Join logic
    const joinSession = async () => {
      const { data: pSnap } = await supabase.from('session_participants')
        .select('*')
        .eq('session_id', sessionId)
        .eq('student_id', user.uid)
        .single();

      if (!pSnap) {
        await supabase.from('session_participants').insert({
          session_id: sessionId,
          student_id: user.uid,
          full_name: user.displayName || user.generatedId,
          score: 0,
          answered_this_round: false,
          joined_at: new Date().toISOString()
        });
      }
    };
    joinSession();

    const fetchSession = async () => {
      const { data } = await supabase.from('sessions').select('*').eq('id', sessionId).single();
      if (data) setSession(data);
    };
    fetchSession();

    const fetchParticipant = async () => {
      const { data: pData } = await supabase.from('session_participants')
        .select('*')
        .eq('session_id', sessionId)
        .eq('student_id', user.uid)
        .single();
      
      if (pData) {
        // Sync wildcards from profile
        const { data: uData } = await supabase.from('profiles').select('wildcards').eq('id', user.uid).single();
        if (uData) {
          pData.wildcards = uData.wildcards || {};
        }
        setParticipant(pData);
      }
    };
    fetchParticipant();

    const sessionChannel = supabase.channel(`session_${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` }, () => {
        fetchSession();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_participants', filter: `session_id=eq.${sessionId}` }, () => {
        fetchParticipant();
      })
      .subscribe();

    const fetchAllP = async () => {
      try {
        const { data } = await supabase.from('session_participants').select('*').eq('session_id', sessionId);
        if (data) setParticipants(data);
      } catch (e) {}
    };
    fetchAllP();

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && session?.status !== 'FINISHED' && !session?.rankings_suspended && globalRankingsEnabled) {
        fetchAllP();
      }
    }, session?.type === 'A_LA_CIMA' ? 10000 : 30000);

    return () => {
      supabase.removeChannel(sessionChannel);
      clearInterval(interval);
    };
  }, [sessionId, user?.uid, globalRankingsEnabled]);

  // Load Questions
  useEffect(() => {
    setActiveWildcards({});
    setHiddenOptions([]);
  }, [session?.currentQuestionIndex]);

  useEffect(() => {
    const qId = session?.quizId || quizId;
    if (!qId) return;

    const fetchQ = async () => {
      const { data: qData } = await supabase.from('quizzes').select('*').eq('id', qId).single();
      if (!qData) return;
      
      // Availability & Assignment Check
      const now = new Date();
      if (qData.status !== 'PUBLISHED' && !qData.is_open) {
        setIsNotAvailable(true);
        setAvailabilityError('Esta misión no ha sido publicada aún por el docente.');
        return;
      }

      if (qData.available_from) {
        if (now < new Date(qData.available_from)) {
          setIsNotAvailable(true);
          setAvailabilityError(`Esta misión estará disponible a partir de: ${new Date(qData.available_from).toLocaleString()}`);
          return;
        }
      }
      if (qData.available_to) {
        if (now > new Date(qData.available_to)) {
          setIsNotAvailable(true);
          setAvailabilityError('El plazo para completar esta misión ha expirado.');
          return;
        }
      }

      // Check assignment
      const isAssignedIndividually = qData.assigned_user_ids?.includes(user?.uid);
      const isAssignedToGroup = qData.assigned_group_ids?.some((gid: string) => user?.groupIds?.includes(gid));
      
      if (!qData.is_open && !isAssignedIndividually && !isAssignedToGroup && user?.role === 'STUDENT') {
        setIsNotAvailable(true);
        setAvailabilityError('No tienes acceso autorizado a esta misión. Contacta a tu docente.');
        return;
      }

      setQuiz(qData);

      // Initialize global timer for solo mode if durationMinutes is set
      if (!sessionId && qData.duration_minutes) {
        setGlobalTimeRemaining(qData.duration_minutes * 60);
      }

      // Fetch Survey for this quiz
      try {
        const { data: sData } = await supabase.from('surveys')
          .select('*')
          .eq('quiz_id', qId)
          .eq('active', true)
          .single();

        if (sData) {
          setSurvey(sData);
          
          // Check if already responded
          const { data: rData } = await supabase.from('survey_responses')
            .select('id')
            .eq('survey_id', sData.id)
            .eq('student_id', user?.uid)
            .single();
          if (rData) setSurveyCompleted(true);
        }
      } catch (e) {}

      const { data: allQs } = await supabase.from('questions').select('*').eq('quiz_id', qId);
      let shuffled = allQs || [];
      
      // Randomization logic
      if (qData.questions_per_attempt && qData.questions_per_attempt < shuffled.length) {
         shuffled = shuffled.sort(() => Math.random() - 0.5).slice(0, qData.questions_per_attempt);
      }
      setQuestions(shuffled);
    };
    fetchQ();
  }, [session?.quizId, quizId, user?.uid]);

  // Global Timer Effect
  useEffect(() => {
    if (globalTimeRemaining === null || globalTimeRemaining <= 0 || showSummary || answering) return;

    const timer = setInterval(() => {
      setGlobalTimeRemaining(prev => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(timer);
          saveAttempt(participant?.score || 0);
          notify('¡TIEMPO AGOTADO! Guardando resultados...', 'warning');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [globalTimeRemaining, showSummary, answering]);

  // Anti-cheat logic
  useEffect(() => {
    if (!user) return;

    const trackViolation = async (type: 'tab' | 'phone') => {
      const { data: pData } = await supabase.from('profiles').select('*').eq('id', user.uid).single();
      if (!pData) return;
      
      const newTabViolations = (pData.tab_violations || 0) + (type === 'tab' ? 1 : 0);
      const newPhoneViolations = (pData.phone_violations || 0) + (type === 'phone' ? 1 : 0);
      const total = newTabViolations + newPhoneViolations;
      
      const updateData: any = {
        tab_violations: newTabViolations,
        phone_violations: newPhoneViolations,
        last_violation_at: new Date().toISOString()
      };

      // Create a detailed violation log
      try {
        await supabase.from('violations').insert({
          student_id: user.uid,
          full_name: user.displayName || user.generatedId,
          type,
          quiz_id: sessionId ? (session?.quiz_id || quizId) : quizId,
          quiz_title: quiz?.quiz_title || session?.quiz_title || 'Sin Título',
          session_id: sessionId || null,
          timestamp: new Date().toISOString(),
          warning_count: (warnings + 1)
        });
      } catch (e) {
        console.error("Error logging violation:", e);
      }

      if (total >= (globalConfig?.maxProtocolViolations || 3)) {
        updateData.is_blocked = true;
        updateData.block_reason = `Múltiples violaciones de protocolo de seguridad (Límite: ${globalConfig?.maxProtocolViolations || 3})`;
        updateData.active = false;
        setShowKickedModal(true);
      }

      await supabase.from('profiles').update(updateData).eq('id', user.uid);
      
      // Restart logic for solo mode or if session allows
      if (!sessionId && type === 'tab') {
        restartQuiz();
      }
    };

    const restartQuiz = () => {
      playSound.block();
      notify('¡PROTOCOL VIOLATED! Reiniciando evaluación con reactivos nuevos...', 'error');
      setSoloQuestionIndex(0);
      setQuestions(prev => [...prev].sort(() => Math.random() - 0.5));
      setWarnings(0); 
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && !sessionId) {
        const newWarnings = warnings + 1;
        setWarnings(newWarnings);
        trackViolation('tab');
        if (newWarnings >= maxWarnings) {
           playSound.block();
           setShowKickedModal(true);
        } else {
           playSound.warning();
           notify(`¡ALERTA! Protocolo de seguridad violado (Tab Switch). Intento ${newWarnings} de ${maxWarnings}`, 'warning');
        }
      }
    };

    const handleBlur = () => {
      if (!sessionId) {
        playSound.warning();
        trackViolation('phone');
        notify('Pérdida de enfoque detectada (Posible notificación o cambio de app).', 'warning');
      }
    };

    // Check if initially blocked
    supabase.from('profiles').select('is_blocked, active').eq('id', user.uid).single().then(({ data }) => {
      if (data && (data.is_blocked || data.active === false)) {
        setShowKickedModal(true);
      }
    });

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, [warnings, sessionId, user?.uid]);

  const [draggedOption, setDraggedOption] = useState<string | null>(null);
  const [droppedMapping, setDroppedMapping] = useState<Record<number, string>>({});
  const [identificationAnswers, setIdentificationAnswers] = useState<Record<number, string>>({});

  const handleDrop = (targetIdx: number) => {
    if (!draggedOption) return;
    
    const qIndex = sessionId ? (session?.currentQuestionIndex || 0) : soloQuestionIndex;
    const currentQ = questions[qIndex];
    if (!currentQ) return;

    setDroppedMapping(prev => ({ ...prev, [targetIdx]: draggedOption }));
    setIdentificationAnswers(prev => ({ ...prev, [targetIdx]: draggedOption }));
    
    try {
      const opt = currentQ.options[targetIdx];
      const data = JSON.parse(opt);
      if (draggedOption.trim().toLowerCase() === (data.answer || '').toLowerCase()) {
         playSound.success();
         // Instead of auto-submitting the whole question, we just mark this spot as correct in state
      } else {
         playSound.error();
      }
    } catch (e) {
      console.error("Drop Parse Error:", e);
    }
    
    setDraggedOption(null);
  };

  const submitIdentification = async () => {
    const qIndex = sessionId ? (session?.currentQuestionIndex || 0) : soloQuestionIndex;
    const currentQ = questions[qIndex];
    if (!currentQ) return;

    let correctCount = 0;
    (currentQ.options || []).forEach((optStr: string, i: number) => {
      try {
        const data = JSON.parse(optStr);
        if (identificationAnswers[i]?.trim().toLowerCase() === data.answer?.toLowerCase()) {
          correctCount++;
        }
      } catch(e){}
    });

    // We can decide how to grade. For now, if all are correct or just partial?
    // User expects to submit the answer.
    const isTotallyCorrect = correctCount === (currentQ.options || []).length;
    
    // We'll pass the "result" to submitAnswer but we need to handle points
    // Actually, submitAnswer takes the answer string. For identification, we can pass a special flag or the average.
    submitAnswer(isTotallyCorrect ? currentQ.correctAnswer || 'IDENTIFIED_COMPLETE' : 'IDENTIFIED_INCOMPLETE');
  };
  const [memoramaCards, setMemoramaCards] = useState<any[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [matchedPairs, setMatchedPairs] = useState<string[]>([]);
  const [activeWildcards, setActiveWildcards] = useState<Record<string, boolean>>({});
  const [hiddenOptions, setHiddenOptions] = useState<string[]>([]);

  useEffect(() => {
    if (quiz?.type === 'MEMORAMA' && questions.length > 0) {
      const cards: any[] = [];
      questions.forEach((q) => {
        if (q.itemA && q.itemB) {
          cards.push({ id: `${q.id}-a`, ...q.itemA, pairId: q.id });
          cards.push({ id: `${q.id}-b`, ...q.itemB, pairId: q.id });
        } else {
          // Fallback for old structure
          cards.push({ id: `${q.id}-text`, type: 'TEXT', content: q.text, pairId: q.id });
          cards.push({ id: `${q.id}-img`, type: 'IMAGE', content: q.mediaUrl, pairId: q.id });
        }
      });
      setMemoramaCards(cards.sort(() => Math.random() - 0.5));
    }
  }, [quiz, questions]);

  const useWildcard = async (type: WildcardType) => {
    if (!user || (participant?.wildcards?.[type] || 0) <= 0) return;

    try {
      const { data: uData } = await supabase.from('profiles').select('wildcards').eq('id', user.uid).single();
      const currentWildcards = uData?.wildcards || {};
      
      if (currentWildcards[type] > 0) {
        currentWildcards[type]--;
        await supabase.from('profiles').update({ wildcards: currentWildcards }).eq('id', user.uid);
        
        // Apply logic
        if (type === '50_50' && currentQ?.options) {
           const incorrect = currentQ.options.filter((o: string) => o !== currentQ.correctAnswer);
           const keepIdx = Math.floor(Math.random() * incorrect.length);
           const keepIncorrect = incorrect[keepIdx];
           const toHide = incorrect.filter((o: string) => o !== keepIncorrect);
           setHiddenOptions(toHide);
           setActiveWildcards(prev => ({ ...prev, [type]: true }));
           playSound.powerUp();
        } else if (type === 'EXTRA_POINTS') {
           setActiveWildcards(prev => ({ ...prev, [type]: true }));
           playSound.powerUp();
        } else if (type === 'CHANGE_QUESTION') {
           playSound.powerUp();
           if (!sessionId) {
             if (soloQuestionIndex + 1 < questions.length) {
               setSoloQuestionIndex(prev => prev + 1);
             } else {
               saveAttempt(participant?.score || 0);
               navigate('/student');
             }
           } else {
             if (session?.config?.isClassroom) {
                setActiveWildcards(prev => ({ ...prev, 'REVEAL_ANSWER': true }));
             } else {
                setSoloQuestionIndex(prev => prev + 1);
             }
           }
        } else if (type === 'REVEAL_ANSWER') {
           setActiveWildcards(prev => ({ ...prev, [type]: true }));
           playSound.powerUp();
        }
      }
    } catch (e) {
      console.error(e);
      playSound.error();
    }
  };

  const handleCardClick = async (idx: number) => {
    if (flippedCards.length === 2 || flippedCards.includes(idx) || matchedPairs.includes(memoramaCards[idx].pairId)) return;
    
    playSound.click();
    const newFlipped = [...flippedCards, idx];
    setFlippedCards(newFlipped);

    if (newFlipped.length === 2) {
      const first = memoramaCards[newFlipped[0]];
      const second = memoramaCards[newFlipped[1]];
      
      if (first.pairId === second.pairId) {
        playSound.success();
        setMatchedPairs(prev => [...prev, first.pairId]);
        setFlippedCards([]);
        // Add score for pair
        if (sessionId) {
           const { data: pData } = await supabase.from('session_participants').select('score').eq('session_id', sessionId).eq('student_id', user.uid).single();
           await supabase.from('session_participants').update({ score: (pData?.score || 0) + 10 }).eq('session_id', sessionId).eq('student_id', user.uid);
        }
      } else {
        playSound.error();
        setTimeout(() => setFlippedCards([]), 1000);
      }
    }
  };

  const isMyTurn = () => {
    if (!sessionId || !session) return true;
    
    if (session.config?.isClassroom) {
       // En modo aula, el docente controla quién responde, pero aquí validamos visualmente
       return true; 
    }
    
    if (session.type !== 'POR_EQUIPOS' && session.type !== 'LA_TORRE') return true;
    
    const myTeamIdx = session.teams?.findIndex((t: any) => t.members?.includes(user?.uid));

    // Robo de puntos activo
    if (session.stealingAllowed) {
       // Solo el equipo que NO falló puede robar
       return myTeamIdx !== -1 && myTeamIdx !== session.currentTurnTeam;
    }
    
    // Turno normal
    return session.currentTurnPlayerId === user?.uid;
  };

  const isMyTeam = () => {
    if (!sessionId || !session || !session.teams) return false;
    const myTeam = session.teams.find((t: any) => t.members?.includes(user?.uid));
    const turnTeamIdx = session.currentTurnTeam;
    const turnTeam = session.teams[turnTeamIdx];
    return myTeam && turnTeam && myTeam.name === turnTeam.name;
  };

  const handleSuggestion = async (answer: string) => {
    if (!sessionId || !session || answering) return;
    try {
      const suggestions = session.suggestions || {};
      suggestions[user!.uid] = answer;
      await supabase.from('sessions').update({ suggestions }).eq('id', sessionId);
      notify(`Sugerencia enviada: ${answer}`, 'info');
      playSound.success();
    } catch (e) {
      console.error(e);
    }
  };

  const submitAnswer = async (answer: string) => {
    if (!user || answering) return;
    
    // LA_TORRE Suggestions
    if (sessionId && session?.type === 'LA_TORRE' && !isMyTurn()) {
      if (isMyTeam()) {
        const suggestions = session.suggestions || {};
        suggestions[user!.uid] = answer;
        await supabase.from('sessions').update({ suggestions }).eq('id', sessionId);
        notify(`Sugerencia enviada: ${answer}`, 'info');
        playSound.success();
      }
      return;
    }

    if (sessionId && participant?.answeredThisRound) {
       console.log("Already answered this round");
       return;
    }
    if (!isMyTurn()) {
       console.log("Not your turn");
       return;
    }

    setAnswering(true);
    try {
      const qIndex = sessionId ? (session?.current_question_index || 0) : soloQuestionIndex;
      const currentQ = questions[qIndex];
      if (!currentQ) {
         setAnswering(false);
         return;
      }
      const isCorrect = currentQ.type === 'SHORT_ANSWER' 
        ? answer.trim().toLowerCase() === (currentQ.correctAnswer || currentQ.correct_answer || '').toLowerCase()
        : (currentQ.type === 'IDENTIFIER_IMAGE' || currentQ.type === 'IDENTIFICADOR_IMAGE')
          ? answer === (currentQ.correctAnswer || currentQ.correct_answer || 'IDENTIFIED_COMPLETE')
          : answer === (currentQ.correctAnswer || currentQ.correct_answer);
      
      if (isCorrect) {
        playSound.success();
      } else {
        playSound.error();
      }

      // Store response
      setResponses(prev => [...prev, {
        questionId: currentQ.id,
        questionText: currentQ.text,
        studentAnswer: answer,
        correctAnswer: currentQ.correctAnswer || currentQ.correct_answer,
        isCorrect,
        points: isCorrect ? (currentQ.points || 10) : 0
      }]);

      let points = 0;
      if (isCorrect) {
        points = currentQ.points || 10;
        
        // LA_TORRE check suggestions
        if (session?.type === 'LA_TORRE' && session.suggestions && Object.keys(session.suggestions).length > 0) {
          // Penalize if teammate suggested the correct answer
          const suggestions = Object.values(session.suggestions);
          if (suggestions.includes(currentQ.correct_answer || currentQ.correctAnswer)) {
            points = Math.max(1, Math.floor(points * 0.7)); // 30% penalty
          }
        }

        // Wildcard Bonus: Extra Points (+25%)
        if (activeWildcards['EXTRA_POINTS']) {
           points = Math.floor(points * 1.25);
        }

        if (sessionId && session.type === 'A_LA_CIMA' && session.question_start_time) {
          const timeTaken = (Date.now() - new Date(session.question_start_time).getTime()) / 1000;
          const speedBonus = Math.max(0, Math.floor((30 - timeTaken) * 2));
          points += speedBonus;
        }
      } else {
        if (sessionId && session.type === 'A_LA_CIMA') {
           points = -5; // Penalty for error
        }
      }

      setLastFeedback({ correct: isCorrect, points });
      
      // Request AI Feedback in parallel to move to next Q
      if (!sessionId && currentQ.text && quiz?.ai_feedback_enabled) {
        setLoadingAiFeedback(true);
        generateFeedbackAI(currentQ.text, answer, isCorrect).then(feedback => {
          setAiFeedback(feedback);
          setLoadingAiFeedback(false);
        });
      }

      if (sessionId) {
        const { data: currentP } = await supabase.from('session_participants').select('*').eq('session_id', sessionId).eq('student_id', user.uid).single();

        await supabase.from('session_participants')
          .update({
            score: (currentP?.score || 0) + points,
            answered_this_round: true,
            last_response_time: new Date().toISOString()
          })
          .eq('session_id', sessionId)
          .eq('student_id', user.uid);

        // Team logic updates
        if ((session.type === 'POR_EQUIPOS' || session.type === 'LA_TORRE') && !session.config?.isClassroom) {
          await runTransaction(db, async (transaction) => {
            const sRef = doc(db, 'sessions', sessionId);
            const sSnap = await transaction.get(sRef);
            if (!sSnap.exists()) return;
            const sData = sSnap.data();
            const newTeams = [...sData.teams];
            const myTeamIdx = newTeams.findIndex((t:any) => t.members.includes(user?.uid));
            
            if (myTeamIdx !== -1) {
              let stabilityImpact = 0;
              const updateData: any = { teams: newTeams };

              if (isCorrect) {
                 // Fast response bonus logic
                 const timeTaken = sData.questionStartTime ? (Date.now() - sData.questionStartTime) / 1000 : 10;
                 const speedBonus = session.type === 'A_LA_CIMA' ? Math.max(0, Math.floor((20 - timeTaken) * 2)) : 0;
                 
                 if (sData.stealingAllowed) {
                    // It was a steal!
                    newTeams[myTeamIdx].score += (points + speedBonus);
                    updateData.gameLog = [
                       ...(sData.gameLog || []).slice(-5),
                       `¡EQUIPO ${newTeams[myTeamIdx].name} ROBÓ LOS PUNTOS!`
                    ];
                    updateData.stealingAllowed = false;
                 } else {
                    newTeams[myTeamIdx].score += (points + speedBonus);
                 }

                 if (session.type === 'LA_TORRE') {
                    newTeams[myTeamIdx].towerFloors = (newTeams[myTeamIdx].towerFloors || 0) + 1;
                 }
              } else {
                 // FAILED
                 if (session.type === 'LA_TORRE') {
                    newTeams[myTeamIdx].towerGaps = [...(newTeams[myTeamIdx].towerGaps || []), session.currentQuestionIndex];
                    stabilityImpact = Math.floor(Math.random() * 15) + 10;
                    newTeams[myTeamIdx].towerStability = Math.max(0, (newTeams[myTeamIdx].towerStability || 100) - stabilityImpact);
                 }

                 // Enable stealing if one team fails
                 if (!sData.stealingAllowed) {
                    updateData.stealingAllowed = true;
                    updateData.gameLog = [
                       ...(sData.gameLog || []).slice(-5),
                       `¡${newTeams[myTeamIdx].name} fallo! El otro equipo puede robar.`
                    ];
                 } else {
                    // Second team also failed
                    updateData.stealingAllowed = false;
                 }
              }
              
              if (session.type === 'LA_TORRE') {
                updateData.suggestions = {};
                updateData.lastResponseCorrect = isCorrect;
                
                if (!isCorrect && (newTeams[myTeamIdx].towerStability || 0) < 30) {
                   if (Math.random() * 100 > (newTeams[myTeamIdx].towerStability || 0)) {
                      updateData.gameLog = [
                        ...(sData.gameLog || []).slice(-5),
                        `¡LA TORRE DE ${newTeams[myTeamIdx].name} SE HA COLAPSADO!`
                      ];
                      newTeams[myTeamIdx].towerFloors = 0;
                      newTeams[myTeamIdx].towerStability = 100;
                      newTeams[myTeamIdx].towerGaps = [];
                   }
                }
              }
              transaction.update(sRef, updateData);
            }
          });
        }
      } else {
        // En modo solo, no hacemos nada automático, el usuario pulsa "Siguiente"
      }
    } catch (e) {
      errorService.handle(e, 'Submit Answer');
    } finally {
      if (sessionId) {
        setTimeout(() => {
          setAnswering(false);
          setLastFeedback(null);
          setAiFeedback(null);
        }, 2000);
      } else {
        setAnswering(false);
      }
    }
  };

  const nextQuestion = async () => {
    if (!sessionId) {
      if (soloQuestionIndex + 1 >= questions.length) {
         await saveAttempt(participant?.score || 0);
         setShowSummary(true);
      } else {
         setSoloQuestionIndex(prev => prev + 1);
         setActiveWildcards({});
         setHiddenOptions([]);
      }
      setLastFeedback(null);
      setAiFeedback(null);
    } else {
      // In sessions, the teacher controls transitions usually, or it happens via snapshot
      setLastFeedback(null);
      setAiFeedback(null);
    }
  };

  const attemptSaved = React.useRef(false);

  const saveAttempt = async (finalScore: number) => {
    if (!user || attemptSaved.current) return;
    try {
      const qId = sessionId ? (session?.quiz_id || quizId) : quizId;
      if (!qId) return;

      const { error: attemptError } = await supabase.from('attempts').insert({
        student_id: user.uid,
        student_name: user.displayName || user.generatedId,
        quiz_id: qId,
        quiz_title: quiz?.quiz_title || session?.quiz_title || 'Misión',
        session_id: sessionId || null,
        score: finalScore,
        total_questions: questions.length,
        created_at: new Date().toISOString(),
        type: quiz?.type || session?.type || 'STANDARD',
        subject_id: quiz?.subject_id || null,
        subject_name: quiz?.subject_name || null,
        group_id: quiz?.group_id || null,
        responses: responses // Added detailed responses
      });

      if (attemptError) throw attemptError;

      // Update user average grade
      const { data: pData } = await supabase.from('profiles').select('*').eq('id', user.uid).single();
      if (pData) {
        const prevAttemptsCount = pData.attempts_count || 0;
        const prevAvg = pData.average_grade || 0;
        const totalPossible = questions.length * 10;
        const normalizedScore = totalPossible > 0 ? (finalScore / totalPossible) * 10 : 0;
        const newAvg = ((prevAvg * prevAttemptsCount) + normalizedScore) / (prevAttemptsCount + 1);
        await supabase.from('profiles').update({
          average_grade: Math.min(10, newAvg),
          attempts_count: prevAttemptsCount + 1
        }).eq('id', user.uid);
      }

      attemptSaved.current = true;
    } catch (e) {
      console.error("Save Attempt Error:", e);
    }
  };

  useEffect(() => {
    if (session?.status === 'FINISHED' && user && questions.length > 0) {
      saveAttempt(participant?.score || 0);
    }
  }, [session?.status, questions.length]);

  if (sessionId && session?.status === 'LOBBY') {
    return (
      <div className="min-h-screen cosmic-grid bg-background flex flex-col items-center justify-center p-8">
        <Card className="max-w-md w-full border-neon-blue/30 bg-card/60 backdrop-blur-xl p-8 text-center space-y-6">
           <Users className="w-16 h-16 text-neon-blue mx-auto animate-pulse" />
           <h2 className="text-3xl font-black italic">LOBBY DE ESPERA</h2>
           <p className="text-muted-foreground">Prepárate, el docente iniciará la misión pronto.</p>
           <div className="bg-secondary/40 p-6 rounded-2xl border border-border">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Materia</p>
              <p className="text-xl font-bold">{session.quizTitle}</p>
           </div>
           <div className="flex items-center justify-between px-4">
              <span className="text-sm font-medium">Jugadores en espera:</span>
              <span className="text-2xl font-black text-neon-blue">{participants.length}</span>
           </div>
        </Card>
      </div>
    );
  }

  const handleSurveySubmit = async () => {
    if (!survey || !user) return;
    
    // Validate all questions answered
    const unanswered = survey.questions.some((q: any) => !surveyResponses[q.id]);
    if (unanswered) {
      alert('Por favor responde todas las preguntas de feedback.');
      return;
    }

    setIsSubmittingSurvey(true);
    try {
      await addDoc(collection(db, 'surveyResponses'), {
        surveyId: survey.id,
        studentId: user.uid,
        quizId: quizId || session?.quizId,
        responses: surveyResponses,
        timestamp: Date.now()
      });
      setSurveyCompleted(true);
    } catch (error) {
      errorService.handle(error, 'Submit Survey');
    } finally {
      setIsSubmittingSurvey(false);
    }
  };

  useEffect(() => {
    if (showSummary && quiz?.enableAiFeedback && responses.length > 0 && !summaryAiFeedback) {
      setLoadingSummaryAi(true);
      import('../services/aiService').then(({ generateMissionSummaryAI }) => {
        generateMissionSummaryAI(responses).then(feedback => {
          setSummaryAiFeedback(feedback);
          setLoadingSummaryAi(false);
        });
      });
    }
  }, [showSummary, quiz?.enableAiFeedback, responses.length]);

  if (isNotAvailable) {
    return (
      <div className="min-h-screen cosmic-grid bg-background flex flex-col items-center justify-center p-8">
        <Card className="max-w-md w-full border-red-500/50 bg-card/60 backdrop-blur-xl p-10 text-center space-y-6">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-red-500">
             <ShieldAlert className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black italic text-red-500 uppercase tracking-tighter">Acceso Restringido</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
             {availabilityError || 'Esta misión no está disponible en este momento.'}
          </p>
          <Button onClick={() => navigate('/student')} className="w-full bg-secondary hover:bg-secondary/80 text-foreground font-bold">
             REGRESAR AL DASHBOARD
          </Button>
        </Card>
      </div>
    );
  }

  if ((sessionId && session?.status === 'FINISHED') || showSummary) {
     const ranked = participants.sort((a,b) => b.score - a.score);
     const myRank = sessionId ? (ranked.findIndex(p => p.id === user?.uid) + 1) : 1;

     if (survey && !surveyCompleted) {
        return (
          <div className="min-h-screen cosmic-grid bg-background flex flex-col items-center justify-center p-8">
            <Card className="max-w-xl w-full border-neon-purple shadow-[0_0_30px_rgba(168,85,247,0.2)] bg-card/60 backdrop-blur-xl p-8 space-y-8 animate-in fade-in zoom-in duration-500">
               <div className="text-center space-y-2">
                  <div className="w-16 h-16 rounded-2xl bg-neon-purple/10 flex items-center justify-center mx-auto text-neon-purple mb-4">
                     <BrainCircuit className="w-8 h-8" />
                  </div>
                  <h2 className="text-2xl font-black italic">FEEDBACK DE LA MISIÓN</h2>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">Para ver tu resultado final, por favor completa este breve reactivo.</p>
               </div>

               <div className="space-y-6">
                  {survey.questions.map((q: any, idx: number) => (
                    <div key={q.id} className="space-y-3 p-4 bg-black/20 rounded-xl border border-white/5">
                       <p className="text-sm font-bold">{idx + 1}. {q.text}</p>
                       
                       {q.type === 'LIKERT' && (
                          <div className="flex justify-between gap-2">
                             {[1, 2, 3, 4, 5].map(val => (
                                <button 
                                  key={val}
                                  onClick={() => setSurveyResponses(prev => ({ ...prev, [q.id]: val }))}
                                  className={`flex-1 h-10 rounded-lg font-black transition-all ${surveyResponses[q.id] === val ? 'bg-neon-purple text-white shadow-[0_0_10px_rgba(168,85,247,0.4)]' : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'}`}
                                >
                                   {val}
                                </button>
                             ))}
                          </div>
                       )}

                       {q.type === 'YES_NO' && (
                          <div className="flex gap-4">
                             {['SÍ', 'NO'].map(val => (
                                <Button 
                                  key={val}
                                  variant={surveyResponses[q.id] === val ? 'default' : 'outline'}
                                  onClick={() => setSurveyResponses(prev => ({ ...prev, [q.id]: val }))}
                                  className={`flex-1 font-bold ${surveyResponses[q.id] === val ? 'bg-neon-purple' : ''}`}
                                >
                                   {val}
                                </Button>
                             ))}
                          </div>
                       )}

                       {q.type === 'TEXT' && (
                          <Input 
                             placeholder="Escribe tu opinión..." 
                             className="bg-background/50"
                             value={surveyResponses[q.id] || ''}
                             onChange={e => setSurveyResponses(prev => ({ ...prev, [q.id]: e.target.value }))}
                          />
                       )}
                    </div>
                  ))}
               </div>

               <Button 
                onClick={handleSurveySubmit} 
                disabled={isSubmittingSurvey}
                className="w-full bg-neon-purple hover:bg-neon-purple/80 text-white font-black italic h-12"
               >
                  {isSubmittingSurvey ? 'ENVIANDO...' : 'ENVIAR FEEDBACK Y VER RESULTADOS'}
               </Button>
            </Card>
          </div>
        );
     }
     return (
        <div className="min-h-screen cosmic-grid bg-background flex flex-col items-center justify-center p-8">
          <Card className="max-w-2xl w-full border-neon-purple/40 bg-card/60 backdrop-blur-xl p-10 text-center space-y-8">
            <Trophy className="w-20 h-20 text-yellow-500 mx-auto drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]" />
            <h2 className="text-4xl font-black italic tracking-tighter">¡MISIÓN FINALIZADA!</h2>
            
            <div className="flex justify-center gap-8 py-6">
               <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase">Tu Puntaje</p>
                  <p className="text-5xl font-black text-neon-blue">{participant?.score || 0}</p>
               </div>
               <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase">Posición</p>
                  <p className="text-5xl font-black text-neon-purple">{myRank}º</p>
               </div>
            </div>

            {/* Response Validation Section */}
            {(quiz?.showFeedback || quiz?.enableAiFeedback) && (
              <div className="space-y-6 text-left border-t border-white/5 pt-8">
                 <h3 className="text-lg font-black italic text-neon-blue uppercase tracking-widest flex items-center gap-2">
                    <Check className="w-5 h-5" /> VALIDACIÓN PEDAGÓGICA FINAL
                 </h3>
                 
                 {quiz?.enableAiFeedback && (
                   <div className="p-6 bg-neon-purple/10 border border-neon-purple/30 rounded-2xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-100 transition-opacity">
                         <BrainCircuit className="w-8 h-8 text-neon-purple" />
                      </div>
                      <p className="text-[10px] font-black uppercase text-neon-purple mb-3 tracking-[0.2em] flex items-center gap-2">
                         <Star className="w-3 h-3 animate-pulse" /> Análisis de Inteligencia Artificial
                      </p>
                      {loadingSummaryAi ? (
                        <div className="flex items-center gap-3">
                           <RefreshCw className="w-4 h-4 animate-spin text-neon-purple" />
                           <p className="text-sm italic text-muted-foreground">Sintetizando conclusiones pedagógicas...</p>
                        </div>
                      ) : (
                        <p className="text-base leading-relaxed italic text-foreground/90 font-medium">
                           "{summaryAiFeedback || 'Analizando tus respuestas para generar un diagnóstico personalizado...'}"
                        </p>
                      )}
                   </div>
                 )}

                 <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {responses.map((resp, i) => (
                      <div key={i} className={`p-4 rounded-xl border ${resp.isCorrect ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                         <div className="flex justify-between items-start gap-4 mb-2">
                            <p className="text-sm font-bold leading-tight flex-1">{resp.questionText}</p>
                            <Badge className={resp.isCorrect ? 'bg-emerald-500' : 'bg-red-500'}>
                               {resp.isCorrect ? 'CORRECTO' : 'INCORRECTO'}
                            </Badge>
                         </div>
                         <div className="grid grid-cols-2 gap-4 text-[10px] uppercase font-mono mt-2 pt-2 border-t border-white/5">
                            <div>
                               <p className="opacity-40">Tu Respuesta</p>
                               <p className={resp.isCorrect ? 'text-emerald-400' : 'text-red-400'}>{resp.studentAnswer || '-'}</p>
                            </div>
                            {!resp.isCorrect && (
                              <div>
                                <p className="opacity-40">Respuesta Correcta</p>
                                <p className="text-emerald-400">{resp.correctAnswer}</p>
                              </div>
                            )}
                         </div>
                      </div>
                    ))}
                 </div>
              </div>
            )}

            <Button onClick={() => navigate('/student')} className="w-full bg-gradient-to-r from-neon-blue to-neon-purple font-bold h-12">
               REGRESAR AL PANEL
            </Button>
          </Card>
        </div>
     );
  }

  const currentQ = questions[sessionId ? (session?.currentQuestionIndex || 0) : soloQuestionIndex];

  if (participant?.isExempt) {
    return (
      <div className="min-h-screen cosmic-grid bg-background flex items-center justify-center p-6">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-xl w-full p-8 bg-black/60 backdrop-blur-2xl border-2 border-amber-500 rounded-3xl text-center space-y-6 shadow-[0_0_50px_rgba(245,158,11,0.2)]"
        >
          <ShieldAlert className="w-20 h-20 text-amber-500 mx-auto animate-pulse" />
          <h2 className="text-3xl font-black italic tracking-tighter text-amber-500 uppercase">ACCIÓN DEL DOCENTE: EXENCIÓN</h2>
          <div className="p-6 bg-amber-500/10 rounded-2xl border border-amber-500/20 italic text-lg leading-relaxed">
            "{participant.exemptionMessage || 'Has sido eximido de esta prueba.'}"
          </div>
          <p className="text-muted-foreground text-sm uppercase font-mono tracking-widest">
            Tu participación en esta sesión ha sido congelada por protocolos administrativos.
          </p>
          <Button onClick={() => navigate('/student')} className="w-full bg-amber-500 hover:bg-amber-600 text-black font-black italic h-12">
            REGRESAR AL CENTRO DE ESTUDIANTE
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen cosmic-grid bg-background select-none flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-card/80 backdrop-blur-md flex justify-between items-center sticky top-0 z-10">
        <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-neon-blue to-neon-purple">
          {session?.quizTitle || quiz?.title || 'Misión'}
        </h2>

        {globalTimeRemaining !== null && (
           <div className={`px-4 py-1.5 rounded-full border-2 font-mono font-bold flex items-center gap-2 transition-all ${globalTimeRemaining < 60 ? 'bg-red-500/20 border-red-500 text-red-500 animate-pulse' : 'bg-secondary border-border text-foreground'}`}>
              <RefreshCw className={`w-3.5 h-3.5 ${globalTimeRemaining < 60 ? 'animate-spin' : ''}`} />
              {Math.floor(globalTimeRemaining / 60)}:{(globalTimeRemaining % 60).toString().padStart(2, '0')}
           </div>
        )}

        {sessionId && session?.type === 'POR_EQUIPOS' && !session.config?.isClassroom && (
           <div className="flex gap-4">
             {session.teams?.map((t: any, i: number) => (
                <div key={i} className={`px-4 py-1 rounded-full border text-xs font-bold transition-all ${session.currentTurnTeam === i ? 'bg-neon-blue text-black border-neon-blue shadow-[0_0_10px_rgba(0,243,255,0.4)]' : 'bg-secondary text-muted-foreground border-border'}`}>
                   {t.name}: {t.score}
                </div>
             ))}
           </div>
        )}
        {sessionId && (
           <div className="flex gap-4 items-center">
              {session?.type === 'A_LA_CIMA' && !session?.rankingsSuspended && (
                 <div className="px-3 py-1 bg-neon-blue/20 text-neon-blue border border-neon-blue/50 rounded-full text-[10px] font-black italic tracking-tighter">
                   POSICIÓN: {participants.sort((a,b) => b.score - a.score).findIndex(p => p.id === user?.uid) + 1}º
                 </div>
              )}
              <span className="text-foreground/60 text-sm font-mono flex items-center gap-2">
                 <Trophy className="w-4 h-4 text-yellow-500" /> {participant?.score || 0}
              </span>
              {!session?.rankingsSuspended && (
                <div className="flex -space-x-2">
                   {participants.sort((a,b) => b.score - a.score).slice(0, 5).map((p, idx) => (
                      <div key={p.id} className={`w-6 h-6 rounded-full border border-background flex items-center justify-center text-[8px] font-bold ${idx === 0 ? 'bg-yellow-500 text-black' : 'bg-secondary text-muted-foreground'}`} title={p.displayName}>
                         {p.displayName?.slice(0,1).toUpperCase()}
                      </div>
                   ))}
                </div>
              )}
           </div>
        )}
      </header>

      <main className="flex-1 p-4 md:p-8 max-w-4xl mx-auto w-full flex flex-col gap-6 relative">
        {/* Mission Brand Header */}
        {(quiz?.customLogoUrl || quiz?.customPhrase) && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 mb-2 p-6 bg-card/30 border border-white/5 rounded-3xl backdrop-blur-sm"
          >
             {quiz.customLogoUrl && (
               <div className="w-24 h-24 p-2 bg-white rounded-2xl shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                 <img src={quiz.customLogoUrl} alt="Logo de Prueba" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
               </div>
             )}
             {quiz.customPhrase && (
               <div className="text-center">
                 <p className="text-xl font-black italic uppercase tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-neon-blue to-neon-purple shadow-sm">
                   {quiz.customPhrase}
                 </p>
                 <div className="w-12 h-1 bg-neon-blue/30 mx-auto mt-2 rounded-full" />
               </div>
             )}
          </motion.div>
        )}

        {/* Wildcards Section (Mission Inventory) */}
        {participant?.wildcards && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 p-4 bg-card/40 border border-white/5 rounded-3xl backdrop-blur-xl shadow-2xl"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-3 h-3 text-neon-blue animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-neon-blue">Arsenales de Misión</span>
              <Zap className="w-3 h-3 text-neon-blue animate-pulse" />
            </div>
            
            <div className="flex justify-center gap-4">
              {Object.entries(participant.wildcards).map(([type, count]: any) => {
                const config = WILDCARDS[type as WildcardType];
                const isActive = activeWildcards[type];
                const hasZero = count <= 0;
                
                return (
                  <div key={type} className="relative group perspective">
                    <TooltipProvider delay={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="lg" 
                            disabled={isActive || hasZero || answering}
                            className={`flex flex-col h-20 w-16 p-0 border-2 transition-all relative overflow-hidden group-hover:rotate-y-12 ${
                              isActive 
                                ? 'border-neon-blue bg-neon-blue/20 ring-4 ring-neon-blue/20 shadow-[0_0_20px_rgba(0,243,255,0.4)]' 
                                : hasZero 
                                  ? 'opacity-20 grayscale border-border' 
                                  : 'border-neon-purple/40 bg-black/40 hover:border-neon-purple hover:scale-110 hover:shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                            }`}
                            onClick={() => useWildcard(type as WildcardType)}
                          >
                            <div className="flex-1 flex items-center justify-center relative z-10">
                              {React.createElement(config.icon, { 
                                className: `w-8 h-8 ${isActive ? 'text-neon-blue animate-bounce' : config.color}` 
                              })}
                            </div>
                            
                            {/* Inventory Count Indicator */}
                            {!hasZero && (
                              <div className="absolute top-1 right-1 bg-neon-blue text-black text-[10px] font-black px-1.5 py-0.5 rounded-md shadow-lg z-20">
                                {count}
                              </div>
                            )}

                            {/* Hover info overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-2">
                               <span className="text-[7px] font-black tracking-widest text-white">USAR</span>
                            </div>

                            {/* Animated Background */}
                            {isActive && (
                              <div className="absolute inset-0 bg-neon-blue/5 animate-pulse overflow-hidden">
                                 <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--neon-blue)_0%,_transparent_70%)]" />
                              </div>
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="bg-black/95 border-neon-blue text-white p-4 max-w-xs shadow-2xl rounded-xl">
                           <div className="flex items-center gap-2 mb-2">
                              <div className={`p-1.5 rounded-lg bg-white/5 ${config.color}`}>
                                {React.createElement(config.icon, { className: "w-4 h-4" })}
                              </div>
                              <p className="font-black italic text-sm tracking-tight text-neon-blue uppercase">{config.name}</p>
                           </div>
                           <p className="text-[11px] leading-relaxed opacity-70 font-medium">{config.description}</p>
                           <div className="mt-3 pt-3 border-t border-white/10 flex justify-between items-center text-[9px] font-bold">
                              <span className="text-muted-foreground uppercase tracking-widest">Disponibles</span>
                              <span className={`px-2 py-0.5 rounded-full ${hasZero ? 'bg-red-500/20 text-red-400' : 'bg-neon-blue/20 text-neon-blue'}`}>{count} CARGAS</span>
                           </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {sessionId && session?.type === 'POR_EQUIPOS' && session.config?.isClassroom && (
           <div className="text-center animate-in fade-in zoom-in duration-500">
              <div className="p-8 bg-card/60 backdrop-blur-xl border-2 border-neon-blue rounded-3xl space-y-4">
                 <h2 className="text-2xl font-black italic text-neon-blue tracking-tighter">MODO PRESENCIAL</h2>
                 <p className="text-muted-foreground">Mira la pantalla del docente para ver la pregunta y participar.</p>
                 
                 <div className="grid grid-cols-2 gap-4">
                    {session.teams?.map((t: any, i: number) => (
                       <div key={i} className={`p-4 rounded-xl border-2 ${session.currentTurnTeam === i ? 'border-neon-blue bg-neon-blue/10' : 'border-border grayscale'}`}>
                          <p className="font-bold">{t.name}</p>
                          <p className="text-2xl font-black">{t.score} PTS</p>
                          {session.currentTurnTeam === i && (
                             <div className="mt-2 p-2 bg-neon-blue/20 rounded border border-neon-blue/30">
                                <p className="text-[8px] font-black uppercase text-neon-blue">TURNO DE:</p>
                                <p className="text-sm font-bold truncate">{session.currentTurnPlayerName}</p>
                             </div>
                          )}
                       </div>
                    ))}
                 </div>

                 {session.stealingAllowed && (
                    <div className="bg-neon-pink/20 p-4 rounded-xl border border-neon-pink/30 animate-pulse">
                       <p className="text-neon-pink font-black italic">¡EL OTRO EQUIPO PUEDE ROBAR!</p>
                    </div>
                 )}
              </div>
           </div>
        )}

        {sessionId && session?.type === 'LA_TORRE' && (
           <div className="text-center animate-in fade-in zoom-in duration-500 mb-4">
              {isMyTurn() ? (
                 <div className="inline-flex flex-col items-center gap-2 px-6 py-3 bg-neon-blue/20 text-neon-blue rounded-3xl border-2 border-neon-blue shadow-[0_0_20px_rgba(0,243,255,0.3)]">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">¡TU TURNO!</span>
                    <p className="text-sm font-bold italic">Concentración Máxima, {user?.displayName}</p>
                    {session.suggestions && Object.keys(session.suggestions).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-neon-blue/30 w-full">
                         <p className="text-[8px] font-black uppercase mb-1">Sugerencias de tu equipo:</p>
                         <div className="flex flex-wrap justify-center gap-1">
                            {Object.entries(session.suggestions).map(([uid, sug]: any) => (
                               <Badge key={uid} variant="outline" className="bg-neon-blue/10 border-neon-blue/30 text-[9px] lowercase italic">"{sug}"</Badge>
                            ))}
                         </div>
                      </div>
                    )}
                 </div>
              ) : isMyTeam() ? (
                 <div className="inline-flex flex-col items-center gap-2 px-6 py-3 bg-neon-purple/20 text-neon-purple rounded-3xl border-2 border-neon-purple/30">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">TURNO DE EQUIPO</span>
                    <p className="text-sm font-bold italic">{session.currentTurnPlayerName} está al mando</p>
                    <p className="text-[8px] uppercase font-mono opacity-60">Selecciona una opción para sugerirle la respuesta</p>
                 </div>
              ) : (
                <div className="inline-flex flex-col items-center gap-2 px-6 py-3 bg-secondary/50 text-muted-foreground rounded-3xl border border-border">
                   <span className="text-[10px] font-black uppercase tracking-[0.2em]">TURNO ENEMIGO</span>
                   <p className="text-sm font-bold italic">Equipo rival en acción...</p>
                </div>
              )}
           </div>
        )}
        {sessionId && session?.type === 'LA_TORRE' && session.teams && (
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4 items-end min-h-[160px] p-4 bg-black/40 rounded-xl border border-white/5 overflow-hidden relative">
            <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-black italic text-neon-blue uppercase tracking-widest z-10">Vista de Construcción Real</div>
            {session.teams.map((t: any, idx: number) => {
              const floors = t.towerFloors || 0;
              const isMyTeam = t.members.includes(user?.uid);
              return (
                <div key={idx} className="flex flex-col items-center gap-2 group">
                  <div className="relative flex flex-col-reverse items-center w-full">
                    {[...Array(Math.min(floors, 10))].map((_, i) => (
                      <motion.div 
                        key={i}
                        initial={{ scale: 0, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        className={`w-12 h-4 sm:w-16 sm:h-6 mb-1 rounded-sm border-x-2 border-t-2 relative ${isMyTeam ? 'bg-neon-blue/40 border-neon-blue flex items-center justify-center' : 'bg-primary/20 border-primary/50'}`}
                      >
                         {isMyTeam && i === floors - 1 && <div className="absolute -top-1 w-full h-0.5 bg-neon-blue shadow-[0_0_10px_rgba(0,243,255,1)]"></div>}
                      </motion.div>
                    ))}
                    {floors > 10 && (
                      <div className="text-[10px] font-black text-neon-blue mt-1">+{floors - 10} PISOS</div>
                    )}
                    {floors === 0 && <div className="w-16 h-1 bg-white/20 rounded-full mb-1"></div>}
                  </div>
                  <div className="text-center">
                    <p className={`text-[9px] font-black uppercase truncate max-w-[60px] ${isMyTeam ? 'text-neon-blue' : 'text-muted-foreground'}`}>{t.name}</p>
                    <p className="text-[14px] font-mono leading-none">{floors}f</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <AnimatePresence mode="wait">
          {session?.gameLog && session.gameLog.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="mb-4 overflow-hidden"
            >
               <div className="bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col gap-1">
                  <p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest mb-1">Bitácora de Batalla</p>
                  {(session.gameLog as string[]).map((log, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px] animate-in slide-in-from-left-2 fade-in">
                       <span className="w-1 h-1 rounded-full bg-neon-blue"></span>
                       <span className={i === session.gameLog.length - 1 ? "text-neon-blue font-bold" : "text-muted-foreground italic"}>{log}</span>
                    </div>
                  ))}
               </div>
            </motion.div>
          )}

          {currentQ ? (
            <motion.div
              key={`q-${sessionId ? (session?.currentQuestionIndex ?? 0) : soloQuestionIndex}-${currentQ.id}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              <Card className={`border-border/30 bg-card/50 backdrop-blur-xl transition-all duration-500 ${lastFeedback?.correct ? 'border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.2)]' : lastFeedback?.correct === false ? 'border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]' : ''}`}>
                <CardHeader className="flex flex-row justify-between items-start">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2 font-mono">Pregunta { (sessionId ? (session?.currentQuestionIndex ?? 0) : soloQuestionIndex) + 1 } de {questions.length}</p>
                    <CardTitle className="text-2xl leading-tight">{currentQ.text}</CardTitle>
                  </div>
                  {currentQ.points && <div className="bg-secondary px-3 py-1 rounded-full text-xs font-bold text-primary">{currentQ.points} PTS</div>}
                </CardHeader>
                <CardContent className="space-y-6">
                  {sessionId && !isMyTurn() && (
                    <div className="bg-neon-purple/10 border border-neon-purple/30 rounded-xl p-6 text-center animate-pulse">
                       <Users className="w-12 h-12 text-neon-purple mx-auto mb-4 opacity-50" />
                       <h3 className="text-xl font-bold text-neon-purple">Turno del Oponente</h3>
                       <p className="text-sm text-muted-foreground mt-2">
                          {session?.stealingAllowed 
                           ? "¡Tu equipo puede robar! Prepárate para responder."
                           : `Esperando a ${session?.currentTurnPlayerName || 'un jugador de ' + (session?.teams?.[session?.currentTurnTeam]?.name || 'equipo')}.`}
                       </p>
                       {session?.type === 'LA_TORRE' && isMyTeam() && (
                          <div className="mt-4 pt-4 border-t border-white/5">
                             <p className="text-[10px] font-black uppercase mb-2">Ayuda a tu compañero (Sugerencias):</p>
                             <div className="flex flex-wrap justify-center gap-2">
                                {(currentQ.options || []).slice(0,4).map((opt: string, i: number) => (
                                  <Button 
                                    key={i} 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-8 text-[10px] border-neon-purple/20 hover:bg-neon-purple/10"
                                    onClick={() => handleSuggestion(opt)}
                                  >
                                    {opt}
                                  </Button>
                                ))}
                             </div>
                          </div>
                       )}
                    </div>
                  )}

                  {(quiz?.type === 'IDENTIFICADOR' || quiz?.type === 'IDENTIFICACION' || quiz?.type === 'IDENTIFIER_IMAGE' || quiz?.type === 'IDENTIFICADOR_IMAGE') ? (
                    <div className="space-y-6">
                      {currentQ.mediaType === 'IMAGE' || !currentQ.mediaType ? (
                        <div className="relative border border-border rounded-xl overflow-hidden shadow-xl bg-black/40 group">
                          <img 
                            src={currentQ.mediaUrl} 
                            className="w-full h-auto min-h-[200px] object-contain" 
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://i.imgur.com/vHqY7pX.png'; // Fallback to safe logo if broken
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 pointer-events-none"></div>
                          {(currentQ.options || []).map((opt: string, i: number) => {
                            let data: any = {};
                            try { data = JSON.parse(opt); } catch(e) { return null; }
                            if (!data.x || !data.y) return null;
                            
                            const droppedValue = droppedMapping[i];
                            const hasDropped = !!droppedValue;
                            const isCorrect = hasDropped && droppedValue.trim().toLowerCase() === (data.answer || '').toLowerCase();
                            
                            return (
                              <motion.div 
                                key={i} 
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(i); }}
                                className={`absolute min-w-8 min-h-8 px-2 -translate-x-1/2 -translate-y-1/2 border-2 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-[0_0_20px_rgba(0,0,0,0.8)] transition-all cursor-pointer z-20 ${isCorrect ? 'bg-emerald-500 border-white scale-125 shadow-[0_0_30px_rgba(16,185,129,0.6)]' : (hasDropped ? 'bg-red-500 border-white scale-110' : 'bg-neon-blue/80 border-white animate-pulse hover:scale-125 hover:bg-neon-blue')}`} 
                                style={{ top: `${data.y}%`, left: `${data.x}%` }}
                                onClick={() => {
                                   if (hasDropped) {
                                      setDroppedMapping(prev => { const n = {...prev}; delete n[i]; return n; });
                                      setIdentificationAnswers(prev => { const n = {...prev}; delete n[i]; return n; });
                                      playSound.click();
                                   }
                                }}
                              >
                                {isCorrect ? '✓' : (hasDropped ? '✘' : (i + 1))}
                                {isCorrect && (
                                   <div className="absolute top-10 bg-black/80 backdrop-blur-md text-emerald-400 border border-emerald-500/50 px-2 py-1 rounded-lg text-[9px] whitespace-nowrap shadow-2xl animate-in fade-in slide-in-from-top-2">
                                      {data.answer.toUpperCase()}
                                   </div>
                                )}
                              </motion.div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-8 bg-black/40 rounded-xl border border-border flex flex-col items-center justify-center min-h-[200px]">
                           <div className="prose prose-invert max-w-none text-center transform mb-8">
                              <InlineMath math={currentQ.mediaUrl} />
                           </div>
                           <div className="flex flex-wrap gap-4 justify-center">
                              {(currentQ.options || []).map((opt: string, i: number) => {
                                const data = JSON.parse(opt);
                                const isCorrect = (identificationAnswers[i] || '').trim().toLowerCase() === data.answer?.toLowerCase();
                                return (
                                  <div 
                                    key={i}
                                    onDragOver={(e) => { e.preventDefault(); }}
                                    onDrop={() => handleDrop(i)}
                                    className={`px-4 py-2 border rounded-full text-xs font-bold transition-all ${isCorrect ? 'bg-emerald-500/20 border-emerald-500' : 'bg-secondary/40 border-dashed border-white/20'}`}
                                  >
                                    {isCorrect ? data.answer : `Componente ${i+1}`}
                                  </div>
                                );
                              })}
                           </div>
                        </div>
                      )}

                      {/* Drag Options Pool */}
                      <div className="p-4 bg-black/30 border border-white/5 rounded-2xl">
                         <p className="text-[10px] font-black uppercase text-center text-muted-foreground mb-4 tracking-[0.2em]">Opciones Disponibles (Arrastra o selecciona)</p>
                         <div className="flex flex-wrap justify-center gap-3">
                            {(currentQ.options || []).map((opt: string, i: number) => {
                               const data = JSON.parse(opt);
                               if (!data.answer) return null;
                               const isUsed = Object.values(droppedMapping).includes(data.answer);
                               return (
                                 <motion.div
                                   key={i}
                                   draggable={!isUsed}
                                   onDragStart={() => setDraggedOption(data.answer)}
                                   onClick={() => {
                                      if (!isUsed) setDraggedOption(data.answer);
                                   }}
                                   whileHover={{ scale: isUsed ? 1 : 1.05 }}
                                   whileTap={{ scale: isUsed ? 1 : 0.95 }}
                                   className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border transition-all ${isUsed ? 'opacity-30 grayscale cursor-not-allowed border-white/10' : 'bg-neon-purple/20 border-neon-purple/50 text-white hover:bg-neon-purple/40 hover:shadow-[0_0_15px_rgba(168,85,247,0.3)]'}`}
                                 >
                                    {data.type === 'IMAGE' ? (
                                      <img src={data.answer} className="h-6 w-auto object-contain" />
                                    ) : data.type === 'MATH' ? (
                                      <InlineMath math={data.answer} />
                                    ) : (
                                      data.answer
                                    )}
                                 </motion.div>
                               );
                            })}
                         </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         {(currentQ.options || []).map((opt: string, i: number) => {
                           let data: any = {};
                           try { data = JSON.parse(opt); } catch(e) { return null; }
                           
                           const isCorrect = (identificationAnswers[i] || '').trim().toLowerCase() === (data.answer || '').toLowerCase();
                           
                           return (
                            <div 
                              key={i} 
                              onDragOver={(e) => { e.preventDefault(); }}
                              onDrop={() => handleDrop(i)}
                              className={`flex flex-col gap-3 p-4 rounded-xl border transition-all ${isCorrect ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[inset_0_0_10px_rgba(16,185,129,0.1)]' : (draggedOption && !droppedMapping[i] ? 'border-neon-blue bg-neon-blue/5 animate-pulse shadow-[0_0_15px_rgba(0,243,255,0.2)]' : 'bg-secondary/30 border-border')}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 flex-shrink-0 bg-neon-blue rounded-full flex items-center justify-center text-[10px] font-black text-white">{i + 1}</span>
                                <div className="flex-1">
                                   {data.type === 'IMAGE' ? (
                                      <div className="h-16 w-full rounded border border-white/10 overflow-hidden bg-black/20 flex items-center justify-center">
                                         {data.answer && <img src={data.answer} className="w-full h-full object-contain" />}
                                      </div>
                                   ) : data.type === 'MATH' ? (
                                      <div className="p-2 bg-black/20 rounded border border-white/5 flex justify-center overflow-x-auto">
                                         <InlineMath math={data.answer} />
                                      </div>
                                   ) : data.type === 'AUDIO' ? (
                                      <Button variant="ghost" size="sm" className="w-full h-10 gap-2 border border-white/10" onClick={() => {
                                         const audio = new Audio(data.answer);
                                         audio.play();
                                      }}>
                                         <Volume2 className="w-4 h-4 text-neon-pink" /> ESCUCHAR PISTA
                                      </Button>
                                   ) : (
                                      <p className="text-[10px] font-black uppercase opacity-50 tracking-widest">Identificar Elemento</p>
                                   )}
                                </div>
                              </div>
                              
                              <div className="flex gap-2">
                                <Input 
                                    placeholder={draggedOption ? "Suelta aquí..." : "Escribe tu hallazgo..."} 
                                    value={identificationAnswers[i] || ''} 
                                    onChange={e => setIdentificationAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                                    className="h-9 text-xs flex-1 bg-background/50 uppercase font-black tracking-tighter"
                                    disabled={isCorrect}
                                />
                                {!isCorrect && (
                                  <Button size="sm" className="h-9 font-bold bg-neon-blue" onClick={() => {
                                     if (identificationAnswers[i]?.trim().toLowerCase() === (data.answer || '').toLowerCase()) {
                                        submitAnswer(data.answer);
                                     } else {
                                        notify('El nodo de datos no coincide. ¡Sigue intentando!', 'error');
                                        playSound.error();
                                     }
                                  }}>OK</Button>
                                )}
                              </div>
                            </div>
                           );
                         })}
                      </div>
                      <div className="flex justify-center mt-6">
                        <Button 
                          onClick={submitIdentification}
                          disabled={answering || Object.keys(identificationAnswers).length < (currentQ.options || []).length}
                          className="bg-emerald-500 hover:bg-emerald-600 text-white font-black italic h-12 px-10 shadow-[0_0_20px_rgba(16,185,129,0.3)] animate-pulse"
                        >
                          FINALIZAR IDENTIFICACIÓN <Check className="w-5 h-5 ml-2" />
                        </Button>
                      </div>
                    </div>
                  ) : quiz?.type === 'MEMORAMA' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 py-4">
                       {memoramaCards.map((card, idx) => {
                          const isFlipped = flippedCards.includes(idx) || matchedPairs.includes(card.pairId);
                          return (
                            <div key={card.id} onClick={() => handleCardClick(idx)} className="aspect-square cursor-pointer relative group">
                               <motion.div 
                                 className="w-full h-full relative"
                                 initial={false}
                                 animate={{ rotateY: isFlipped ? 180 : 0 }}
                                 transition={{ duration: 0.6, type: 'spring', stiffness: 260, damping: 20 }}
                                 style={{ transformStyle: 'preserve-3d' }}
                               >
                                  {/* Front */}
                                  <Card className={`absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-secondary/80 to-secondary border-2 border-neon-blue/20 shadow-lg backface-hidden z-10`}>
                                     <div className="w-10 h-10 rounded-full border border-neon-blue/30 flex items-center justify-center mb-2">
                                        <BrainCircuit className="w-5 h-5 text-neon-blue/50" />
                                     </div>
                                     <div className="text-[8px] font-black uppercase tracking-[0.3em] text-neon-blue/40">CBTA 147</div>
                                  </Card>

                                  {/* Back */}
                                  <Card className={`absolute inset-0 w-full h-full flex items-center justify-center border-2 rotate-y-180 backface-hidden transition-colors ${matchedPairs.includes(card.pairId) ? 'border-emerald-500 bg-emerald-500/10' : 'border-neon-purple bg-neon-purple/5'}`}>
                                     {card.type === 'IMAGE' || card.type === 'img' ? (
                                       <img src={card.content} className="w-full h-full object-cover rounded-sm" />
                                     ) : card.type === 'MATH' ? (
                                       <div className="scale-75 origin-center overflow-x-auto w-full px-1 text-center">
                                          <InlineMath math={card.content} />
                                       </div>
                                     ) : card.type === 'AUDIO' ? (
                                       <div className="flex flex-col items-center gap-1">
                                          <div className="w-8 h-8 rounded-full bg-neon-pink/20 flex items-center justify-center">
                                             <Volume2 className="w-4 h-4 text-neon-pink" />
                                          </div>
                                          <span className="text-[8px] font-black opacity-50">AUDIO</span>
                                       </div>
                                     ) : (
                                       <span className="text-[10px] font-bold text-center px-2 leading-tight uppercase">{card.content}</span>
                                     )}

                                     {card.type === 'AUDIO' && isFlipped && (
                                       <audio src={card.content} autoPlay className="sr-only" />
                                     )}
                                  </Card>
                               </motion.div>
                            </div>
                          );
                       })}
                    </div>
                  ) : (
                    <>
                      {currentQ.mediaUrl && (
                        <div className="rounded-xl overflow-hidden border border-border shadow-inner">
                          <img src={currentQ.mediaUrl} alt="Visual aid" className="w-full h-auto max-h-[300px] object-contain bg-black/20" />
                        </div>
                      )}
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        {currentQ.type === 'SHORT_ANSWER' ? (
                          <div className="col-span-full space-y-4">
                            <div className="relative group">
                              <Input 
                                value={identificationAnswers[soloQuestionIndex] || ''} 
                                onChange={e => setIdentificationAnswers(prev => ({ ...prev, [soloQuestionIndex]: e.target.value }))}
                                placeholder="Escribe tu respuesta aquí..."
                                className="bg-black/40 border-border/30 h-16 text-xl font-bold px-6 focus:ring-neon-blue uppercase"
                                disabled={answering || (sessionId && participant?.answeredThisRound)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && identificationAnswers[soloQuestionIndex]) {
                                    submitAnswer(identificationAnswers[soloQuestionIndex]);
                                  }
                                }}
                              />
                              <div className="absolute right-2 top-2 bottom-2">
                                 <Button 
                                   disabled={answering || !identificationAnswers[soloQuestionIndex]}
                                   onClick={() => submitAnswer(identificationAnswers[soloQuestionIndex])}
                                   className="h-full px-6 bg-neon-blue text-white font-black italic shadow-[0_0_15px_rgba(0,243,255,0.3)] hover:scale-105 active:scale-95 transition-all"
                                 >
                                    ENVIAR <ArrowRight className="w-4 h-4 ml-2" />
                                 </Button>
                              </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground italic text-center font-mono opacity-50 uppercase tracking-widest">Teclea tu respuesta y pulsa ENTER para enviar</p>
                          </div>
                        ) : (
                          (currentQ.options || []).map((opt: string, i: number) => {
                            if (hiddenOptions.includes(opt)) return null;
                          
                            return (
                              <Button 
                                key={i}
                                variant="outline" 
                                disabled={answering || (sessionId && participant?.answeredThisRound) || !isMyTurn()}
                                className={`min-h-[4rem] h-auto py-3 text-lg justify-start text-left px-6 border-border/50 hover:border-neon-blue hover:bg-neon-blue/10 bg-secondary/20 transition-all font-sans relative group whitespace-normal ${participant?.answeredThisRound && opt === currentQ.correctAnswer ? 'border-emerald-500 bg-emerald-500/10' : ''} ${activeWildcards['REVEAL_ANSWER'] && opt === currentQ.correctAnswer ? 'border-neon-purple shadow-[0_0_15px_rgba(168,85,247,0.5)]' : ''} ${!isMyTurn() ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                                onClick={() => submitAnswer(opt)}
                              >
                                <div className="w-8 h-8 rounded-full border border-border flex-shrink-0 flex items-center justify-center mr-4 text-xs font-bold bg-background group-hover:border-neon-blue group-hover:text-neon-blue transition-colors">
                                  {String.fromCharCode(65 + i)}
                                </div>
                                <span className="text-left whitespace-normal break-words">{opt}</span>
                              </Button>
                            );
                          })
                        )}
                      </div>
                    </>
                  )}

                  {sessionId && participant?.answeredThisRound && !answering && (
                    <div className="text-center py-8 animate-in fade-in slide-in-from-top-2">
                       <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30 text-sm font-bold">
                          <Star className="w-4 h-4" /> ¡Respuesta enviada! Esperando al resto...
                       </div>
                    </div>
                  )}

                  {!sessionId && (lastFeedback || aiFeedback || loadingAiFeedback) && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }} 
                      animate={{ opacity: 1, y: 0 }}
                      className={`mt-6 p-4 rounded-xl border ${lastFeedback?.correct ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'} backdrop-blur-md`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`p-2 rounded-lg ${lastFeedback?.correct ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>
                          {lastFeedback?.correct ? <Trophy className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                        </div>
                        <div className="flex-1">
                          <h4 className={`text-sm font-black uppercase italic ${lastFeedback?.correct ? 'text-emerald-500' : 'text-red-500'}`}>
                            {lastFeedback?.correct ? '¡Excelente!' : '¡Sigue intentando!'} 
                            <span className="ml-2 opacity-60 text-[10px]">+{lastFeedback?.points} PTS</span>
                          </h4>
                          
                          {loadingAiFeedback ? (
                            <div className="flex items-center gap-2 mt-1">
                              <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
                              <p className="text-xs text-muted-foreground italic">Analizando desempeño neural...</p>
                            </div>
                          ) : aiFeedback && (
                            <p className="text-xs text-foreground/80 mt-1 leading-relaxed border-l-2 border-white/10 pl-3 italic">
                              "{aiFeedback}"
                            </p>
                          )}
                        </div>
                        <Button 
                          size="sm" 
                          onClick={nextQuestion}
                          className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30"
                        >
                          Siguiente <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <div className="text-center py-20">
               <div className="animate-spin w-10 h-10 border-4 border-neon-blue border-t-transparent rounded-full mx-auto mb-4"></div>
               <p className="text-muted-foreground italic">Sincronizando con la matriz...</p>
            </div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Calculator Button */}
      <div className="fixed bottom-6 right-8 z-[60]">
        <Button 
          onClick={() => setCalcOpen(!calcOpen)}
          className="rounded-full w-14 h-14 bg-neon-purple hover:bg-neon-pink text-white shadow-lg neo-glow transition-transform hover:scale-110 active:scale-95"
        >
          <Calculator className="w-6 h-6" />
        </Button>
      </div>

      {calcOpen && (
        <Card className="fixed bottom-24 right-8 w-80 z-[70] border-neon-purple shadow-[0_0_30px_rgba(168,85,247,0.3)] bg-black/90 backdrop-blur-xl animate-in slide-in-from-bottom-2 zoom-in-95 overflow-hidden">
          <CardHeader className="py-2 px-4 border-b border-border/50 flex flex-row items-center justify-between bg-neon-purple/10">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-neon-purple flex items-center gap-2">
              <Calculator className="w-4 h-4" /> Laboratorio de Cálculo
            </CardTitle>
            <X className="w-4 h-4 cursor-pointer text-muted-foreground hover:text-white transition-colors" onClick={() => setCalcOpen(false)} />
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-neon-purple to-neon-pink rounded opacity-30 blur group-hover:opacity-100 transition-opacity"></div>
              <input 
                value={calcInput}
                readOnly
                placeholder="0"
                className="relative w-full bg-black text-right p-4 font-mono text-2xl rounded text-neon-purple focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-4 gap-2">
              {['sin','cos','tan','sqrt','7','8','9','/','4','5','6','*','1','2','3','-','C','0','.','+','(',')','^'].map(btn => {
                const isOp = ['/','*','-','+','^'].includes(btn);
                const isSci = ['sin','cos','tan','sqrt'].includes(btn);
                const isClear = btn === 'C';
                
                return (
                  <Button 
                    key={btn}
                    variant="outline" 
                    className={`h-11 font-black ${isClear ? 'bg-red-500/10 text-red-500 border-red-500/30' : isOp ? 'bg-neon-purple/10 text-neon-purple border-neon-purple/30' : isSci ? 'bg-neon-blue/10 text-neon-blue border-neon-blue/30 text-[10px]' : 'bg-secondary/30 text-white'} hover:scale-105 active:scale-95 transition-all text-xs`}
                    onClick={() => {
                      if (btn === 'C') setCalcInput('');
                      else if (['sin','cos','tan','sqrt'].includes(btn)) setCalcInput(prev => prev + btn + '(');
                      else setCalcInput(prev => prev + btn);
                    }}
                  >
                    {btn.toUpperCase()}
                  </Button>
                );
              })}
              <Button 
                className="col-span-4 h-12 bg-neon-purple text-white font-black text-lg shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:bg-neon-pink transition-colors" 
                onClick={() => {
                  try {
                     const res = evaluate(calcInput);
                     setCalcInput(String(Number(res.toFixed(8))));
                  } catch {
                     setCalcInput('Error');
                     setTimeout(() => setCalcInput(''), 1000);
                  }
                }}
              >
                =
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entrance Warning Dialog */}
      <Dialog open={showWarningModal && !sessionId} onOpenChange={setShowWarningModal}>
        <DialogContent className="border-neon-pink shadow-[0_0_50px_rgba(255,0,128,0.3)]">
          <DialogHeader>
            <DialogTitle className="flex items-center text-neon-pink text-xl font-black italic">
               <AlertTriangle className="mr-2" /> PROTOCOLO ANTI-TRAMPAS
            </DialogTitle>
            <DialogDescription className="pt-4 text-base leading-relaxed">
              El sistema de vigilancia está activo:
              <br/><br/>
              - Si abandonas la pestaña, se detectará la infracción.
              <br/>
              - Tienes <strong>{maxWarnings} intentos</strong> antes del bloqueo permanente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowWarningModal(false)} className="bg-neon-pink hover:bg-neon-pink/80 text-white w-full h-12 font-bold uppercase tracking-widest">
               Iniciar Misión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <footer className="py-6 border-t border-white/5 bg-black/40 backdrop-blur-md">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] uppercase font-black tracking-widest text-muted-foreground italic">
          <div className="flex items-center gap-2">
            <span className="text-neon-blue">Neural Network Intelligence</span>
            <span className="opacity-20">|</span>
            <span>v4.0.2</span>
          </div>
          <div className="text-center md:text-right">
            <span>Autoría: M.E.M.S. Wilfredo Chaparro Córdova</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
