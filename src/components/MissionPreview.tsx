import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Users, 
  TowerControl as Tower, 
  Cpu, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  HelpCircle,
  ArrowRight,
  UserCheck,
  MessageSquare,
  ShieldCheck,
  Zap,
  Rocket,
  Target
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Step {
  title: string;
  description: string;
  icon: React.ReactNode;
  animation?: any;
}

const PREVIEWS: Record<string, { title: string; steps: Step[] }> = {
  CLASICO: {
    title: "Modo Clásico",
    steps: [
      {
        title: "Aprendizaje Autónomo",
        description: "Enfocado en el estudio individual. Los alumnos responden a su propio ritmo sin presión de tiempo externa.",
        icon: <HelpCircle className="w-8 h-8 text-neon-blue" />,
      },
      {
        title: "Exploración de Conceptos",
        description: "Ideal para introducir temas nuevos o repasar antes de una evaluación competitiva.",
        icon: <CheckCircle2 className="w-8 h-8 text-emerald-500" />,
      },
      {
        title: "Registro de Progreso",
        description: "Los resultados sirven como base para identificar áreas de oportunidad en cada estudiante.",
        icon: <Trophy className="w-8 h-8 text-amber-500" />,
      }
    ]
  },
  POR_EQUIPOS: {
    title: "Duelo de Escuadrones",
    steps: [
      {
        title: "Formación Táctica",
        description: "El sistema divide al grupo en escuadrones equilibrados para garantizar una competencia justa.",
        icon: <Users className="w-8 h-8 text-neon-purple" />,
      },
      {
        title: "Sincronización Bélica",
        description: "Los aciertos de cada miembro suman potencia al escudo y ataque del equipo.",
        icon: <Zap className="w-8 h-8 text-neon-blue" />,
      },
      {
        title: "Objetivo Común",
        description: "Solo el equipo con mejor coordinación estratégica logrará dominar el sector.",
        icon: <Clock className="w-8 h-8 text-neon-pink" />,
      }
    ]
  },
  A_LA_CIMA: {
    title: "Misión: A la Cima",
    steps: [
      {
        title: "Carrera Ascendente",
        description: "Todos los cadetes inician en la base. Cada respuesta correcta activa tus propulsores de ascenso.",
        icon: <Trophy className="w-8 h-8 text-neon-blue" />,
      },
      {
        title: "Radar de Competencia",
        description: "Visualiza en tiempo real la altitud de tus compañeros. ¡No permitas que te superen!",
        icon: <Zap className="w-8 h-8 text-neon-pink" />,
      },
      {
        title: "Cumbre Lograda",
        description: "El primer estudiante en alcanzar la altitud máxima se corona como líder de la misión.",
        icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />,
      }
    ]
  },
  LA_TORRE: {
    title: "El Juego de la Torre",
    steps: [
      {
        title: "Roles Colaborativos",
        description: "Divididos en Alpha y Omega. El éxito depende de la comunicación entre constructores.",
        icon: <Users className="w-8 h-8 text-neon-blue" />,
      },
      {
        title: "Turno Crítico",
        description: "El sistema selecciona a un jugador para colocar el siguiente piso. ¡Toda la presión está en ti!",
        icon: <UserCheck className="w-8 h-8 text-neon-purple" />,
      },
      {
        title: "Transmisión de Datos",
        description: "El equipo puede enviar sugerencias, pero el uso de este canal reduce el puntaje del turno.",
        icon: <MessageSquare className="w-8 h-8 text-neon-pink" />,
      },
      {
        title: "Integridad Estructural",
        description: "Cada error deja un hueco. Si la torre pierde equilibrio por demasiados fallos, ¡colapsará!",
        icon: <Tower className="w-8 h-8 text-neon-blue" />,
      }
    ]
  },
  IDENTIFICACION: {
    title: "Identificación de Componentes",
    steps: [
      {
        title: "Inspección Técnica",
        description: "Analiza imágenes y diagramas para localizar fallos o componentes específicos del sistema.",
        icon: <Cpu className="w-8 h-8 text-neon-blue" />,
      },
      {
        title: "Precisión de Señalado",
        description: "Interactúa directamente con la imagen para marcar las coordenadas del componente solicitado.",
        icon: <Target className="w-8 h-8 text-neon-pink" />,
      },
      {
        title: "Validación Experta",
        description: "Demuestra tu agudeza visual y conocimiento técnico bajo condiciones de misión real.",
        icon: <ShieldCheck className="w-8 h-8 text-emerald-500" />,
      }
    ]
  }
};

