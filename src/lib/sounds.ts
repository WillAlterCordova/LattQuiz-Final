// Sound utility for UI feedback
// We use simple synth sounds or small base64 assets to avoid external dependencies

const createSynthSound = (frequency: number, type: OscillatorType, duration: number, volume: number = 0.1) => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);

    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
  } catch (e) {
    console.warn('Audio context failed to start:', e);
  }
};

export const playSound = {
  click: () => createSynthSound(800, 'sine', 0.1, 0.05),
  success: () => {
    createSynthSound(600, 'sine', 0.1, 0.05);
    setTimeout(() => createSynthSound(900, 'sine', 0.15, 0.05), 100);
  },
  error: () => {
    createSynthSound(200, 'sawtooth', 0.15, 0.05);
    setTimeout(() => createSynthSound(150, 'sawtooth', 0.2, 0.05), 150);
  },
  hover: () => createSynthSound(1200, 'sine', 0.05, 0.01),
  transition: () => createSynthSound(400, 'sine', 0.3, 0.03),
  delete: () => createSynthSound(100, 'square', 0.2, 0.05),
  warning: () => {
    createSynthSound(300, 'triangle', 0.2, 0.05);
    setTimeout(() => createSynthSound(300, 'triangle', 0.2, 0.05), 250);
  },
  timerTick: () => createSynthSound(1000, 'sine', 0.05, 0.02),
  selection: () => createSynthSound(440, 'triangle', 0.1, 0.05),
  progress: () => {
    createSynthSound(523, 'sine', 0.1, 0.05); // C5
    setTimeout(() => createSynthSound(659, 'sine', 0.1, 0.05), 100); // E5
    setTimeout(() => createSynthSound(784, 'sine', 0.1, 0.05), 200); // G5
  },
  block: () => {
    createSynthSound(80, 'sawtooth', 0.5, 0.1);
    setTimeout(() => createSynthSound(80, 'sawtooth', 0.5, 0.1), 100);
  },
  panelSlide: () => createSynthSound(440, 'sine', 0.4, 0.02),
  powerUp: () => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  },
  notification: () => {
    createSynthSound(880, 'sine', 0.1, 0.05);
    setTimeout(() => createSynthSound(1046, 'sine', 0.2, 0.05), 150);
  }
};

export default playSound;
