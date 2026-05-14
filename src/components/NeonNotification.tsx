import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Info, AlertTriangle, CheckCircle, XCircle, X } from 'lucide-react';
import playSound from '../lib/sounds';

export type NotificationType = 'info' | 'warning' | 'success' | 'error';

interface NotificationProps {
  id: string;
  type: NotificationType;
  message: string;
  onClose: (id: string) => void;
}

const icons = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle,
  error: XCircle
};

const colors = {
  info: 'border-neon-blue bg-neon-blue/10 text-neon-blue shadow-[0_0_15px_rgba(0,243,255,0.2)]',
  warning: 'border-yellow-500 bg-yellow-500/10 text-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.2)]',
  success: 'border-emerald-500 bg-emerald-500/10 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]',
  error: 'border-red-500 bg-red-500/10 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
};

export const NeonNotification = ({ id, type, message, onClose }: NotificationProps) => {
  useEffect(() => {
    // Play appropriate sound
    if (type === 'success') playSound.success();
    else if (type === 'error') playSound.error();
    else if (type === 'warning') playSound.warning();
    else playSound.click();

    const timer = setTimeout(() => onClose(id), 5000);
    return () => clearTimeout(timer);
  }, [id, type, onClose]);

  const Icon = icons[type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 50, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
      className={`relative flex items-center gap-3 px-6 py-4 rounded-xl border-2 backdrop-blur-2xl ${colors[type]} min-w-[300px] mb-4 group`}
    >
      <Icon className="w-6 h-6 flex-shrink-0" />
      <p className="text-xs font-black uppercase italic tracking-tighter flex-1">{message}</p>
      <button 
        onClick={() => onClose(id)}
        className="p-1 hover:bg-white/10 rounded-full transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="absolute bottom-0 left-0 h-1 bg-current opacity-20 animate-notification-progress" style={{ animationDuration: '5000ms' }} />
    </motion.div>
  );
};

export const NotificationContainer = () => {
  const [notifications, setNotifications] = useState<{ id: string; type: NotificationType; message: string }[]>([]);

  useEffect(() => {
    const handleNotify = (event: CustomEvent) => {
      setNotifications(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), ...event.detail }]);
    };

    window.addEventListener('neon-notify' as any, handleNotify);
    return () => window.removeEventListener('neon-notify' as any, handleNotify);
  }, []);

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="fixed bottom-8 right-8 z-[100] pointer-events-none flex flex-col items-end">
      <AnimatePresence>
        {notifications.map(n => (
          <div key={n.id} className="pointer-events-auto">
            <NeonNotification {...n} onClose={removeNotification} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export const notify = (message: string, type: NotificationType = 'info') => {
  window.dispatchEvent(new CustomEvent('neon-notify', { detail: { message, type } }));
};
