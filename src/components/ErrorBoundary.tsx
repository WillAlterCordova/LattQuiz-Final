import React, { ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RefreshCcw, Home } from 'lucide-react';
import { Button } from './ui/button';
import { errorService } from '../services/errorService';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    errorService.handle(error, 'ErrorBoundary Catch');
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-card/50 backdrop-blur-xl border border-red-500/20 rounded-3xl p-8 text-center space-y-6 shadow-[0_0_50px_rgba(239,68,68,0.1)]">
            <div className="w-20 h-20 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertOctagon className="w-10 h-10 text-red-500" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">Anomalía del Sistema</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Se ha detectado una interrupción en el flujo neural. El núcleo de LatQuiz ha sido protegido automáticamente.
              </p>
            </div>

            {this.state.error && (
              <div className="p-4 bg-black/40 rounded-xl border border-white/5 text-left">
                <p className="text-[10px] font-mono text-red-400 uppercase mb-1">Log de Error:</p>
                <p className="text-[10px] font-mono text-muted-foreground break-all leading-tight">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 pt-4">
              <Button 
                onClick={() => window.location.reload()}
                className="bg-white text-black font-black uppercase italic h-12 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
              >
                <RefreshCcw className="w-4 h-4 mr-2" />
                Reiniciar
              </Button>
              <Button 
                variant="outline"
                onClick={() => window.location.href = '/'}
                className="border-white/10 text-white font-black uppercase italic h-12"
              >
                <Home className="w-4 h-4 mr-2" />
                Inicio
              </Button>
            </div>

            <p className="text-[8px] font-mono uppercase tracking-[0.3em] opacity-30 pt-4">
              Error Protocol LAT-ERR-X
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
