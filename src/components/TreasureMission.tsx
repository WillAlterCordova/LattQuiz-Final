import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc, runTransaction } from 'firebase/firestore';
import { Gem, HelpCircle, Zap, Shield, Rocket, Search, Loader2, Navigation, Anchor, Compass, Mountain, Waves, Ship, MapPin, ChevronRight, Trophy, AlertCircle } from 'lucide-react';
import { notify } from './NeonNotification';
import playSound from '../lib/sounds';
import { WILDCARDS } from './WildcardSystem';
import { motion, AnimatePresence } from 'motion/react';

export const RIDDLES_BY_THEME: Record<string, { q: string, a: string }[]> = {
  'LOGICA': [
    { q: "Soy el principio del todo, el fin del lugar. Estoy en el centro del sol y al final del mar. ¿Qué soy?", a: "la letra s" },
    { q: "Cuanto más largo es, más corto parece. ¿Qué es?", a: "el tiempo" },
    { q: "Tengo llaves pero no cerraduras. Tengo espacio pero no habitaciones. Puedes entrar, pero nunca salir. ¿Qué soy?", a: "un teclado" },
    { q: "Se rompe sin tocarse, se pierde sin moverse. ¿Qué es?", a: "el silencio" },
    { q: "Pobrecito, pobrecito, todo el día caminando y no sale de su sitio.", a: "el reloj" },
    { q: "Si me nombras, desaparezco. ¿Quién soy?", a: "el silencio" },
    { q: "Tengo cien pies y no puedo caminar. ¿Qué soy?", a: "el ciempies" },
    { q: "Cuanto más le quitas, más grande se hace. ¿Qué es?", a: "un agujero" },
    { q: "Vuela sin alas, silba sin boca, pega sin manos y no lo ves.", a: "el viento" },
    { q: "Ayer pasó, mañana vendrá. No tiene cuerpo, pero todos lo conocerán. ¿Qué es?", a: "el tiempo" },
    { q: "Soy algo que los humanos intentamos matar todo el día, pero si no existiera, nada sucedería. ¿Qué soy?", a: "el tiempo" }
  ],
  'NATURALEZA': [
    { q: "Tiene ojos y no ve, tiene agua y no la bebe, tiene carne y no la come, tiene barba y no es hombre.", a: "un coco" },
    { q: "Vuelo sin alas, lloro sin ojos. ¿Qué soy?", a: "una nube" },
    { q: "Llevo mi casa a cuestas, camino sin tener patas y voy dejando mi huella con un hilito de plata.", a: "el caracol" },
    { q: "Agua pasa por mi casa, cate de mi corazón. El que no lo adivine, es un gran cabezón.", a: "el aguacate" },
    { q: "Dos pinzas tengo, hacia atrás camino, de mar o de río en el agua vivo.", a: "el cangrejo" },
    { q: "Sal al campo por la noche si me quieres conocer, soy señor de grandes ojos, cara seria y gran saber.", a: "el buho" },
    { q: "Cien amigos tengo, todos en una tabla, si yo no los toco, ninguno me habla.", a: "el piano" },
    { q: "Salgo de la tierra, me voy al cielo, caigo en gotas y vuelvo al suelo.", a: "la lluvia" },
    { q: "Tengo copa y no soy árbol, tengo hojas y no soy libro. ¿Qué soy?", a: "una baraja" },
    { q: "Tengo hipo y no bebo, tengo manos y no atrapo. ¿Qué soy?", a: "un hipocampo" }
  ],
  'HISTORIA': [
    { q: "Tengo ciudades, pero no casas. Tengo montañas, pero no árboles. Tengo agua, pero no peces. ¿Qué soy?", a: "un mapa" },
    { q: "Todos me pisan, pero yo no piso a nadie. Todos preguntan por mí, pero yo no pregunto por nadie.", a: "el camino" },
    { q: "Fui hecho para durar mil años, pero solo duré doce. En el fondo del mar hoy descanso. ¿Quién soy?", a: "el titanic" },
    { q: "Tengo hojas pero no soy árbol, tengo lomo pero no soy animal. ¿Qué soy?", a: "un libro" },
    { q: "Vengo de padres humanos pero no soy un humano. ¿Qué soy?", a: "una fotografia" },
    { q: "Corro y no tengo pies, tengo boca y no hablo. ¿Qué soy?", a: "un rio" },
    { q: "Me matan si no trabajo, me cuidan si soy valioso. ¿Qué soy?", a: "el tiempo" },
    { q: "Soy un viejo monumento que apunta al cielo sin parar, en el desierto estoy quieto y nadie me puede mover. ¿Qué soy?", a: "una piramide" },
    { q: "Tengo una gran nariz pero no huelo nada, tengo piel de piedra y soy muy antigua. ¿Quién soy?", a: "la esfinge" }
  ]
};

