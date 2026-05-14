import { useEffect } from 'react';
import { useAuthStore } from '../store/auth';
import { notify } from './NeonNotification';
import playSound from '../lib/sounds';
import { supabase } from '../lib/supabase';

export function SystemAlertListener() {
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) return;

    // Suscribirse a cambios en tiempo real en la tabla system_alerts
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
          const newAlert = payload.new;

          // Lógica de filtrado: Global, por Usuario o por Grupo
          const isTargeted = 
            newAlert.target_type === 'GLOBAL' || 
            (newAlert.target_type === 'USER' && newAlert.target_id === user.id) ||
            (newAlert.target_type === 'GROUP' && user.groupIds?.includes(newAlert.target_id));

          if (isTargeted) {
            notify(newAlert.message, 'warning');
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
