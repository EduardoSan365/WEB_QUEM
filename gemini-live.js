/**
 * qüem Smart Shop — Asistente de Voz en Tiempo Real con Gemini Live API
 * Control 100% integrado en el icono de la 'ü' con temporizador de inactividad de 10s
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
  const STORAGE_VOICE = 'GEMINI_LIVE_VOICE';
  const STORAGE_MODEL = 'GEMINI_LIVE_MODEL';

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

  // Elementos DOM
  let heroBadge = null;
  let configModal = null;
  let apiKeyInput = null;
  let saveApiKeyBtn = null;
  let closeConfigBtn = null;

  // --- GETTERS / SETTERS ---
  function getApiKey() {
    return localStorage.getItem(STORAGE_KEY) || window.GEMINI_API_KEY || '';
  }

  function setApiKey(key) {
    localStorage.setItem(STORAGE_KEY, key.trim());
  }

  function getSelectedModel() {
    return localStorage.getItem(STORAGE_MODEL) || DEFAULT_CONFIG.primaryModel;
  }

  function getSelectedVoice() {
    return localStorage.getItem(STORAGE_VOICE) || DEFAULT_CONFIG.voice;
  }

  // --- HELPERS DE AUDIO ---
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

  // --- TEMPORIZADOR DE SILENCIO / INACTIVIDAD (10 SEGUNDOS) ---
  function resetSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (isConnected) {
      silenceTimer = setTimeout(() => {
        console.log('[qüem Live] Apagado automático por 10 segundos de inactividad.');
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
    clearSilenceTimer(); // Mientras la IA habla no corre el temporizador de silencio

    source.onended = () => {
      const idx = activeSources.indexOf(source);
      if (idx !== -1) activeSources.splice(idx, 1);

      if (activeSources.length === 0 && isConnected) {
        nextAudioStartTime = outputAudioContext ? outputAudioContext.currentTime : 0;
        updateSpeakingState(false);
        resetSilenceTimer(); // Comienza la cuenta de 10s cuando la IA termina de hablar
      }
    };
  }

  // --- ACTUALIZACIÓN DE ESTADOS VISUALES DEL LOGO 'ü' ---
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
        heroBadge.title = 'qüem IA escuchando • Toca para cortar';
      } else {
        heroBadge.classList.remove('vapi-active', 'gemini-active', 'gemini-speaking', 'gemini-listening');
        heroBadge.title = 'Toca la ü para hablar con el Asistente IA de qüem';
      }
    }
  }

  // --- ENTRADA DE AUDIO (MICRÓFONO) ---
  async function startAudioInput() {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    inputAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    inputSource = inputAudioContext.createMediaStreamSource(mediaStream);

    const bufferSize = 2048;
    audioProcessor = inputAudioContext.createScriptProcessor(bufferSize, 1, 1);

    audioProcessor.onaudioprocess = (e) => {
      if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) return;

      // Durante la reproducción de voz de la IA, pausamos el envío de audio para evitar eco
      if (isModelSpeaking && activeSources.length > 0) {
        return;
      }

      const inputData = e.inputBuffer.getChannelData(0);

      // Detección simple de actividad de voz para reiniciar el temporizador de 10s
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

  function setupAudioOutput() {
    outputAudioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 24000
    });
    outputGainNode = outputAudioContext.createGain();
    outputGainNode.gain.value = 1.0;
    outputGainNode.connect(outputAudioContext.destination);
    nextAudioStartTime = 0;
    activeSources = [];
  }

  // --- CONEXIÓN PRINCIPAL GEMINI LIVE CON FALLBACK ---
  async function connect(targetModel = null) {
    const apiKey = getApiKey();
    if (!apiKey) {
      showConfigModal();
      return;
    }

    if (isConnecting || isConnected) return;

    isConnecting = true;
    currentAttemptModel = targetModel || getSelectedModel();

    if (heroBadge) heroBadge.classList.add('gemini-active');

    try {
      setupAudioOutput();
      if (outputAudioContext.state === 'suspended') await outputAudioContext.resume();

      await startAudioInput();
      if (inputAudioContext.state === 'suspended') await inputAudioContext.resume();

      const version = DEFAULT_CONFIG.apiVersion;
      const voice = getSelectedVoice();
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${version}.GenerativeService.BidiGenerateContent?key=${apiKey}`;

      console.log(`[qüem Live] Conectando con ${currentAttemptModel} | Voz: ${voice}`);
      ws = new WebSocket(wsUrl);

      let handshakeDone = false;

      ws.onopen = () => {
        console.log('[qüem Live] WebSocket abierto. Enviando setup inicial...');

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

          // 1. Handshake inicial completado
          if (response.setupComplete) {
            handshakeDone = true;
            hasTriedFallback = false;
            console.log(`[qüem Live] ¡Sesión establecida con éxito!`);
            updateCallState(true);
            resetSilenceTimer();

            // Mensaje de bienvenida inicial
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

          // 2. Transmisión y reproducción de voz
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
                if (part.text) {
                  console.log('[qüem Live]:', part.text);
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
        console.log(`[qüem Live] Conexión cerrada. Código: ${event.code}`);

        // Fallback automático en caso de fallo de modelo inicial
        if (!handshakeDone && !hasTriedFallback) {
          hasTriedFallback = true;
          const fallback = (currentAttemptModel === DEFAULT_CONFIG.primaryModel) 
            ? DEFAULT_CONFIG.fallbackModel 
            : DEFAULT_CONFIG.primaryModel;

          console.log(`[qüem Live] Reintentando con modelo fallback: ${fallback}...`);
          cleanupResources();
          setTimeout(() => {
            isConnecting = false;
            connect(fallback);
          }, 300);
          return;
        }

        if (!handshakeDone) {
          disconnect();
          showConfigModal();
        } else {
          disconnect();
        }
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

  // --- MODAL DE CONFIGURACIÓN DE API KEY (SOLO SI NO ESTÁ GUARDADA) ---
  function showConfigModal() {
    if (!configModal) return;
    apiKeyInput.value = getApiKey();
    configModal.classList.add('active');
    setTimeout(() => apiKeyInput.focus(), 100);
  }

  function hideConfigModal() {
    if (configModal) configModal.classList.remove('active');
  }

  // --- INYECCIÓN DEL MODAL EN EL DOM (SIN WIDGET FLOTANTE) ---
  function injectUI() {
    const modal = document.createElement('div');
    modal.id = 'quemApiKeyModal';
    modal.className = 'quem-modal-backdrop';
    modal.innerHTML = `
      <div class="quem-modal-card">
        <div class="quem-modal-header">
          <h3>🎙️ Activar Asistente de Voz Gemini Live</h3>
          <button type="button" class="quem-modal-close" id="quemCloseModalBtn">✕</button>
        </div>
        <p class="quem-modal-desc">
          Ingresa tu <strong>Gemini API Key</strong> de Google AI Studio para conversar en tiempo real con la IA de <strong>qüem Smart Shop</strong>.
        </p>
        <div class="quem-modal-input-group">
          <input type="password" id="quemApiKeyInput" placeholder="AIzaSy..." autocomplete="off" />
        </div>
        <div class="quem-modal-footer">
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" class="quem-link-key">
            Obtener clave en Google AI Studio ↗
          </a>
          <button type="button" id="quemSaveApiKeyBtn" class="quem-btn-save">
            Guardar y Conectar
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    configModal = modal;
    apiKeyInput = document.getElementById('quemApiKeyInput');
    saveApiKeyBtn = document.getElementById('quemSaveApiKeyBtn');
    closeConfigBtn = document.getElementById('quemCloseModalBtn');

    saveApiKeyBtn.addEventListener('click', () => {
      const key = apiKeyInput.value.trim();
      if (key) {
        setApiKey(key);
        hideConfigModal();
        connect();
      } else {
        alert('Por favor ingresa una clave de API válida.');
      }
    });

    closeConfigBtn.addEventListener('click', hideConfigModal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) hideConfigModal();
    });
  }

  // --- INICIALIZACIÓN ---
  window.addEventListener('DOMContentLoaded', () => {
    injectUI();

    heroBadge = document.querySelector('.hero-live-badge');

    if (heroBadge) {
      heroBadge.title = 'Toca la ü para hablar con el Asistente IA de qüem';

      heroBadge.addEventListener('click', (e) => {
        e.preventDefault();
        if (isConnected || isConnecting) {
          disconnect();
        } else {
          connect();
        }
      });
    }
  });

  window.QuemGeminiLive = {
    connect,
    disconnect,
    setApiKey,
    getApiKey,
    showConfigModal
  };
})();
