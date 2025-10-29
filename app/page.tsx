"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type AudioState = "idle" | "listening" | "error";

const DB_MIN = -60;
const DB_MAX = 0;

function normalizeDb(dbValue: number) {
  if (Number.isNaN(dbValue)) return 0;
  const clamped = Math.max(DB_MIN, Math.min(DB_MAX, dbValue));
  return (clamped - DB_MIN) / (DB_MAX - DB_MIN);
}

export default function Page() {
  const [audioState, setAudioState] = useState<AudioState>("idle");
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [db, setDb] = useState(DB_MIN);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>();
  const streamRef = useRef<MediaStream | null>(null);
  const peakTimeoutRef = useRef<number>();
  const dataArrayRef = useRef<Float32Array | null>(null);

  const resetPeakDecay = useCallback(() => {
    if (peakTimeoutRef.current) {
      window.clearTimeout(peakTimeoutRef.current);
    }
    peakTimeoutRef.current = window.setTimeout(() => {
      setPeak((current) => current * 0.6);
      resetPeakDecay();
    }, 250);
  }, []);

  const cleanup = useCallback(async () => {
    if (rafRef.current !== undefined) {
      cancelAnimationFrame(rafRef.current);
    }
    if (peakTimeoutRef.current) {
      clearTimeout(peakTimeoutRef.current);
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
    }
    if (audioCtxRef.current) {
      await audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    analyserRef.current = null;
    streamRef.current = null;
    dataArrayRef.current = null;
  }, []);

  const handleMeter = useCallback(() => {
    const analyser = analyserRef.current;
    const data = dataArrayRef.current;

    if (!analyser || !data) return;

    analyser.getFloatTimeDomainData(data);
    let sumSquares = 0;
    for (let i = 0; i < data.length; i += 1) {
      const sample = data[i];
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    const decibels = 20 * Math.log10(rms || 0.0000001);
    const normalized = normalizeDb(decibels);

    setLevel(normalized);
    setDb(Math.max(decibels, DB_MIN));
    setPeak((current) => Math.max(current * 0.92, normalized));

    rafRef.current = requestAnimationFrame(handleMeter);
  }, []);

  const startListening = useCallback(async () => {
    try {
      await cleanup();
      setAudioState("listening");
      setErrorMessage(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: false,
          echoCancellation: false,
          autoGainControl: false
        },
        video: false
      });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.smoothingTimeConstant = 0.22;
      analyser.fftSize = 1024;
      analyserRef.current = analyser;
      dataArrayRef.current = new Float32Array(analyser.fftSize);

      source.connect(analyser);
      resetPeakDecay();
      handleMeter();
    } catch (err) {
      console.error(err);
      await cleanup();
      setAudioState("error");
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Unable to access microphone. Please check your permissions."
      );
    }
  }, [cleanup, handleMeter, resetPeakDecay]);

  const stopListening = useCallback(async () => {
    await cleanup();
    setAudioState("idle");
    setLevel(0);
    setPeak(0);
    setDb(DB_MIN);
  }, [cleanup]);

  useEffect(() => {
    return () => {
      cleanup().catch(() => {});
    };
  }, [cleanup]);

  const statusLabel = useMemo(() => {
    switch (audioState) {
      case "listening":
        return "Listening";
      case "error":
        return "Microphone blocked";
      default:
        return "Idle";
    }
  }, [audioState]);

  const statusDotClass = useMemo(() => {
    switch (audioState) {
      case "listening":
        return "status-dot";
      case "error":
        return "status-dot error";
      default:
        return "status-dot idle";
    }
  }, [audioState]);

  const levelPercentage = Math.round(level * 100);
  const peakPercentage = Math.round(peak * 100);
  const needleRotation = useMemo(() => {
    const minAngle = -120;
    const maxAngle = 120;
    return minAngle + (maxAngle - minAngle) * level;
  }, [level]);

  return (
    <main className="app-shell">
      <section className="title">
        <h1>Sound Meter</h1>
        <p>
          Measure the intensity of ambient sound in real time. Enable microphone
          access to visualize levels instantly with a responsive VU meter and dB
          readout.
        </p>
      </section>

      <section className="meter-card">
        <div className="meter-visual">
          <div className="meter-needle">
            <div className="meter-arc" />
            <div
              className="needle"
              style={{ transform: `rotate(${needleRotation}deg)` }}
            />
          </div>

          <div className="meter-bars">
            <label>
              Live Level
              <span>{levelPercentage}%</span>
            </label>
            <div className="bar-track" aria-hidden>
              <div className="bar-fill" style={{ width: `${levelPercentage}%` }} />
            </div>

            <label>
              Peak Hold
              <span>{peakPercentage}%</span>
            </label>
            <div className="bar-track" aria-hidden>
              <div className="bar-fill" style={{ width: `${peakPercentage}%` }} />
            </div>
          </div>
        </div>

        <div className="controls">
          <button
            type="button"
            className="button"
            onClick={startListening}
            disabled={audioState === "listening"}
          >
            Start Meter
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={stopListening}
            disabled={audioState !== "listening"}
          >
            Stop
          </button>
        </div>

        <div className="status-line">
          <span className={statusDotClass} />
          <span>
            {statusLabel} · {Math.round(Math.max(db, DB_MIN))} dBFS
          </span>
        </div>

        {errorMessage ? (
          <p role="alert" style={{ color: "rgb(248 113 113 / 0.9)" }}>
            {errorMessage}
          </p>
        ) : null}
      </section>
    </main>
  );
}
