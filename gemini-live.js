/**
 * qüem Smart Shop — Asistente de Voz en Tiempo Real con Gemini Live API
 * v2.0 — Optimizado para máxima compatibilidad móvil (iOS Safari, Android Chrome/Brave) y Desktop
 * 
 * Cambios clave vs v1:
 *  - AudioWorklet como mecanismo primario de captura de audio (reemplaza ScriptProcessorNode deprecado)
 *  - Fallback automático a ScriptProcessorNode si AudioWorklet no está disponible
 *  - Manejo robusto de errores con feedback visual en el badge
 *  - Compatible con Android Chrome, Brave, Samsung Internet, iOS Safari, Firefox y Desktop
 */

(() => {
  // --- CONFIGURACIÓN PRINCIPAL ---
  const DEFAULT_CONFIG = {
    apiVersion: 'v1alpha',
    primaryModel: 'models/gemini-2.0-flash-exp',
    fallbackModel: 'models/gemini-2.5-flash-native-audio-latest',
    voice: 'Puck',
    modality: 'AUDIO',
    firstMessage: '¡Hola! Bienvenido a qüem. ¿En qué te puedo ayudar hoy sobre nuestras tiendas inteligentes?',
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
- Requisitos del espacio para instalar una tienda:
  * Superficie mínima: 16 metros cuadrados (16 m²).
  * Altura de techo: 2,40 metros como mínimo.
  * Aberturas y accesos: puerta de acceso y, preferentemente, ventana o ventanal si es posible.
- Próxima inauguración: A fines de septiembre y principios de octubre se inaugura una nueva tienda autónoma en el barrio cerrado María Eugenia Village, en Moreno (Buenos Aires). Si te preguntan por novedades o aperturas, menciónalo con entusiasmo.

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
  let audioProcessor = null; // ScriptProcessorNode (fallback)
  let audioWorkletNode = null; // AudioWorkletNode (primary)
  let inputSource = null;

  let outputAudioContext = null;
  let outputGainNode = null;
  let nextAudioStartTime = 0;
  let activeSources = [];

  // Elementos DOM
  let heroBadge = null;
  let heroStatusPill = null;

  // Detect mobile
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isAndroid = /Android/i.test(navigator.userAgent);

  // --- LOGGING ---
  function log(...args) {
    console.log('[qüem Live]', ...args);
  }
  function warn(...args) {
    console.warn('[qüem Live]', ...args);
  }
  function error(...args) {
    console.error('[qüem Live]', ...args);
  }

  // --- PRE-CARGA Y OBTENCIÓN DE API KEY ---
  async function preloadApiKey() {
    if (cachedApiKey) return cachedApiKey;

    // 1. Verificar localStorage primero
    const storedKey = localStorage.getItem(STORAGE_KEY);
    if (storedKey) {
      cachedApiKey = storedKey;
      log('API Key cargada desde localStorage');
      return cachedApiKey;
    }

    // 2. Variable global
    if (window.GEMINI_API_KEY) {
      cachedApiKey = window.GEMINI_API_KEY;
      log('API Key cargada desde variable global');
      return cachedApiKey;
    }

    // 3. Fetch desde servidor Vercel (/api/get-key)
    try {
      const res = await fetch('/api/get-key');
      if (res.ok) {
        const data = await res.json();
        if (data.apiKey) {
          cachedApiKey = data.apiKey;
          localStorage.setItem(STORAGE_KEY, cachedApiKey); // Cache local para próximas sesiones
          log('API Key obtenida desde servidor y cacheada');
          return cachedApiKey;
        }
      }
    } catch (e) {
      warn('Error obteniendo API Key desde /api/get-key:', e.message);
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
      outputAudioContext.resume().catch(() => {});
    }

    // Reproducir micro-buffer de silencio para garantizar desbloqueo en WebKit y Android
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

  // --- FEEDBACK ACÚSTICO INSTANTÁNEO (<10ms) ---
  function playEarcon(type = 'activate') {
    try {
      const ctx = outputAudioContext;
      if (!ctx || ctx.state === 'closed') return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === 'activate') {
        // Tono ascendente nítido y moderno (Do5 -> La5)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(outputGainNode || ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'ready') {
        // Doble campana suave indicando conexión establecida
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now);
        osc.frequency.setValueAtTime(987.77, now + 0.06);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(gain);
        gain.connect(outputGainNode || ctx.destination);
        osc.start(now);
        osc.stop(now + 0.17);
      } else if (type === 'disconnect') {
        // Tono descendente suave (Sol5 -> Sol4)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(784, now);
        osc.frequency.exponentialRampToValueAtTime(392, now + 0.09);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(outputGainNode || ctx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
      }
    } catch (_) {}
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
        log('Desconexión por 10 segundos de inactividad.');
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
      outputAudioContext.resume().catch(() => {});
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

  // --- ESTADOS VISUALES DEL LOGO 'ü' Y PILL INTERACTIVO ---
  function updateStatusPill(text, className = '') {
    if (!heroStatusPill) return;
    const textEl = heroStatusPill.querySelector('.status-text');
    if (textEl) textEl.textContent = text;
    heroStatusPill.className = 'hero-live-status-pill' + (className ? ' ' + className : '');
  }

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
    if (speaking) {
      updateStatusPill('qüem IA hablando...', 'speaking');
    } else if (isConnected) {
      updateStatusPill('Te escucho... hablá', 'listening');
    }
  }

  function updateCallState(active) {
    isConnected = active;
    isConnecting = false;

    if (heroBadge) {
      if (active) {
        heroBadge.classList.add('vapi-active', 'gemini-active', 'gemini-listening');
        heroBadge.classList.remove('gemini-error');
        heroBadge.title = 'qüem IA activa • Toca para cortar';
      } else {
        heroBadge.classList.remove('vapi-active', 'gemini-active', 'gemini-speaking', 'gemini-listening', 'gemini-error');
        heroBadge.title = 'Toca la ü para hablar con el Asistente IA de qüem';
      }
    }

    if (!active) {
      updateStatusPill('Hablá con nuestra IA', '');
    }
  }

  function showErrorState(msg) {
    error(msg);
    isConnecting = false;
    updateStatusPill('Error al conectar', 'error');
    if (heroBadge) {
      heroBadge.classList.remove('gemini-active', 'gemini-speaking', 'gemini-listening');
      heroBadge.classList.add('gemini-error');
      heroBadge.title = msg;
      setTimeout(() => {
        if (heroBadge) heroBadge.classList.remove('gemini-error');
        updateStatusPill('Hablá con nuestra IA', '');
      }, 3000);
    }
  }

  // --- PROCESAMIENTO DE AUDIO DEL MICRÓFONO ---
  function processAudioData(float32Input, sampleRate) {
    if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) return;

    // Si el modelo está hablando, silenciar mic para evitar eco
    if (isModelSpeaking && activeSources.length > 0) return;

    // Detectar sonido real
    let hasSound = false;
    for (let i = 0; i < float32Input.length; i += 16) {
      if (Math.abs(float32Input[i]) > 0.02) {
        hasSound = true;
        break;
      }
    }
    if (hasSound) {
      resetSilenceTimer();
    }

    const downsampled = downsampleBuffer(float32Input, sampleRate, 16000);
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

    try {
      ws.send(JSON.stringify(audioMessage));
    } catch (e) {
      warn('Error enviando audio:', e.message);
    }
  }

  // --- AUDIO WORKLET PROCESSOR (inline como Blob URL) ---
  function createWorkletProcessorBlob() {
    const processorCode = `
      class QuemAudioProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this._bufferSize = 2048;
          this._buffer = new Float32Array(this._bufferSize);
          this._bytesWritten = 0;
        }

        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (!input || !input[0]) return true;

          const channelData = input[0];

          for (let i = 0; i < channelData.length; i++) {
            this._buffer[this._bytesWritten++] = channelData[i];
            if (this._bytesWritten >= this._bufferSize) {
              // Enviar buffer completo al hilo principal
              this.port.postMessage({
                audioData: this._buffer.slice(0)
              });
              this._bytesWritten = 0;
            }
          }

          return true;
        }
      }

      registerProcessor('quem-audio-processor', QuemAudioProcessor);
    `;
    const blob = new Blob([processorCode], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
  }

  // --- CAPTURA DE AUDIO DEL MICRÓFONO CON COMPATIBILIDAD MÓVIL ---
  async function startAudioInput() {
    // 1. Obtener micrófono
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // En Android, constraints más relajados son más confiables
          ...(isAndroid ? {} : { noiseSuppression: false, autoGainControl: false })
        }
      });
      log('Micrófono obtenido con constraints avanzados');
    } catch (err) {
      warn('Fallback a constraints básicos de audio:', err.message);
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        log('Micrófono obtenido con constraints básicos');
      } catch (err2) {
        throw new Error('No se pudo acceder al micrófono. Verifica los permisos del navegador.');
      }
    }

    // 2. Crear AudioContext para entrada
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    inputAudioContext = new AudioCtx();
    if (inputAudioContext.state === 'suspended') {
      await inputAudioContext.resume();
    }
    log('InputAudioContext creado, sampleRate:', inputAudioContext.sampleRate, 'state:', inputAudioContext.state);

    inputSource = inputAudioContext.createMediaStreamSource(mediaStream);

    // 3. Intentar AudioWorklet primero (funciona correctamente en Android Chrome moderno)
    let workletSuccess = false;

    if (inputAudioContext.audioWorklet && typeof inputAudioContext.audioWorklet.addModule === 'function') {
      try {
        const workletUrl = createWorkletProcessorBlob();
        await inputAudioContext.audioWorklet.addModule(workletUrl);
        URL.revokeObjectURL(workletUrl);

        audioWorkletNode = new AudioWorkletNode(inputAudioContext, 'quem-audio-processor');
        audioWorkletNode.port.onmessage = (event) => {
          if (event.data && event.data.audioData) {
            processAudioData(event.data.audioData, inputAudioContext.sampleRate);
          }
        };

        inputSource.connect(audioWorkletNode);
        audioWorkletNode.connect(inputAudioContext.destination);

        workletSuccess = true;
        log('✅ AudioWorklet activo (método moderno)');
      } catch (e) {
        warn('AudioWorklet no disponible, usando fallback:', e.message);
        // Limpiar worklet node si se creó
        if (audioWorkletNode) {
          try { audioWorkletNode.disconnect(); } catch (_) {}
          audioWorkletNode = null;
        }
      }
    }

    // 4. Fallback a ScriptProcessorNode si AudioWorklet no funciona
    if (!workletSuccess) {
      const bufferSize = 2048;
      audioProcessor = inputAudioContext.createScriptProcessor(bufferSize, 1, 1);

      audioProcessor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        processAudioData(new Float32Array(inputData), inputAudioContext.sampleRate);
      };

      inputSource.connect(audioProcessor);
      audioProcessor.connect(inputAudioContext.destination);

      log('⚠️ ScriptProcessor activo (método legacy/fallback)');
    }
  }

  // --- CONEXIÓN PRINCIPAL GEMINI LIVE (PARALELIZADA Y ULTRA-RÁPIDA) ---
  async function connect(targetModel = null) {
    if (isConnecting || isConnected) return;

    // Desbloquear AudioContext en el instante del evento del usuario y emitir earcon inmediato
    unlockAudioContexts();
    playEarcon('activate');

    isConnecting = true;
    currentAttemptModel = targetModel || DEFAULT_CONFIG.primaryModel;

    if (heroBadge) {
      heroBadge.classList.add('gemini-active');
      heroBadge.title = 'Conectando con qüem IA...';
    }
    updateStatusPill('Conectando en vivo...', 'connecting');

    try {
      // Obtener API Key de inmediato (cacheada)
      let apiKey = getApiKey();
      if (!apiKey) {
        apiKey = await preloadApiKey();
      }

      if (!apiKey) {
        showErrorState('Error: API Key de Gemini no configurada.');
        disconnect();
        return;
      }

      // 1. Iniciar captura de micrófono en paralelo (no bloquea el handshake WebSocket)
      const audioInputPromise = startAudioInput();

      // 2. Iniciar WebSocket concurrentemente para máxima velocidad
      const version = DEFAULT_CONFIG.apiVersion;
      const voice = DEFAULT_CONFIG.voice;
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${version}.GenerativeService.BidiGenerateContent?key=${apiKey}`;

      log('Conectando a modelo:', currentAttemptModel);
      ws = new WebSocket(wsUrl);

      let handshakeDone = false;

      // Timeout de conexión ágil de 10s
      const connectionTimeout = setTimeout(() => {
        if (!handshakeDone) {
          warn('Timeout de conexión WebSocket (10s)');
          if (ws) {
            try { ws.close(); } catch (e) {}
          }
        }
      }, 10000);

      ws.onopen = () => {
        log('WebSocket abierto, enviando setup...');
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
            clearTimeout(connectionTimeout);
            handshakeDone = true;
            hasTriedFallback = false;

            // Esperar que la captura de audio esté 100% lista si aún no terminó
            await audioInputPromise;

            updateCallState(true);
            playEarcon('ready');
            resetSilenceTimer();
            log('✅ Handshake completado con modelo:', currentAttemptModel);

            if (DEFAULT_CONFIG.firstMessage) {
              updateStatusPill('qüem IA hablando...', 'speaking');
              const triggerMsg = {
                clientContent: {
                  turns: [
                    {
                      role: "user",
                      parts: [
                        { text: `Saluda al usuario de forma breve diciendo exactamente: "${DEFAULT_CONFIG.firstMessage}"` }
                      ]
                    }
                  ],
                  turnComplete: true
                }
              };
              ws.send(JSON.stringify(triggerMsg));
            } else {
              updateStatusPill('Te escucho... hablá', 'listening');
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
                  updateStatusPill('Te escucho... hablá', 'listening');
                  resetSilenceTimer();
                }
              }, 60);
            }
          }
        } catch (err) {
          error('Error procesando mensaje:', err);
        }
      };

      ws.onerror = (err) => {
        error('Error en WebSocket:', err);
      };

      ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        log('WebSocket cerrado, code:', event.code, 'reason:', event.reason);

        if (!handshakeDone && !hasTriedFallback) {
          hasTriedFallback = true;
          const fallback = (currentAttemptModel === DEFAULT_CONFIG.primaryModel)
            ? DEFAULT_CONFIG.fallbackModel
            : DEFAULT_CONFIG.primaryModel;

          log('Intentando con modelo fallback:', fallback);
          cleanupResources();
          setTimeout(() => {
            isConnecting = false;
            connect(fallback);
          }, 200);
          return;
        }

        disconnect();
      };

    } catch (err) {
      error('Error al inicializar:', err.message || err);
      showErrorState(err.message || 'Error al conectar');
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

    // Limpiar AudioWorklet
    if (audioWorkletNode) {
      try { audioWorkletNode.disconnect(); } catch (e) {}
      audioWorkletNode = null;
    }

    // Limpiar ScriptProcessor
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
    playEarcon('disconnect');
    cleanupResources();
    updateCallState(false);
  }

  // --- INICIALIZACIÓN ---
  window.addEventListener('DOMContentLoaded', () => {
    preloadApiKey();

    heroBadge = document.querySelector('.hero-live-badge');
    heroStatusPill = document.querySelector('.hero-live-status-pill');

    const handleUserTap = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Desbloquear audio context en el instante del toque táctil / clic
      unlockAudioContexts();

      if (isConnected || isConnecting) {
        disconnect();
      } else {
        connect();
      }
    };

    [heroBadge, heroStatusPill].forEach((el) => {
      if (!el) return;
      el.title = 'Toca para hablar con el Asistente IA de qüem';

      // Usar touchend en móvil para evitar el delay de 300ms de click
      if (isMobile) {
        let touchStarted = false;
        el.addEventListener('touchstart', (e) => {
          touchStarted = true;
          e.preventDefault();
          unlockAudioContexts();
        }, { passive: false });

        el.addEventListener('touchend', (e) => {
          if (touchStarted) {
            touchStarted = false;
            e.preventDefault();
            if (isConnected || isConnecting) {
              disconnect();
            } else {
              connect();
            }
          }
        }, { passive: false });
      }

      // Click siempre disponible (desktop y fallback táctil)
      el.addEventListener('click', handleUserTap);
    });
  });

  window.QuemGeminiLive = {
    connect,
    disconnect,
    setApiKey,
    getApiKey
  };
})();
