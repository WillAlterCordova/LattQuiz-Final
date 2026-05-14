import { notify } from '../components/NeonNotification';
import { OperationType, FirestoreErrorInfo } from '../types/errors';
import { db, auth } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

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
    // Handle Firestore Errors (JSON string or raw objects)
    else if (error && (this.isFirestoreError(error.message) || (error.code && typeof error.code === 'string' && error.code.includes('/')))) {
      try {
        let info: FirestoreErrorInfo;
        if (this.isFirestoreError(error.message)) {
          info = JSON.parse(error.message) as FirestoreErrorInfo;
        } else {
          // Map raw firebase error to our info structure
          info = {
            error: error.message || error.code || 'Unknown Firestore Error',
            operationType: OperationType.WRITE, // Default to write if unknown
            path: null,
            authInfo: {}
          };
        }
        const details = this.getFriendlyFirestoreDetails(info);
        displayMessage = details.message;
        recommendation = details.recommendation;
        title = details.title;
        category = ErrorCategory.DATABASE;
        technical = `Firestore [${info.operationType}] ${info.path || ''}: ${info.error}`;
      } catch {
        displayMessage = "Error de sincronización con la base de datos.";
        title = "Error de Datos";
      }
    }
    // Handle raw Firebase Auth Errors / Other SDK errors with 'code'
    else if (error && error.code && typeof error.code === 'string') {
      const code = error.code;
      technical = `SDK Code: ${code} | Msg: ${error.message || 'N/A'}`;
      if (code.startsWith('auth/')) {
        title = "Error de Autenticación";
        category = ErrorCategory.AUTH;
        if (code === 'auth/network-request-failed') {
          displayMessage = "Fallo de conexión en la autenticación.";
          recommendation = "Revisa tu internet e intenta loguear de nuevo.";
        } else if (code === 'auth/user-disabled') {
          displayMessage = "Tu cuenta ha sido desactivada.";
          recommendation = "Contacta con el administrador del sistema.";
        } else {
          displayMessage = `Intento de acceso rechazado (${code}).`;
          recommendation = "Verifica tus credenciales e intenta de nuevo.";
        }
      } else if (code === 'permission-denied') {
        title = "Acceso Denegado";
        displayMessage = "No tienes permisos suficientes para esta operación.";
        recommendation = "Si crees que es un error, intenta cerrar sesión y volver a entrar.";
        category = ErrorCategory.DATABASE;
      } else if (code === 'resource-exhausted') {
        title = "Operación Detenida por Cuota";
        displayMessage = "Se ha alcanzado el límite de procesamiento permitido en Google Cloud.";
        recommendation = `Para usuarios en PLAN BLAZE:\n` +
                         `⚠️ El culpable suele ser un "TOPE DE PRESUPUESTO" (Spending Limit) en Google Billing.\n` +
                         `1. Ve a console.cloud.google.com -> Billing -> Budgets & alerts.\n` +
                         `2. Revisa si tienes un tope mensual que se ha alcanzado.\n\n` +
                         `Para usuarios en PLAN SPARK (Gratis):\n` +
                         `Has superado las 50,000 lecturas diarias gratuitas. El sistema volverá a la normalidad mañana a las 00:00 (PST).`;
        category = ErrorCategory.QUOTA;
        
        // Signal quota exhaustion to the app
        sessionStorage.setItem('QUOTA_EXHAUSTED', 'true');
        window.dispatchEvent(new Event('quota_exceeded'));
      } else {
        displayMessage = error.message || code;
        category = ErrorCategory.UNKNOWN;
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
    
    // Log to firestore for admin diagnostics
    // CRITICAL: Skip if it is a quota error to save writes and avoid infinite loops
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
      if (auth.currentUser) {
        await addDoc(collection(db, 'system_errors'), {
          ...data,
          userId: auth.currentUser?.uid,
          timestamp: Date.now(),
          url: window.location.href,
          resolved: false,
          severity: data.category === ErrorCategory.DATABASE ? 'HIGH' : 'LOW'
        });
      }
    } catch (e) {
      console.warn('Could not report error to firestore:', e);
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
          ? "El motor de IA (Gemini 1.5 Flash) ha alcanzado su límite de peticiones por minuto."
          : "El generador de misiones no pudo procesar tu solicitud.",
        recommendation: isQuota
          ? `Verifica en Google Cloud [Proyecto: ${firebaseConfig.projectId}] que la cuota de 'Generative Language API' (Gemini 1.5 Flash) esté por encima de 15 RPM. Si ya es 400, espera 15 segundos.`
          : "Prueba con un prompt diferente o reduce la complejidad de la misión."
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