interface MissionPreviewProps {
  type: string;
  onClose: () => void;
}

const VisualAction = ({ type, step }: { type: string, step: number }) => {
  if (type === 'A_LA_CIMA') {
    return (
      <div className="relative w-40 h-40 flex flex-col items-center justify-center p-4 bg-black/40 rounded-3xl border border-white/10 overflow-hidden">
        <div className="absolute inset-0 flex flex-col justify-end p-2 gap-1">
          {[...Array(5)].map((_, i) => (
             <div key={i} className="h-1 w-full bg-white/5 rounded-full" />
          ))}
        </div>
        <motion.div 
          animate={{ 
            y: [-10, 10, -10],
            x: step * 10
          }}
          transition={{ repeat: Infinity, duration: 3 }}
          className="relative"
        >
          <Rocket className="w-12 h-12 text-neon-blue rotate-[-45deg]" />
          <motion.div 
            animate={{ opacity: [1, 0, 1] }}
            className="absolute -bottom-2 -left-2 w-4 h-4 bg-neon-blue/40 rounded-full blur-md"
          />
        </motion.div>
        <div className="absolute top-4 right-4">
           <Trophy className="w-8 h-8 text-amber-500 animate-bounce" />
        </div>
      </div>
    );
  }

  if (type === 'IDENTIFICACION') {
    return (
      <div className="relative w-40 h-40 flex items-center justify-center bg-black/40 rounded-3xl border border-white/10">
        <div className="grid grid-cols-2 gap-2 p-4 w-full">
           <div className="h-12 bg-white/5 rounded-lg border border-white/10 flex items-center justify-center">
              <Cpu className="w-6 h-6 text-neon-blue/20" />
           </div>
           <motion.div 
             animate={{ 
               borderColor: step > 0 ? '#ff00a0' : 'rgba(255,255,255,0.1)',
               boxShadow: step > 0 ? '0 0 15px rgba(255,0,160,0.3)' : 'none'
             }}
             className="h-12 bg-white/5 rounded-lg border flex items-center justify-center relative"
           >
              <Cpu className="w-6 h-6 text-neon-blue" />
              {step > 0 && (
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1 -right-1"
                >
                  <Target className="w-4 h-4 text-neon-pink" />
                </motion.div>
              )}
           </motion.div>
           <div className="h-12 bg-white/5 rounded-lg border border-white/10" />
           <div className="h-12 bg-white/5 rounded-lg border border-white/10" />
        </div>
      </div>
    );
  }

  if (type === 'LA_TORRE') {
    return (
      <div className="relative w-40 h-40 flex flex-col-reverse items-center justify-start gap-1 p-4 bg-black/40 rounded-3xl border border-white/10 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <motion.div 
            key={i}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
              scale: i < step + 1 ? 1 : 0.8, 
              opacity: i < step + 1 ? 1 : 0.2,
              y: i < step + 1 ? 0 : 20 
            }}
            className={`w-24 h-4 rounded-md shadow-lg ${
              i % 2 === 0 ? 'bg-neon-blue' : 'bg-neon-purple'
            } ${i === step ? 'ring-2 ring-white animate-pulse' : ''}`}
          />
        ))}
        {step >= 3 && (
          <motion.div 
            initial={{ x: -100 }}
            animate={{ x: 0 }}
            className="absolute top-4 right-4 bg-neon-pink/20 p-2 rounded-lg border border-neon-pink/40"
          >
            <MessageSquare className="w-4 h-4 text-neon-pink" />
          </motion.div>
        )}
      </div>
    );
  }

  if (type === 'POR_EQUIPOS') {
    return (
      <div className="relative w-40 h-40 flex items-center justify-center gap-4 bg-black/40 rounded-3xl border border-white/10">
        <div className="flex flex-col gap-2">
          {[...Array(3)].map((_, i) => (
            <motion.div 
              key={i}
              animate={{ x: step > 0 ? 10 : 0, opacity: step > 1 ? (i === 1 ? 1 : 0.5) : 1 }}
              className="w-10 h-2 bg-neon-blue rounded-full"
            />
          ))}
        </div>
        <motion.div 
          animate={{ scale: step > 1 ? [1, 1.2, 1] : 1 }}
          transition={{ repeat: Infinity, duration: 1 }}
          className="w-8 h-8 rounded-full bg-neon-pink flex items-center justify-center shadow-[0_0_15px_rgba(255,0,160,0.5)]"
        >
          <Zap className="w-4 h-4 text-white" />
        </motion.div>
        <div className="flex flex-col gap-2">
          {[...Array(3)].map((_, i) => (
            <motion.div 
              key={i}
              animate={{ x: step > 0 ? -10 : 0, opacity: step > 1 ? (i === 1 ? 1 : 0.5) : 1 }}
              className="w-10 h-2 bg-neon-purple rounded-full"
            />
          ))}
        </div>
      </div>
    );
  }

  // Classic / Default
  return (
    <div className="relative w-40 h-40 flex flex-col items-center justify-center gap-3 bg-black/40 rounded-3xl border border-white/10">
      <motion.div 
        animate={{ 
          y: step === 0 ? [0, -5, 0] : 0,
          scale: step === 1 ? [1, 1.05, 1] : 1
        }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="w-24 h-12 bg-secondary/50 rounded-xl border border-white/10 flex items-center justify-center"
      >
        <div className="w-16 h-2 bg-white/20 rounded-full" />
      </motion.div>
      <div className="grid grid-cols-2 gap-2 w-24">
        {[...Array(4)].map((_, i) => (
          <motion.div 
            key={i}
            animate={{ 
              backgroundColor: step === 1 && i === 1 ? '#10b981' : 'rgba(255,255,255,0.05)',
              borderColor: step === 1 && i === 1 ? '#10b981' : 'rgba(255,255,255,0.1)'
            }}
            className="w-full h-8 rounded-lg border flex items-center justify-center"
          >
             {step === 1 && i === 1 && <CheckCircle2 className="w-3 h-3 text-white" />}
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export function MissionPreview({ type, onClose }: MissionPreviewProps) {
  const preview = PREVIEWS[type] || PREVIEWS.CLASICO;
  const [currentStep, setCurrentStep] = useState(0);

  const next = () => {
    if (currentStep < preview.steps.length - 1) {
      setCurrentStep(s => s + 1);
    } else {
      onClose();
    }
  };

  const current = preview.steps[currentStep];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-lg bg-slate-900 border-2 border-neon-blue/30 rounded-[2rem] overflow-hidden shadow-[0_0_50px_rgba(0,243,255,0.2)]"
      >
        <div className="p-8">
          <div className="flex justify-between items-center mb-8">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-neon-blue/60 italic">Tutorial de Misión</span>
              <h2 className="text-2xl font-black italic tracking-tighter text-white">{preview.title}</h2>
            </div>
            <div className="flex gap-1">
              {preview.steps.map((_, i) => (
                <div 
                  key={i} 
                  className={`h-1 rounded-full transition-all duration-500 ${i === currentStep ? 'w-8 bg-neon-blue' : 'w-2 bg-white/10'}`}
                />
              ))}
            </div>
          </div>

          <div className="min-h-[350px] flex flex-col items-center justify-center text-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 50, rotateY: 90 }}
                animate={{ opacity: 1, x: 0, rotateY: 0 }}
                exit={{ opacity: 0, x: -50, rotateY: -90 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="space-y-8"
              >
                <div className="flex flex-col items-center gap-6">
                  <VisualAction type={type} step={currentStep} />
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <div className="p-1.5 bg-neon-blue/10 rounded-lg scale-75 opacity-80">
                        {current.icon}
                      </div>
                      <h3 className="text-xl font-bold text-white uppercase tracking-tight">{current.title}</h3>
                    </div>
                    <p className="text-muted-foreground text-sm leading-relaxed max-w-[280px] mx-auto opacity-80">
                      {current.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-12 flex gap-4">
            <Button 
              variant="outline" 
              className="flex-1 rounded-2xl border-white/10 hover:bg-white/5"
              onClick={onClose}
            >
              SALTAR
            </Button>
            <Button 
              className="flex-1 bg-neon-blue text-black hover:bg-neon-blue/90 font-black italic rounded-2xl group shadow-[0_0_20px_rgba(0,243,255,0.4)]"
              onClick={next}
            >
              {currentStep === preview.steps.length - 1 ? '¡ENTENDIDO!' : 'Siguiente'}
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>

        {/* Decorative corner */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-neon-blue/5 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-neon-purple/5 blur-3xl pointer-events-none" />
      </motion.div>
    </div>
  );
}