type MissionState = 'IDLE' | 'CHOOSING_PATH' | 'NAVIGATING' | 'FINISHING';

export function TreasureMission({ userData, userId }: { userData: any, userId: string }) {
  const [gameState, setGameState] = useState<MissionState>('IDLE');
  const [navData, setNavData] = useState<any>(null);
  const [currentRiddle, setCurrentRiddle] = useState<any>(null);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [paths, setPaths] = useState<any[]>([]);

  const dailyMissions = userData?.treasureMissions || { dailyCount: 0, lastResetDay: '' };
  const today = new Date().toISOString().split('T')[0];

  const resetIfNeeded = async () => {
    if (dailyMissions.lastResetDay !== today) {
      try {
        await updateDoc(doc(db, 'users', userId), {
          'treasureMissions.dailyCount': 0,
          'treasureMissions.lastResetDay': today
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  useEffect(() => {
    resetIfNeeded();
  }, [userData]);

  const generatePaths = () => {
    const difficulties = [
      { id: 'HARD', name: 'Difícil', islands: 6, color: 'text-red-500', icon: Ship },
      { id: 'MEDIUM', name: 'Media', islands: 10, color: 'text-amber-500', icon: Navigation },
      { id: 'EASY', name: 'Fácil', islands: 15, color: 'text-emerald-500', icon: Waves }
    ];
    const themes = Object.keys(RIDDLES_BY_THEME);
    
    // Select 3 random combinations (for variety, although here we have 3 diffs and 3 themes)
    const selectedPaths = difficulties.map(diff => {
      const randomTheme = themes[Math.floor(Math.random() * themes.length)];
      return {
        ...diff,
        theme: randomTheme,
        title: diff.id === 'HARD' ? 'Ruta de la Tormenta' : (diff.id === 'MEDIUM' ? 'Canal Olvidado' : 'Costa Serena')
      };
    });
    
    setPaths(selectedPaths);
    setGameState('CHOOSING_PATH');
    playSound.click();
  };

  const startNavigation = (path: any) => {
    const themeRiddles = RIDDLES_BY_THEME[path.theme];
    const firstRiddle = themeRiddles[Math.floor(Math.random() * themeRiddles.length)];
    
    setNavData({
      difficulty: path.id,
      theme: path.theme,
      islandsTotal: path.islands,
      currentIsland: 1,
      title: path.title
    });
    setCurrentRiddle(firstRiddle);
    setGameState('NAVIGATING');
    playSound.powerUp();
  };

  const handleVerify = async () => {
    if (!answer.trim()) return;
    setLoading(true);
    
    const normalizedInput = answer.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const normalizedAnswer = currentRiddle.a.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    if (normalizedInput.includes(normalizedAnswer) || normalizedAnswer.includes(normalizedInput)) {
      playSound.success();
      setAnswer('');
      
      if (navData.currentIsland >= navData.islandsTotal) {
        // Complete Journey
        await completeMission();
      } else {
        // Next Island
        const themeRiddles = RIDDLES_BY_THEME[navData.theme];
        let nextRiddle = themeRiddles[Math.floor(Math.random() * themeRiddles.length)];
        // Avoid showing the same riddle twice in a row if possible
        while (nextRiddle.q === currentRiddle.q && themeRiddles.length > 1) {
            nextRiddle = themeRiddles[Math.floor(Math.random() * themeRiddles.length)];
        }
        
        const nextIsland = navData.currentIsland + 1;
        setCurrentRiddle(nextRiddle);
        setNavData({ ...navData, currentIsland: nextIsland });
        notify(`¡Isla ${navData.currentIsland} superada! Siguiente parada activa.`, 'success');
      }
    } else {
      playSound.error();
      notify('Respuesta incorrecta. El barco permanece en el mismo lugar.', 'error');
    }
    setLoading(false);
  };

  const completeMission = async () => {
    try {
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, 'users', userId);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) return;

        const data = userSnap.data();
        const wildcards = data.wildcards || { '50_50': 0, 'EXTRA_POINTS': 0, 'CHANGE_QUESTION': 0, 'REVEAL_ANSWER': 0 };
        const types = Object.keys(WILDCARDS);
        const randomType = types[Math.floor(Math.random() * types.length)] as keyof typeof WILDCARDS;
        
        wildcards[randomType] = (wildcards[randomType] || 0) + 1;
        
        const missionData = data.treasureMissions || { dailyCount: 0, lastResetDay: today };
        missionData.dailyCount = (missionData.dailyCount || 0) + 1;
        missionData.lastResetDay = today;

        tx.update(userRef, { 
          wildcards,
          treasureMissions: missionData
        });

        return randomType;
      }).then((rewardType) => {
        if (rewardType) {
          playSound.powerUp();
          notify(`¡VIAJE COMPLETADO! Has llegado al Tesoro y recibiste: ${WILDCARDS[rewardType as keyof typeof WILDCARDS].name}`, 'success');
          setGameState('IDLE');
          setNavData(null);
          setCurrentRiddle(null);
        }
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'treasure_mission');
    }
  };

  const remaining = 3 - (dailyMissions.dailyCount || 0);

  return (
    <Card className="border-neon-blue/20 bg-black/60 backdrop-blur-3xl relative overflow-hidden group shadow-[0_0_40px_rgba(0,255,255,0.05)]">
      <div className="absolute top-0 right-0 w-64 h-64 bg-neon-blue/10 blur-[100px] opacity-20 -z-10 animate-pulse"></div>
      
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 text-white/80">
            <Anchor className="w-4 h-4 text-neon-blue" /> Navegación de Suministros
          </CardTitle>
          <div className="flex gap-1.5 p-1 bg-white/5 rounded-full px-2">
             {[1,2,3].map(i => (
               <div key={i} className={`w-2 h-2 rounded-full border border-white/10 transition-all ${i <= (dailyMissions.dailyCount || 0) ? 'bg-neon-blue shadow-[0_0_8px_var(--neon-blue)]' : 'bg-white/10'}`} />
             ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="min-h-[240px] flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {gameState === 'IDLE' && (
            <motion.div 
              key="idle"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6 text-center py-4"
            >
              <div className="mx-auto w-16 h-16 rounded-full bg-neon-blue/10 flex items-center justify-center border border-neon-blue/20 mb-2">
                <Ship className="w-8 h-8 text-neon-blue" />
              </div>
              <div className="space-y-2">
                <p className="text-[9px] font-bold text-neon-blue uppercase tracking-widest">Protocolo de Búsqueda Activo</p>
                <h3 className="text-xl font-black italic tracking-tighter text-white uppercase">
                  Zarpar hacia el Botín
                </h3>
                <p className="text-[10px] text-white/50 leading-relaxed max-w-[280px] mx-auto font-medium">
                  Elige una ruta. Las rutas más cortas tienen aguas más turbulentas. Completa todas las islas para reclamar tu comodín.
                </p>
              </div>
              <Button 
                disabled={remaining <= 0}
                onClick={generatePaths}
                className="w-full h-14 bg-neon-blue text-black font-black uppercase italic tracking-widest transition-all duration-500 relative overflow-hidden group shadow-[0_0_20px_rgba(0,243,255,0.4)] hover:shadow-[0_0_50px_rgba(255,0,255,0.6)] border-2 border-neon-blue/30 hover:border-white animate-pulse-glow hover:bg-neon-pink hover:text-white"
              >
                <Compass className="w-5 h-5 mr-3 group-hover:rotate-180 transition-transform duration-700" /> 
                {remaining > 0 ? 'ESTABLECER RUTA DE MISIÓN' : 'MUELLE CERRADO (3/3)'}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              </Button>
            </motion.div>
          )}

          {gameState === 'CHOOSING_PATH' && (
            <motion.div 
              key="choosing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="space-y-4 py-2"
            >
              <p className="text-[9px] font-black text-center text-white/40 uppercase tracking-[0.2em] mb-4">Selección de Coordenadas</p>
              <div className="grid gap-3">
                {paths.map((p, i) => (
                  <motion.button
                    whileHover={{ scale: 1.02, x: 5 }}
                    key={i}
                    onClick={() => startNavigation(p)}
                    className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:border-neon-blue/40 transition-all hover:bg-white/10 group"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2.5 rounded-xl bg-black/40 border border-white/5 shadow-inner ${p.color}`}>
                        <p.icon className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-black uppercase italic tracking-tighter text-white/90">{p.title}</p>
                        <p className="text-[8px] text-white/30 uppercase font-mono tracking-tighter">MAPA: {p.theme}</p>
                      </div>
                    </div>
                    <div className="text-right">
                       <p className={`text-[10px] font-black uppercase tracking-tighter ${p.color}`}>{p.name}</p>
                       <p className="text-[8px] text-white/40 font-mono italic">{p.islands} HITOS</p>
                    </div>
                  </motion.button>
                ))}
              </div>
              <Button variant="ghost" className="w-full text-[9px] font-bold uppercase opacity-30 hover:opacity-100" onClick={() => setGameState('IDLE')}>
                REGRESAR AL MUELLE
              </Button>
            </motion.div>
          )}

          {gameState === 'NAVIGATING' && (
            <motion.div 
              key="navigating"
              initial={{ opacity: 0, filter: 'blur(10px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              className="space-y-6"
            >
              <div className="flex justify-between items-end gap-4 border-b border-white/5 pb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Waves className="w-3 h-3 text-neon-blue animate-bounce" />
                    <p className="text-[8px] font-mono text-neon-blue uppercase tracking-[0.2em]">{navData.title}</p>
                  </div>
                  <h4 className="text-xl font-black italic tracking-tighter uppercase text-white">
                    HITOS: {navData.currentIsland} <span className="text-[10px] opacity-30">/ {navData.islandsTotal}</span>
                  </h4>
                </div>
                <div className="flex items-center gap-1.5 pb-2">
                   {Array.from({ length: navData.islandsTotal }).map((_, i) => (
                     <div 
                      key={i} 
                      className={`h-1.5 rounded-full transition-all duration-700 ${
                        i + 1 < navData.currentIsland ? 'w-3 bg-neon-blue' : 
                        i + 1 === navData.currentIsland ? 'w-8 bg-neon-blue shadow-[0_0_15px_rgba(0,255,255,0.5)]' : 
                        'w-1 bg-white/5'
                      }`} 
                     />
                   ))}
                </div>
              </div>

              <div className="p-6 bg-black/40 rounded-3xl border border-white/5 relative group">
                 <HelpCircle className="absolute -top-6 -right-6 w-24 h-24 text-neon-blue/5 -rotate-12 transition-transform group-hover:rotate-0 duration-1000" />
                 <p className="text-sm font-medium italic leading-relaxed text-center relative z-10 text-white/80">
                    "{currentRiddle.q}"
                 </p>
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <Input 
                    placeholder="INGRESAR RESPUESTA COGNITIVA..." 
                    value={answer}
                    onChange={e => setAnswer(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleVerify()}
                    className="bg-white/5 border-white/10 focus:border-neon-blue/50 text-center uppercase font-black text-xs h-14 rounded-2xl transition-all placeholder:text-white/10 tracking-widest"
                  />
                  {loading && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-neon-blue" />}
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="ghost" 
                    onClick={() => {
                      if(confirm('¿Seguro quieres abortar la navegación? Todo el progreso de esta ruta se perderá.')) {
                        setGameState('IDLE');
                      }
                    }}
                    className="flex-1 text-[9px] font-black uppercase tracking-widest h-12 border border-white/5 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                  >
                    ABORTAR
                  </Button>
                  <Button 
                    disabled={loading || !answer}
                    onClick={handleVerify}
                    className="flex-[2] h-12 bg-neon-blue text-black font-black uppercase italic tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(0,255,255,0.2)]"
                  >
                    VALIDAR COORDENADA
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
