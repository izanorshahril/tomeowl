const CUE_SECONDS = 0.07;
const PEAK_GAIN = 0.018;

export function createSelectionSound() {
  let context: AudioContext | undefined;
  let enabled = false;

  const setEnabled = (next: boolean) => {
    if (next && !context) {
      try { context = new AudioContext(); }
      catch { return false; }
    }
    enabled = next;
    if (enabled && context.state === "suspended") void context.resume().catch(() => {});
    return enabled;
  };

  const play = () => {
    if (!enabled || !context || context.state !== "running") return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, now);
    oscillator.frequency.exponentialRampToValueAtTime(480, now + CUE_SECONDS);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + CUE_SECONDS);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.addEventListener("ended", () => { oscillator.disconnect(); gain.disconnect(); }, { once: true });
    oscillator.start(now); oscillator.stop(now + CUE_SECONDS);
  };

  return { setEnabled, play, isEnabled: () => enabled };
}
