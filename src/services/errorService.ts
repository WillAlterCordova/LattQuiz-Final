import { notify } from '../components/NeonNotification';
import { supabase } from '../lib/supabase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export enum ErrorCategory {
  NETWORK = 'NETWORK',
  AUTH = 'AUTH',
  DATABASE = 'DATABASE',
  QUOTA = 'QUOTA',
  LOGIC = 'LOGIC',
  AI = 'AI',
  UNKNOWN = 'UNKNOWN'
}

export interface AppErrorData {
  message: string;
  category: ErrorCategory;
  originalError?: any;
  context?: Record<string, any>;
}

export class AppError extends Error {
  data: AppErrorData;

  constructor(data: AppErrorData) {
    super(data.message);
    this.data = data;
    this.name = 'AppError';
  }
}

class ErrorService {
  private static instance: ErrorService;

  private constructor() {}

  public static getInstance(): ErrorService {
    if (!ErrorService.instance) {
      ErrorService.instance = new ErrorService();
    }
    return ErrorService.instance;
  }

  public async wrapAsync<T>(fn: () => Promise<T>, context?: string): Promise<T | null> {
    try {
      return await fn();
    } catch (error) {
      this.handle(error, context);
      return null;
    }
  }

  private lastAlertTime: number = 0;
  private lastAlertMessage: string = '';

  public handle(error: any, context?: string) {
    console.group(`[ErrorService] ${context || 'General Error'}`);
    console.error(error);
    
    let displayMessage = "Ocurrió un error inesperado.";
    let recommendation = "Reintenta la operación o recarga la página.";
    let category = ErrorCategory.UNKNOWN;
    let title = "Error de Sistema";
    let stack = '';
    let technical = error?.message || String(error);

    if (error instanceof Error) {
      stack = error.stack || '';
      technical = `${error.name}: ${error.message}`;
    }

    // Handle string errors
    if (typeof error === 'string') {
      displayMessage = error;
    } 
    // Handle AppError
    else if (error instanceof AppError) {
      displayMessage = error.data.message;
      category = error.data.category;
    }
    // Handle Database Errors (Supabase)
    else if (error && (error.code || error.message?.includes('supabase') || error.message?.includes('Postgres'))) {
      const code = error.code;
      technical = `Postgres Error [${code}]: ${error.message}`;
      category = ErrorCategory.DATABASE;
      title = "Error de Datos";
      
      if (code === '42501') { // PostgreSQL Permission Denied
        displayMessage = "No tienes permisos suficientes para esta operación.";
        recommendation = "Verifica tu rol o contacta al administrador.";
      } else if (code === '23505') { // Unique constraint
        displayMessage = "Este registro ya existe (duplicado).";
        recommendation = "Intenta con un identificador diferente.";
      } else {
        displayMessage = error.message || "Error de sincronización con la base de datos.";
      }
    }
    // Handle generic Error objects
    else if (error instanceof Error) {
      const friendly = this.getFriendlyErrorDetails(error);
      displayMessage = friendly.message;
      recommendation = friendly.recommendation;
      title = friendly.title;
      category = this.inferCategory(error);
    }

    // Determine if it's a critical error that needs a Modal vs a Toast
    const isCritical = 
      category === ErrorCategory.DATABASE || 
      category === ErrorCategory.AUTH || 
      displayMessage.toLowerCase().includes('quota') ||
      displayMessage.toLowerCase().includes('permisos') ||
      category === ErrorCategory.AI;

    const now = Date.now();
    const isSameAlert = displayMessage === this.lastAlertMessage && (now - this.lastAlertTime < 10000);

    if (isCritical) {
      if (!isSameAlert) {
        this.triggerSystemAlert({ title, message: displayMessage, recommendation, category, technical });
        this.lastAlertTime = now;
        this.lastAlertMessage = displayMessage;
      }
    } else {
      notify(`${title}: ${displayMessage}`, 'error');
    }

    console.groupEnd();
    
    // Log to Supabase for admin diagnostics
    if (!displayMessage.toLowerCase().includes('quota') && !technical.toLowerCase().includes('resource-exhausted')) {
      this.reportError({
        message: displayMessage,
        category,
        context,
        technical,
        stack
      });
    }

    return { displayMessage, category, recommendation, title };
  }

