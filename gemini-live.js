/**
 * qüem Smart Shop — Asistente de Voz en Tiempo Real con Gemini Live API
 * Optimizado para máxima compatibilidad móvil (iOS Safari, Android Chrome) y Desktop
 */

(() => {
  // --- CONFIGURACIÓN PRINCIPAL ---
  const DEFAULT_CONFIG = {
    apiVersion: 'v1alpha',
    primaryModel: 'models/gemini-2.5-flash-native-audio-latest',
    fallbackModel: 'models/gemini-2.0-flash-exp',
    voice: 'Puck',
    modality: 'AUDIO',
    firstMessage: '¡Hola! Bienvenido a qüem. Soy tu asistente virtual. ¿En qué te puedo ayudar o qué te gustaría conocer sobre nuestras tiendas autónomas?',
    silenceTimeoutMs: 10000, // 10 segundos de inactividad para apagado automático
    micGain: 2.8,
    systemInstruction: `Eres "qüem IA", el asistente de voz inteligente, cálido, conversacional y ultra-ágil de qüem Smart Shop.
Tu misión es mantener una conversación natural, amigable y fluida por voz con las personas que visitan nuestra web.

DIRECTRICES DE CONVERSACIÓN NATURAL:
1. Sé conversacional, empático y directo:
   - NO repitas "Hola" ni vuelvas a saludar en cada turno si ya diste la bienvenida inicial. Responde de forma directa, natural y continuada.
   - Si el usuario te dice su nombre (ej: "Mi nombre es Eduardo", "Soy Carlos", etc.), acéptalo con calidez y una sonrisa en la voz: "¡Mucho gusto, Eduardo! ¿Qué te gustaría saber sobre qüem?".
   - Si el usuario se toma su tiempo para responder o hace pausas entre preguntas, mantén la calma y escucha con atención.
2. Respuestas ágiles y breves:
   - Responde siempre en 1 a 2 oraciones directas, claras y fáciles de escuchar.
   - Evita discursos largos o monólogos.

CONOCIMIENTO DE QÜEM SMART SHOP:
- ¿Qué es?: La red de tiendas inteligentes 100% autónomas que funcionan 24/7 (todo el año), sin empleados ni filas.
- Dónde se instalan: Edificios residenciales, condominios, countries, barrios cerrados y empresas/oficinas.
- Proceso de compra (4 pasos):
  1. Entrás: Abrís la puerta desde la app qüem en tu celular.
  2. Escaneás: Recorrés y escaneás los códigos de los productos con la app.
  3. Pagás: Acepta todos los medios digitales vía Mercado Pago (débito, crédito, transferencias) Y además ¡qüem es la ÚNICA tienda inteligente del mercado con sistema de cobro en EFECTIVO 100% autónomo con billetes!
  4. Salís: Sin filas ni esperas.
- Propuesta de valor: Comodidad total al lado de tu puerta (congelados, snacks, bebidas, café, artículos esenciales). Cero costo y cero mantenimiento para el consorcio; qüem se encarga de la reposición.

DERIVACIÓN COMERCIAL (FORMULARIO WEB):
- Si el usuario manifiesta interés en instalar una tienda en su edificio, barrio, condominio o empresa:
  * ¡IMPORTANTE!: NO le pidas que te dicte sus datos personales por voz (teléfono, email, dirección).
  * Indícale amablemente que al pie de esta misma página web encontrará el formulario de contacto para completarlo y que un asesor comercial de qüem se comunicará a la brevedad.

Tono: Español rioplatense/latino natural, profesional, moderno y muy agradable.`
  };

  const STORAGE_KEY = 'GEMINI_LIVE_API_KEY';
  let cachedApiKey = null;

  // --- ESTADO GLOBAL ---
  let isConnected = false;
  let isConnecting = false;
  let isModelSpeaking = false;
  let ws = null;
  let silenceTimer = null;
  let currentAttemptModel = null;
  let hasTriedFallback = false;

  // Web Audio Contexts
  let inputAudioContext = null;
  let mediaStream = null;
  let audioProcessor = null;
  let inputSource = null;

  let outputAudioContext = null;
  let outputGainNode = null;
  let nextAudioStartTime = 0;
  let activeSources = [];

  // Elemento DOM
  let heroBadge = null;

  // --- PRE-CARGA Y OBTENCIÓN DE API KEY ---
  async function preloadApiKey() {
    if (cachedApiKey) return cachedApiKey;

    const storedKey = localStorage.getItem(STORAGE_KEY) || window.GEMINI_API_KEY;
    if (storedKey) {
      cachedApiKey = storedKey;
      return cachedApiKey;
    }

    try {
      const res = await fetch('/api/get-key');
      if (res.ok) {
        const data = await res.json();
        if (data.apiKey) {
          cachedApiKey = data.apiKey;
          return cachedApiKey;
        }
      }
    } catch (e) {
      console.warn('[qüem Live] Error precargando API Key:', e);
    }
    return '';
  }

  function getApiKey() {
    return cachedApiKey || localStorage.getItem(STORAGE_KEY) || window.GEMINI_API_KEY || '';
  }

  function setApiKey(key) {
    cachedApiKey = key.trim();
    localStorage.setItem(STORAGE_KEY, cachedApiKey);
  }

  // --- DESBLOQUEO DE AUDIO PARA MÓVILES (iOS / Android) ---
  function unlockAudioContexts() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!outputAudioContext || outputAudioContext.state === 'closed') {
      // Dejar que el navegador elija la frecuencia nativa de hardware para evitar NotSupportedError en iOS
      outputAudioContext = new AudioCtx();
      outputGainNode = outputAudioContext.createGain();
      outputGainNode.gain.value = 1.0;
      outputGainNode.connect(outputAudioContext.destination);
    }

    if (outputAudioContext.state === 'suspended') {
      outputAudioContext.resume();
    }

    // Reproducir micro-buffer de silencio para garantizar desbloqueo en WebKit
    try {
      const buffer = outputAudioContext.createBuffer(1, 1, 22050);
      const source = outputAudioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(outputAudioContext.destination);
      source.start(0);
    } catch (e) {}

    nextAudioStartTime = 0;
    activeSources = [];
  }

  // --- HELPERS DE AUDIO PCM ---
  function floatTo16BitPCM(float32Array, gain = DEFAULT_CONFIG.micGain) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      let s = Math.max(-1, Math.min(1, float32Array[i] * gain));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Uint8Array(buffer);
  }

  function downsampleBuffer(buffer, inputSampleRate, targetRate = 16000) {
    if (inputSampleRate === targetRate) return buffer;
    const ratio = inputSampleRate / targetRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  function uint8ArrayToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  function base64ToFloat32Array(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const dataView = new DataView(bytes.buffer);
    const numSamples = Math.floor(bytes.byteLength / 2);
    const float32 = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      const int16 = dataView.getInt16(i * 2, true);
      float32[i] = int16 < 0 ? int16 / 32768 : int16 / 32767;
    }
    return float32;
  }

  // --- TEMPORIZADOR DE SILENCIO (10s) ---
  function resetSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (isConnected) {
      silenceTimer = setTimeout(() => {
        console.log('[qüem Live] Desconexión por 10 segundos de inactividad.');
        disconnect();
      }, DEFAULT_CONFIG.silenceTimeoutMs);
    }
  }

  function clearSilenceTimer() {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  // --- REPRODUCCIÓN Y DETENCIÓN DE AUDIO ---
  function stopAllAudioPlayback() {
    if (activeSources.length > 0) {
      for (const source of activeSources) {
        try {
          source.stop();
          source.disconnect();
        } catch (e) {}
      }
      activeSources = [];
    }
    if (outputAudioContext) {
      nextAudioStartTime = outputAudioContext.currentTime;
    }
    updateSpeakingState(false);
  }

  function playAudioChunk(float32Data) {
    if (!outputAudioContext) return;

    if (outputAudioContext.state === 'suspended') {
      outputAudioContext.resume();
    }

    // Web Audio resamplea nativamente a la frecuencia del hardware móvil (44.1k/48k)
    const buffer = outputAudioContext.createBuffer(1, float32Data.length, 24000);
    buffer.getChannelData(0).set(float32Data);

    const source = outputAudioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(outputGainNode);

    const now = outputAudioContext.currentTime;
    if (nextAudioStartTime < now) {
      nextAudioStartTime = now + 0.015;
    }

    source.start(nextAudioStartTime);
    nextAudioStartTime += buffer.duration;
    activeSources.push(source);

    updateSpeakingState(true);
    clearSilenceTimer();

    source.onended = () => {
      const idx = activeSources.indexOf(source);
      if (idx !== -1) activeSources.splice(idx, 1);

      if (activeSources.length === 0 && isConnected) {
        nextAudioStartTime = outputAudioContext ? outputAudioContext.currentTime : 0;
        updateSpeakingState(false);
        resetSilenceTimer();
      }
    };
  }

  // --- ESTADOS VISUALES DEL LOGO 'ü' ---
  function updateSpeakingState(speaking) {
    isModelSpeaking = speaking;
    if (heroBadge) {
      if (speaking) {
        heroBadge.classList.add('gemini-speaking');
        heroBadge.classList.remove('gemini-listening');
      } else if (isConnected) {
        heroBadge.classList.remove('gemini-speaking');
        heroBadge.classList.add('gemini-listening');
      }
    }
  }

  function updateCallState(active) {
    isConnected = active;
    isConnecting = false;

    if (heroBadge) {
      if (active) {
        heroBadge.classList.add('vapi-active', 'gemini-active', 'gemini-listening');
        heroBadge.title = 'qüem IA activa • Toca para cortar';
      } else {
        heroBadge.classList.remove('vapi-active', 'gemini-active', 'gemini-speaking', 'gemini-listening');
        heroBadge.title = 'Toca la ü para hablar con el Asistente IA de qüem';
      }
    }
  }

  // --- CAPTURA DE AUDIO DEL MICRÓFONO CON COMPATIBILIDAD MÓVIL ---
  async function startAudioInput() {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
    } catch (err) {
      // Fallback para navegadores móviles con restricciones de constraints
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    inputAudioContext = new AudioCtx();
    if (inputAudioContext.state === 'suspended') {
      await inputAudioContext.resume();
    }

    inputSource = inputAudioContext.createMediaStreamSource(mediaStream);

    const bufferSize = 2048;
    audioProcessor = inputAudioContext.createScriptProcessor(bufferSize, 1, 1);

    audioProcessor.onaudioprocess = (e) => {
      if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) return;

      if (isModelSpeaking && activeSources.length > 0) {
        return;
      }

      const inputData = e.inputBuffer.getChannelData(0);

      let hasSound = false;
      for (let i = 0; i < inputData.length; i += 16) {
        if (Math.abs(inputData[i]) > 0.02) {
          hasSound = true;
          break;
        }
      }
      if (hasSound) {
        resetSilenceTimer();
      }

      const downsampled = downsampleBuffer(inputData, inputAudioContext.sampleRate, 16000);
      const pcm16 = floatTo16BitPCM(downsampled, DEFAULT_CONFIG.micGain);
      const base64Data = uint8ArrayToBase64(pcm16);

      const audioMessage = {
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: 'audio/pcm;rate=16000',
              data: base64Data
            }
          ]
        }
      };

      ws.send(JSON.stringify(audioMessage));
    };

    inputSource.connect(audioProcessor);
    audioProcessor.connect(inputAudioContext.destination);
  }

  // --- CONEXIÓN PRINCIPAL GEMINI LIVE ---
  async function connect(targetModel = null) {
    if (isConnecting || isConnected) return;

    // Desbloquear AudioContext en el hilo síncrono del evento del usuario
    unlockAudioContexts();

    isConnecting = true;
    currentAttemptModel = targetModel || DEFAULT_CONFIG.primaryModel;

    if (heroBadge) heroBadge.classList.add('gemini-active');

    try {
      let apiKey = getApiKey();
      if (!apiKey) {
        apiKey = await preloadApiKey();
      }

      if (!apiKey) {
        console.error('[qüem Live] GEMINI_API_KEY no configurada.');
        disconnect();
        return;
      }

      await startAudioInput();

      const version = DEFAULT_CONFIG.apiVersion;
      const voice = DEFAULT_CONFIG.voice;
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${version}.GenerativeService.BidiGenerateContent?key=${apiKey}`;

      ws = new WebSocket(wsUrl);

      let handshakeDone = false;

      ws.onopen = () => {
        const setupMessage = {
          setup: {
            model: currentAttemptModel,
            generationConfig: {
              responseModalities: [DEFAULT_CONFIG.modality],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: voice
                  }
                }
              }
            },
            systemInstruction: {
              parts: [{ text: DEFAULT_CONFIG.systemInstruction }]
            }
          }
        };

        ws.send(JSON.stringify(setupMessage));
      };

      ws.onmessage = async (event) => {
        try {
          let textData = event.data;
          if (event.data instanceof Blob) {
            textData = await event.data.text();
          }
          const response = JSON.parse(textData);

          if (response.setupComplete) {
            handshakeDone = true;
            hasTriedFallback = false;
            updateCallState(true);
            resetSilenceTimer();

            if (DEFAULT_CONFIG.firstMessage) {
              const triggerMsg = {
                clientContent: {
                  turns: [
                    {
                      role: "user",
                      parts: [
                        { text: `Por favor saluda al usuario diciendo exactamente: "${DEFAULT_CONFIG.firstMessage}"` }
                      ]
                    }
                  ],
                  turnComplete: true
                }
              };
              ws.send(JSON.stringify(triggerMsg));
            }
            return;
          }

          if (response.serverContent) {
            const { modelTurn, turnComplete, interrupted } = response.serverContent;

            if (interrupted) {
              stopAllAudioPlayback();
            }

            if (modelTurn && modelTurn.parts) {
              for (const part of modelTurn.parts) {
                if (part.inlineData && part.inlineData.data) {
                  const float32Data = base64ToFloat32Array(part.inlineData.data);
                  playAudioChunk(float32Data);
                }
              }
            }

            if (turnComplete) {
              setTimeout(() => {
                if (activeSources.length === 0 && isConnected) {
                  nextAudioStartTime = outputAudioContext ? outputAudioContext.currentTime : 0;
                  updateSpeakingState(false);
                  resetSilenceTimer();
                }
              }, 60);
            }
          }
        } catch (err) {
          console.error('[qüem Live] Error procesando mensaje:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('[qüem Live] Error en WebSocket:', err);
      };

      ws.onclose = (event) => {
        if (!handshakeDone && !hasTriedFallback) {
          hasTriedFallback = true;
          const fallback = (currentAttemptModel === DEFAULT_CONFIG.primaryModel) 
            ? DEFAULT_CONFIG.fallbackModel 
            : DEFAULT_CONFIG.primaryModel;

          cleanupResources();
          setTimeout(() => {
            isConnecting = false;
            connect(fallback);
          }, 300);
          return;
        }

        disconnect();
      };

    } catch (err) {
      console.error('[qüem Live] Error al inicializar:', err);
      disconnect();
    }
  }

  function cleanupResources() {
    stopAllAudioPlayback();
    clearSilenceTimer();

    if (ws) {
      try { ws.close(); } catch (e) {}
      ws = null;
    }

    if (audioProcessor) {
      try { audioProcessor.disconnect(); } catch (e) {}
      audioProcessor = null;
    }

    if (inputSource) {
      try { inputSource.disconnect(); } catch (e) {}
      inputSource = null;
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }

    if (inputAudioContext && inputAudioContext.state !== 'closed') {
      try { inputAudioContext.close(); } catch (e) {}
      inputAudioContext = null;
    }

    if (outputAudioContext && outputAudioContext.state !== 'closed') {
      try { outputAudioContext.close(); } catch (e) {}
      outputAudioContext = null;
    }
  }

  function disconnect() {
    cleanupResources();
    updateCallState(false);
  }

  // --- INICIALIZACIÓN ---
  window.addEventListener('DOMContentLoaded', () => {
    preloadApiKey();

    heroBadge = document.querySelector('.hero-live-badge');

    if (heroBadge) {
      heroBadge.title = 'Toca la ü para hablar con el Asistente IA de qüem';

      const handleUserTap = (e) => {
        e.preventDefault();
        // Desbloquear audio context en el instante del toque táctil / clic
        unlockAudioContexts();

        if (isConnected || isConnecting) {
          disconnect();
        } else {
          connect();
        }
      };

      heroBadge.addEventListener('click', handleUserTap);
    }
  });

  window.QuemGeminiLive = {
    connect,
    disconnect,
    setApiKey,
    getApiKey
  };
})();
