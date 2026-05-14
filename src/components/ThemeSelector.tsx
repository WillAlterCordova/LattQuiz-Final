import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useThemeStore, LattTheme } from '../store/themeStore';
import { Palette, Zap, Moon, Sun, Cpu, FlaskConical, Sparkles, Settings2, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

const THEMES: { id: LattTheme; label: string; icon: any; colors: string[]; desc: string }[] = [
  { id: 'original', label: 'Original', icon: Sparkles, colors: ['#00f3ff', '#a855f7', '#ff00e5'], desc: 'El núcleo neural estándar con contrastes cian y púrpura.' },
  { id: 'cosmic', label: 'Cósmico', icon: Moon, colors: ['#00e5ff', '#ffcc00', '#ff0080'], desc: 'Inspirado en el vacío profundo con polvo estelar dorado.' },
  { id: 'hematomas', label: 'Hematomas', icon: FlaskConical, colors: ['#ff0000', '#8000ff', '#ff0040'], desc: 'Tonos viscerales de alto contraste para máxima intensidad.' },
  { id: 'digital', label: 'Digital', icon: Cpu, colors: ['#00ff00', '#00ffcc', '#00f3ff'], desc: 'Matriz técnica basada en terminales clásicas de alta fidelidad.' },
  { id: 'thunderstorm', label: 'Thunderstorm', icon: Zap, colors: ['#3b82f6', '#1d4ed8', '#ffffff'], desc: 'Capa atmosférica con descargas eléctricas y azules profundos.' },
  { id: 'twilight', label: 'Twilight', icon: Sun, colors: ['#f97316', '#4c1d95', '#fb7185'], desc: 'Transición entre luz y sombra con destellos crepusculares.' },
];

export function ThemeSelector() {
  const { theme: currentTheme, setTheme } = useThemeStore();
  const activeThemeData = THEMES.find(t => t.id === currentTheme) || THEMES[0];

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button 
            type="button"
            className="relative group p-2 rounded-lg transition-all duration-500 border border-white/5 bg-white/5 hover:border-primary/50 flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Palette className="w-5 h-5 text-primary group-hover:rotate-12 transition-transform" />
            <motion.div 
              className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" 
              animate={{ scale: [1, 1.5, 1] }} 
              transition={{ repeat: Infinity, duration: 2 }} 
            />
          </button>
        }
      />
      <DialogContent className="sm:max-w-[600px] bg-background/95 backdrop-blur-2xl border-white/10 shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/20 rounded-lg text-primary">
              <Palette className="w-5 h-5 shadow-[0_0_10px_rgba(var(--primary),0.5)]" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">Matriz de Interfaz</DialogTitle>
              <DialogDescription className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest opacity-60">Personaliza tu entorno neural</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {THEMES.map((t) => (
            <motion.button
              key={t.id}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setTheme(t.id)}
              className={cn(
                "relative overflow-hidden group p-5 rounded-2xl border transition-all duration-500 text-left h-32",
                currentTheme === t.id 
                  ? "bg-white/10 border-primary shadow-[0_0_30px_rgba(var(--primary),0.1)]" 
                  : "bg-white/5 border-white/5 hover:border-white/20"
              )}
            >
              {/* Theme Preview Background */}
              <div className="absolute inset-0 opacity-[0.03] group-hover:opacity-10 transition-opacity">
                <div 
                  className="absolute inset-0 blur-3xl scale-150" 
                  style={{ 
                    background: `linear-gradient(45deg, ${t.colors[0]}, ${t.colors[1]}, ${t.colors[2]})` 
                  }} 
                />
              </div>

              <div className="relative z-10 h-full flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div 
                    className={cn(
                      "p-3 rounded-xl transition-all duration-500",
                      currentTheme === t.id ? "bg-primary text-primary-foreground shadow-lg" : "bg-white/5 text-muted-foreground"
                    )}
                  >
                    <t.icon className="w-5 h-5" />
                  </div>
                  {currentTheme === t.id && (
                    <div className="text-[9px] font-black uppercase tracking-widest text-primary italic px-2 py-0.5 border border-primary/30 rounded-full bg-primary/10">ACTIVO</div>
                  )}
                </div>
                <div>
                  <p className={cn(
                    "text-[12px] font-black uppercase tracking-[0.2em] mb-1 transition-colors duration-500",
                    currentTheme === t.id ? "text-primary" : "text-white/80"
                  )}>
                    {t.label}
                  </p>
                  <p className="text-[9px] text-muted-foreground leading-tight uppercase font-medium opacity-60 line-clamp-2">{t.desc}</p>
                </div>
              </div>
              
              {/* Color Stripe */}
              <div className="absolute bottom-0 left-0 right-0 h-1 flex">
                {t.colors.map((c, i) => (
                  <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                ))}
              </div>
            </motion.button>
          ))}
        </div>
        
        <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
           <div className="flex gap-4">
              <div className="text-center">
                 <p className="text-[10px] font-black text-muted-foreground uppercase opacity-40 mb-1">Capa Visual</p>
                 <Badge variant="outline" className="text-[10px] font-bold">{activeThemeData.id.toUpperCase()}</Badge>
              </div>
              <div className="text-center">
                 <p className="text-[10px] font-black text-muted-foreground uppercase opacity-40 mb-1">Nodo de Color</p>
                 <div className="flex gap-1">
                    {activeThemeData.colors.map(c => <div key={c} className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />)}
                 </div>
              </div>
           </div>
           <p className="text-[9px] font-black italic uppercase text-muted-foreground opacity-30 tracking-widest">LattQuiz Neural Engine</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
