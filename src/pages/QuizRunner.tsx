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
// 🛠️ REMOVIDO: Se eliminaron los imports antiguos de Firebase Firestore
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
  const [activeWildcards, setActiveWildcards] = useState<Record<string, boolean>>({});
  const [hiddenOptions, setHiddenOptions] = useState<string[]>([]);

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
         shuffled = [...shuffled].sort(() => Math.random() - 0.5).slice(0, qData.questions_per_attempt);
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
  }, [warnings, sessionId, user?.uid, globalConfig]);

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

    const isTotallyCorrect = correctCount === (currentQ.options || []).length;
    submitAnswer(isTotallyCorrect ? currentQ.correctAnswer || 'IDENTIFIED_COMPLETE' : 'IDENTIFIED_INCOMPLETE');
  };

  const [memoramaCards, setMemoramaCards] = useState<any[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [matchedPairs, setMatchedPairs] = useState<string[]>([]);

  useEffect(() => {
    if (quiz?.type === 'MEMORAMA' && questions.length > 0) {
      const cards: any[] = [];
      questions.forEach((q) => {
        if (q.itemA && q.itemB) {
          cards.push({ id: `${q.id}-a`, ...q.itemA, pairId: q.id });
          cards.push({ id: `${q.id}-b`, ...q.itemB, pairId: q.id });
        } else {
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
      
      const qIndex = sessionId ? (session?.current_question_index || 0) : soloQuestionIndex;
      const currentQ = questions[qIndex];

      if (currentWildcards[type] > 0) {
        currentWildcards[type]--;
        await supabase.from('profiles').update({ wildcards: currentWildcards }).eq('id', user.uid);
        
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
    if (session.config?.isClassroom) return true; 
    if (session.type !== 'POR_EQUIPOS' && session.type !== 'LA_TORRE') return true;
    
    const myTeamIdx = session.teams?.findIndex((t: any) => t.members?.includes(user?.uid));
    if (session.stealingAllowed) {
       return myTeamIdx !== -1 && myTeamIdx !== session.currentTurnTeam;
    }
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

    if (sessionId && participant?.answeredThisRound) return;
    if (!isMyTurn()) return;

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
        
        if (session?.type === 'LA_TORRE' && session.suggestions && Object.keys(session.suggestions).length > 0) {
          const suggestions = Object.values(session.suggestions);
          if (suggestions.includes(currentQ.correct_answer || currentQ.correctAnswer)) {
            points = Math.max(1, Math.floor(points * 0.7)); 
          }
        }

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
           points = -5; 
        }
      }

      setLastFeedback({ correct: isCorrect, points });
      
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

        // 🛠️ MIGRACIÓN DE FIRESTORE A SUPABASE (Equipos / La Torre)
        if ((session.type === 'POR_EQUIPOS' || session.type === 'LA_TORRE') && !session.config?.isClassroom) {
          const { data: sData, error: sErr } = await supabase.from('sessions').select('*').eq('id', sessionId).single();
          if (!sErr && sData) {
            const newTeams = [...sData.teams];
            const myTeamIdx = newTeams.findIndex((t: any) => t.members?.includes(user?.uid));
            
            if (myTeamIdx !== -1) {
              let stabilityImpact = 0;
              const updateData: any = { teams: newTeams };

              if (isCorrect) {
                 const timeTaken = sData.question_start_time ? (Date.now() - new Date(sData.question_start_time).getTime()) / 1000 : 10;
                 const speedBonus = session.type === 'A_LA_CIMA' ? Math.max(0, Math.floor((20 - timeTaken) * 2)) : 0;
                 
                 if (sData.stealingAllowed) {
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
                 if (session.type === 'LA_TORRE') {
                    newTeams[myTeamIdx].towerGaps = [...(newTeams[myTeamIdx].towerGaps || []), session.currentQuestionIndex];
                    stabilityImpact = Math.floor(Math.random() * 15) + 10;
                    newTeams[myTeamIdx].towerStability = Math.max(0, (newTeams[myTeamIdx].towerStability || 100) - stabilityImpact);
                 }
                 if (!sData.stealingAllowed) {
                    updateData.stealingAllowed = true;
                    updateData.gameLog = [
                       ...(sData.gameLog || []).slice(-5),
                       `¡${newTeams[myTeamIdx].name} falló! El otro equipo puede robar.`
                    ];
                 } else {
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
              await supabase.from('sessions').update(updateData).eq('id', sessionId);
            }
          }
        }
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
        responses: responses 
      });
      if (attemptError) throw attemptError;

      const { data: pData } = await supabase.from('profiles').select('*').eq('id', user.uid).single();
      if (pData) {
        const prevAttemptsCount = pData.attempts_count || 0;
        const prevAvg = pData.average_grade || 0;
        const totalPossible = questions.length * 10;
        const normalizedScore = totalPossible > 0 ? (finalScore / totalPossible) * 10 : 0;
        const newAvg = ((prevAvg * prevAttemptsCount) + normalizedScore) / (prevAttemptsCount + 1);
        await supabase.from('profiles').update({ average_grade: Math.min(10, newAvg), attempts_count: prevAttemptsCount + 1 }).eq('id', user.uid);
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
          <p className="text-muted-foreground text-sm uppercase font-bold">
            Sincronizando con el canal del docente. Por favor, mantén esta pestaña abierta.
          </p>
          <div className="p-4 bg-white/5 rounded-xl border border-white/5 font-mono text-xs text-neon-purple uppercase">
            Participantes listos: {participants.length}
          </div>
        </Card>
      </div>
    );
  }

  if (isNotAvailable) {
    return (
      <div className="min-h-screen cosmic-grid bg-background flex flex-col items-center justify-center p-8 text-center">
        <ShieldAlert className="w-20 h-20 text-neon-pink mb-6 animate-pulse" />
        <h1 className="text-4xl font-black italic mb-4 text-neon-pink uppercase">Acceso No Disponible</h1>
        <p className="text-muted-foreground max-w-md bg-black/40 p-6 rounded-2xl border border-white/5">{availabilityError}</p>
        <Button onClick={() => navigate('/')} className="mt-8 bg-neon-blue text-black font-black uppercase italic tracking-tighter h-12 px-8">
          Regresar al Nexo Central
        </Button>
      </div>
    );
  }

  const qIndex = sessionId ? (session?.current_question_index || 0) : soloQuestionIndex;
  const currentQ = questions[qIndex];

  return (
    <div className="min-h-screen cosmic-grid text-white bg-slate-950 flex flex-col justify-between">
      <header className="py-4 border-b border-white/5 bg-black/40 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <BrainCircuit className="w-6 h-6 text-neon-blue" />
            <h1 className="text-xl font-black italic text-neon-blue tracking-tight uppercase">
              {quiz?.quiz_title || session?.quiz_title || 'Evaluación Neural'}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {globalTimeRemaining !== null && (
              <Badge variant="outline" className="border-neon-purple text-neon-purple font-mono px-3 py-1 text-xs">
                Tiempo: {Math.floor(globalTimeRemaining / 60)}:{(globalTimeRemaining % 60).toString().padStart(2, '0')}
              </Badge>
            )}
            <Badge variant="outline" className="border-neon-blue text-neon-blue font-bold px-3 py-1 text-xs">
              Reactivo {qIndex + 1} de {questions.length}
            </Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 flex-grow max-w-4xl">
        <AnimatePresence mode="wait">
          {!showSummary && currentQ ? (
            <motion.div
              key={currentQ.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <Card className="bg-black/60 border-white/5 backdrop-blur-xl p-8 rounded-3xl neo-glow shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-blue to-neon-purple"></div>
                <div className="flex justify-between items-start gap-4 mb-6">
                  <Badge className="bg-neon-blue/10 text-neon-blue font-black border-neon-blue/20 uppercase tracking-wider">
                    {currentQ.type}
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground">Valor: {currentQ.points || 10} pts</span>
                </div>

                <h3 className="text-2xl font-bold tracking-tight mb-8 leading-relaxed">
                  {currentQ.text.includes('\\') || currentQ.text.includes('$') ? (
                    <InlineMath math={currentQ.text} />
                  ) : currentQ.text}
                </h3>

                {/* Área de Opciones según Tipo de Reactivo */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  {currentQ.type === 'MULTIPLE_CHOICE' && currentQ.options?.map((opt: string, idx: number) => {
                    if (hiddenOptions.includes(opt)) return null;
                    return (
                      <Button
                        key={idx}
                        disabled={answering}
                        onClick={() => submitAnswer(opt)}
                        className="h-16 bg-white/5 hover:bg-neon-blue/10 border border-white/10 hover:border-neon-blue text-left justify-start px-6 rounded-xl text-base font-medium transition-all duration-200 uppercase italic text-white"
                      >
                        <ChevronRight className="w-5 h-5 mr-3 text-neon-blue opacity-50" />
                        {opt}
                      </Button>
                    );
                  })}
                </div>

                {currentQ.type === 'SHORT_ANSWER' && (
                  <form onSubmit={(e: any) => { e.preventDefault(); submitAnswer(e.target.ans.value); e.target.reset(); }} className="flex gap-4 mt-6">
                    <Input name="ans" required placeholder="Escribe tu respuesta aquí..." className="bg-black/40 border-white/10 h-14 text-lg focus:border-neon-purple" />
                    <Button type="submit" disabled={answering} className="bg-neon-purple hover:bg-neon-purple/80 text-white h-14 px-8 font-bold uppercase tracking-widest rounded-xl">
                      Enviar
                    </Button>
                  </form>
                )}
              </Card>

              {/* Sistema de Comodines */}
              {!sessionId && (
                <div className="flex gap-3 justify-center bg-black/20 p-4 rounded-2xl border border-white/5">
                  {Object.keys(WILDCARDS).map((key) => {
                    const w = WILDCARDS[key as WildcardType];
                    const count = participant?.wildcards?.[key] || 0;
                    return (
                      <TooltipProvider key={key}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={() => useWildcard(key as WildcardType)}
                              disabled={count <= 0 || activeWildcards[key]}
                              className={`relative p-3 h-14 w-14 rounded-xl border flex flex-col items-center justify-center transition-all ${
                                count > 0 ? 'bg-white/5 border-white/10 hover:border-neon-blue text-neon-blue' : 'bg-black/40 border-white/5 text-muted-foreground opacity-30'
                              }`}
                            >
                              <Zap className="w-5 h-5" />
                              <span className="absolute -top-2 -right-2 bg-neon-purple text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold font-mono">
                                {count}
                              </span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="bg-slate-900 border-white/10 text-white p-3 max-w-xs">
                            <p className="font-black text-xs uppercase tracking-wider text-neon-blue mb-1">{w.name}</p>
                            <p className="text-[10px] text-slate-300 uppercase leading-normal">{w.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-8 py-12"
            >
              <div className="w-24 h-24 bg-neon-blue/10 rounded-full flex items-center justify-center mx-auto border border-neon-blue/30 shadow-[0_0_30px_rgba(0,243,255,0.2)]">
                <Trophy className="w-12 h-12 text-neon-blue animate-bounce" />
              </div>
              <div className="space-y-2">
                <h2 className="text-4xl font-black italic text-neon-blue uppercase tracking-tighter">Misión Concluida</h2>
                <p className="text-muted-foreground uppercase font-mono tracking-widest text-xs">Resultados indexados en el Core de Datos</p>
              </div>
              <Button onClick={() => navigate('/student')} className="bg-neon-blue text-black font-black uppercase italic tracking-tighter h-14 px-12 text-base shadow-[0_0_25px_rgba(0,243,255,0.3)]">
                Regresar al Panel Estudiantil
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modales de Seguridad / Alertas */}
      <Dialog open={showWarningModal} onOpenChange={setShowWarningModal}>
        <DialogContent className="bg-slate-950 border-neon-pink/30 text-white max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black italic text-neon-pink flex items-center tracking-tight uppercase">
               <AlertTriangle className="mr-2 animate-pulse text-neon-pink" /> Protocolo Anti-Trampas
            </DialogTitle>
            <DialogDescription className="pt-4 text-sm leading-relaxed text-slate-300 uppercase font-medium">
              El sistema de vigilancia está activo:
              <br/><br/>
              - Si abandonas la pestaña, se detectará la infracción.
              <br/>
              - Tienes <strong>{maxWarnings} intentos</strong> antes del bloqueo permanente de tu cuenta.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button onClick={() => setShowWarningModal(false)} className="bg-neon-pink hover:bg-neon-pink/80 text-white w-full h-12 font-black uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(255,0,127,0.3)]">
               Iniciar Misión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showKickedModal} onOpenChange={() => {}}>
        <DialogContent className="bg-black border-red-500 text-white max-w-md rounded-3xl p-8 text-center" onClose={false}>
          <ShieldAlert className="w-20 h-20 text-red-500 mx-auto mb-6 animate-bounce" />
          <h2 className="text-3xl font-black text-red-500 tracking-tighter uppercase mb-4">Terminal Bloqueada</h2>
          <p className="text-sm text-slate-400 uppercase font-bold leading-relaxed mb-6">
            Has excedido el número máximo de violaciones de seguridad permitidas por el protocolo de LattQuiz. Tu ID ha sido suspendido.
          </p>
          <Button onClick={() => navigate('/')} className="bg-red-600 hover:bg-red-700 w-full h-12 font-black uppercase">
            Cerrar Sesión
          </Button>
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