  private async reportError(data: any) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('system_errors').insert({
          message: data.message,
          category: data.category,
          context: data.context || '',
          technical: data.technical || '',
          stack: data.stack || '',
          user_id: user.id,
          url: window.location.href,
          resolved: false,
          severity: data.category === ErrorCategory.DATABASE ? 'HIGH' : 'LOW'
        });
      }
    } catch (e) {
      console.warn('Could not report error to Supabase:', e);
    }
  }

  private triggerSystemAlert(details: any) {
    window.dispatchEvent(new CustomEvent('system-alert', { detail: details }));
  }

  private isFirestoreError(message: string): boolean {
    return message.includes('"operationType"') && message.includes('"authInfo"');
  }

  private getFriendlyFirestoreDetails(info: FirestoreErrorInfo): { title: string, message: string, recommendation: string } {
    if (info.error.includes('permissions') || info.error.includes('permission-denied')) {
      return {
        title: "Protocolo Denegado",
        message: `No tienes los permisos necesarios para realizar la acción [${this.opName(info.operationType)}] en ${info.path || 'el núcleo'}.`,
        recommendation: "Es probable que tu sesión haya expirado o tu rol haya cambiado. Intenta cerrar sesión y volver a entrar."
      };
    }
    if (info.error.includes('offline')) {
      return {
        title: "Enlace Perdido",
        message: "Se ha perdido la conexión con el núcleo de datos.",
        recommendation: "Revisa tu conexión a internet. Los cambios se sincronizarán automáticamente cuando vuelvas a estar en línea."
      };
    }
    if (info.error.toLowerCase().includes('quota') || info.error.toLowerCase().includes('resource-exhausted')) {
      // Signal quota exhaustion to the app
      sessionStorage.setItem('QUOTA_EXHAUSTED', 'true');
      window.dispatchEvent(new Event('quota_exceeded'));

      return {
        title: "Limite de Procesamiento",
        message: "¡Misión pausada! Hemos alcanzado el límite de operaciones en el servidor.",
        recommendation: "Si tienes plan Blaze, verifica si hay un tope de gasto en Google Cloud. Si eres Spark, has llegado a los 50k de hoy."
      };
    }
    return {
      title: "Error de Datos",
      message: `Error detectado durante la operación ${this.opName(info.operationType)}.`,
      recommendation: "Verifica que los datos ingresados sean correctos e intenta de nuevo."
    };
  }

  private opName(op: OperationType): string {
    const ops: Record<string, string> = {
      [OperationType.CREATE]: 'CREAR',
      [OperationType.UPDATE]: 'ACTUALIZAR',
      [OperationType.DELETE]: 'ELIMINAR',
      [OperationType.LIST]: 'LECTURA',
      [OperationType.GET]: 'RECUPERAR',
      [OperationType.WRITE]: 'ESCRITURA',
    };
    return ops[op] || op;
  }

  private getFriendlyErrorDetails(err: Error): { title: string, message: string, recommendation: string } {
    const msg = err.message.toLowerCase();
    if (msg.includes('network') || msg.includes('fetch')) {
      return {
        title: "Error de Red",
        message: "No se pudo establecer comunicación con el servidor.",
        recommendation: "Verifica tu conexión Wi-Fi o datos móviles y recarga la interfaz."
      };
    }
    if (msg.includes('timeout')) {
      return {
        title: "Tiempo Excedido",
        message: "La respuesta del servidor tardó demasiado en llegar.",
        recommendation: "Intentaremos reconectar automáticamente, o puedes pulsar F5."
      };
    }
    if (msg.includes('user-not-found') || msg.includes('wrong-password')) {
      return {
        title: "Acceso Denegado",
        message: "Las credenciales biométricas no coinciden con nuestros registros.",
        recommendation: "Asegúrate de escribir correctamente tu ID y código de acceso."
      };
    }
    if (msg.includes('ai') || msg.includes('gemini') || msg.includes('429')) {
      const isQuota = msg.includes('quota') || msg.includes('429') || msg.includes('limit') || msg.includes('exhausted');
      return {
        title: isQuota ? "IA Saturada" : "Falla de IA",
        message: isQuota 
          ? "El motor de IA ha alcanzado su límite de peticiones."
          : "El generador de misiones no pudo procesar tu solicitud.",
        recommendation: "Espera unos segundos e intenta de nuevo."
      };
    }
    return {
      title: "Alerta de Sistema",
      message: err.message,
      recommendation: "Si el problema persiste, contacta al soporte técnico con el código de error."
    };
  }

  private inferCategory(err: Error): ErrorCategory {
    const msg = err.message.toLowerCase();
    if (msg.includes('auth') || msg.includes('login')) return ErrorCategory.AUTH;
    if (msg.includes('ai') || msg.includes('gemini') || msg.includes('content received')) return ErrorCategory.AI;
    if (msg.includes('network') || msg.includes('fetch')) return ErrorCategory.NETWORK;
    return ErrorCategory.LOGIC;
  }
}

export const errorService = ErrorService.getInstance();
