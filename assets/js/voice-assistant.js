(function () {
  let recorder = null;
  let mediaStream = null;
  let chunks = [];
  let stopTimer = null;
  let audioContext = null;
  let audioSource = null;
  let analyser = null;
  let acousticTimer = null;
  let acousticSamples = [];
  let recordedAcousticFeatures = null;

  function config() {
    return window.APP_CONFIG || {};
  }

  function element(id) {
    return document.getElementById(id);
  }

  function setStatus(message) {
    const status = element('voiceStatus');
    if (status) status.textContent = message || '';
  }

  function estimatePitch(buffer, sampleRate) {
    const minLag = Math.floor(sampleRate / 400);
    const maxLag = Math.min(Math.floor(sampleRate / 80), buffer.length - 1);
    let bestLag = 0;
    let bestCorrelation = 0;
    for (let lag = minLag; lag <= maxLag; lag += 4) {
      let sum = 0;
      let energyA = 0;
      let energyB = 0;
      for (let index = 0; index < buffer.length - lag; index += 4) {
        const a = buffer[index];
        const b = buffer[index + lag];
        sum += a * b;
        energyA += a * a;
        energyB += b * b;
      }
      const denominator = Math.sqrt(energyA * energyB);
      const correlation = denominator ? sum / denominator : 0;
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestLag = lag;
      }
    }
    return bestCorrelation >= 0.35 && bestLag ? sampleRate / bestLag : null;
  }

  function sampleAcoustics() {
    if (!analyser || !audioContext) return;
    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);
    let sumSquares = 0;
    let peak = 0;
    for (const value of buffer) {
      sumSquares += value * value;
      peak = Math.max(peak, Math.abs(value));
    }
    const rms = Math.sqrt(sumSquares / buffer.length);
    if (rms < 0.008) return;
    acousticSamples.push({ rms, peak, pitchHz: estimatePitch(buffer, audioContext.sampleRate) });
    if (acousticSamples.length > 240) acousticSamples.shift();
  }

  function startAcousticSampling(stream) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      audioContext = new AudioContextClass();
      audioSource = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.2;
      audioSource.connect(analyser);
      acousticSamples = [];
      acousticTimer = window.setInterval(sampleAcoustics, 250);
    } catch (error) {
      audioContext = null;
      audioSource = null;
      analyser = null;
      acousticSamples = [];
    }
  }

  function stopAcousticSampling() {
    if (acousticTimer) window.clearInterval(acousticTimer);
    acousticTimer = null;
    sampleAcoustics();
    const samples = acousticSamples.slice();
    const pitches = samples.map(sample => sample.pitchHz).filter(Number.isFinite);
    const average = key => samples.length
      ? samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length
      : 0;
    const avgRms = average('rms');
    const peakRms = samples.length ? Math.max(...samples.map(sample => sample.peak)) : 0;
    const avgPitchHz = pitches.length ? pitches.reduce((sum, value) => sum + value, 0) / pitches.length : 0;
    const pitchRangeHz = pitches.length ? Math.max(...pitches) - Math.min(...pitches) : 0;
    const loudnessLevel = avgRms >= 0.11 ? 'high' : avgRms >= 0.045 ? 'medium' : 'low';
    const features = {
      avgRms: Number(avgRms.toFixed(4)),
      peakRms: Number(peakRms.toFixed(4)),
      avgPitchHz: Number(avgPitchHz.toFixed(1)),
      pitchRangeHz: Number(pitchRangeHz.toFixed(1)),
      loudnessLevel,
      sampleCount: samples.length,
      pitchSampleCount: pitches.length
    };
    if (audioSource) audioSource.disconnect();
    if (audioContext) audioContext.close().catch(() => {});
    audioSource = null;
    analyser = null;
    audioContext = null;
    acousticSamples = [];
    return features;
  }

  function renderAcousticCue(features) {
    const target = element('voiceAcousticCue');
    if (!target) return;
    const label = features && features.loudnessLevel ? features.loudnessLevel : '';
    const labels = { low: '低', medium: '中', high: '高' };
    target.textContent = label
      ? `聲音表達強度：${labels[label] || '未判定'}（僅輔助，不等同臭味程度）`
      : '聲音表達強度：未取得（不影響快速選項）';
  }

  function chooseMimeType() {
    if (!window.MediaRecorder || typeof MediaRecorder.isTypeSupported !== 'function') return '';
    return ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm']
      .find(type => MediaRecorder.isTypeSupported(type)) || '';
  }

  function setSelectValue(id, value) {
    const select = element(id);
    if (!select || !value) return false;
    const option = Array.from(select.options).find(item => item.value === value);
    if (!option) return false;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function setSmellLevel(value) {
    const level = Number(value);
    if (!Number.isInteger(level) || level < 1 || level > 5) return false;
    const input = document.querySelector(`input[name="smellLevel"][value="${level}"]`);
    if (!input) return false;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function setImpacts(values) {
    const selected = Array.isArray(values) ? values : ['none'];
    const inputs = Array.from(document.querySelectorAll('input[name="odorImpact"]'));
    if (!inputs.length) return;
    inputs.forEach(input => { input.checked = selected.includes(input.value); });
    inputs.forEach(input => input.dispatchEvent(new Event('change', { bubbles: true })));
  }

  window.applyVoiceAnalysis = function (analysis) {
    const result = analysis && typeof analysis === 'object' ? analysis : {};
    setSmellLevel(result.odorLevel);
    setSelectValue('odorType', result.odorType);
    setSelectValue('moenvCause', result.moenvCause);
    setSelectValue('odorDuration', result.duration);
    setSelectValue('suspectedSource', result.suspectedSource);
    setImpacts(result.impacts);
    const detail = element('odorDetail');
    if (detail && result.detail && !detail.value.trim()) detail.value = result.detail;
    if (typeof window.refreshReportDescriptionIfPristine === 'function') {
      window.refreshReportDescriptionIfPristine();
    }
    const confidence = Number(result.confidence);
    const confidenceText = Number.isFinite(confidence) && confidence > 0
      ? `（模型信心 ${(confidence * 100).toFixed(0)}%，請自行確認）`
      : '（請自行確認）';
    setStatus(`已套用語音分類${confidenceText}`);
    return result;
  };

  function dataUrlToBase64(dataUrl) {
    const comma = dataUrl.indexOf(',');
    return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  }

  function readBlob(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(dataUrlToBase64(String(reader.result || '')));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function sendAudio(blob, acousticFeatures) {
    const endpoint = config().voiceAnalysisEndpoint;
    if (!endpoint) {
      setStatus('語音分析服務尚未啟用，請使用下方快速選項。');
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config().requestTimeoutMs || 30000);
    try {
      setStatus('語音辨識與分類中，請稍候…');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: await readBlob(blob), mimeType: blob.type, locale: 'zh-TW', acousticFeatures }),
        mode: 'cors',
        signal: controller.signal
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || `語音服務回應 ${response.status}`);
      const transcript = element('voiceTranscript');
      if (transcript) transcript.textContent = result.transcript || '（沒有辨識到語音）';
      renderAcousticCue(result.acousticFeatures || acousticFeatures);
      window.applyVoiceAnalysis(result.analysis || {});
    } catch (error) {
      setStatus(error.name === 'AbortError' ? '語音分析逾時，請改用快速選項。' : '語音分析失敗，請改用快速選項。');
    } finally {
      clearTimeout(timeout);
    }
  }

  function stopRecording() {
    if (stopTimer) clearTimeout(stopTimer);
    stopTimer = null;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recordedAcousticFeatures = stopAcousticSampling();
    if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
    const startButton = element('voiceStartButton');
    const stopButton = element('voiceStopButton');
    if (startButton) startButton.hidden = false;
    if (stopButton) stopButton.hidden = true;
  }

  async function startRecording() {
    if (!config().voiceAnalysisEndpoint) {
      setStatus('語音分析服務尚未啟用，請使用下方快速選項。');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      setStatus('此瀏覽器不支援錄音，請使用快速選項。');
      return;
    }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
      chunks = [];
      const mimeType = chooseMimeType();
      recorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = event => { if (event.data && event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
        sendAudio(blob, recordedAcousticFeatures);
      };
      recorder.start();
      startAcousticSampling(mediaStream);
      const startButton = element('voiceStartButton');
      const stopButton = element('voiceStopButton');
      if (startButton) startButton.hidden = true;
      if (stopButton) stopButton.hidden = false;
      setStatus('正在聆聽，請用一句話描述臭味；最多 15 秒。');
      const seconds = Math.max(5, Math.min(30, Number(config().voiceMaxSeconds) || 15));
      stopTimer = setTimeout(stopRecording, seconds * 1000);
    } catch (error) {
      if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
      setStatus('無法取得麥克風權限，請改用快速選項。');
    }
  }

  function setup() {
    const startButton = element('voiceStartButton');
    const stopButton = element('voiceStopButton');
    if (!startButton || !stopButton) return;
    startButton.addEventListener('click', startRecording);
    stopButton.addEventListener('click', stopRecording);
    stopButton.hidden = true;
    if (!config().voiceAnalysisEndpoint) setStatus('語音分析服務尚未啟用；可先使用快速選項。');
  }

  window.addEventListener('DOMContentLoaded', setup);
})();
