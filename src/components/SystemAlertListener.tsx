import { useEffect } from 'react';
import { useAuthStore } from '../store/auth';
import { notify } from './NeonNotification';
import playSound from '../lib/sounds';
import { supabase } from '../lib/supabase'; // Asegúrate de que este archivo exista

export function SystemAlertListener() {
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) return;

    // Configuración de Realtime para Supabase
    const channel = supabase
      .channel('system_alerts_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'system_alerts',
        },
        (payload) => {
          const alert = payload.new;
          // Ajusta target_type y target_id según tus columnas en Supabase
          const isTargeted = 
            alert.target_type === 'GLOBAL' || 
            (alert.target_type === 'USER' && alert.target_id === user.id);

          if (isTargeted) {
            notify(alert.message, 'warning');
            playSound.notification();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return null;
}
