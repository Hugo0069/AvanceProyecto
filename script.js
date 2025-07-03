const notas = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const perfilMayor = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const perfilMenor = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

let context, buffer, source, analyzer, meyda;
let chromaAcumulada = Array(12).fill(0);
let frameCount = 0;
let notasDetectadas = new Set();
let duracion = 0;
let canvasCtx;
let spectrumCanvas;

document.getElementById("audioFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const arrayBuffer = await file.arrayBuffer();
  context = new (window.AudioContext || window.webkitAudioContext)();
  buffer = await context.decodeAudioData(arrayBuffer);
  duracion = buffer.duration;

  spectrumCanvas = document.getElementById("spectrumCanvas");
  canvasCtx = spectrumCanvas.getContext("2d");

  document.getElementById("startBtn").disabled = false;
});

document.getElementById("startBtn").addEventListener("click", () => {
  chromaAcumulada.fill(0);
  frameCount = 0;
  notasDetectadas.clear();

  const progressBar = document.getElementById("progressBar");
  document.getElementById("notas").innerText = "Notas encontradas: --";
  document.getElementById("tonalidades").innerText = "Tonalidades posibles: --";
  progressBar.value = 0;

  source = context.createBufferSource();
  source.buffer = buffer;

  analyzer = context.createAnalyser();
  analyzer.fftSize = 2048;
  const gain = context.createGain();
  gain.gain.value = 1;

  source.connect(analyzer);
  analyzer.connect(gain);
  gain.connect(context.destination);

  const dataArray = new Uint8Array(analyzer.frequencyBinCount);

  meyda = Meyda.createMeydaAnalyzer({
  audioContext: context,
  source: analyzer,
  bufferSize: 2048,
  featureExtractors: ['chroma'],
  callback: (features) => {
    const chroma = features.chroma;

    // ✅ UMBRAL: evita falsas notas cuando no hay energía
    const energiaChroma = chroma.reduce((a, b) => a + b, 0);
    if (energiaChroma < 1.5) return; // Ignora si no hay información tonal suficiente

    // ⬆️ Acumular para análisis posterior
    for (let i = 0; i < 12; i++) {
      chromaAcumulada[i] += chroma[i];
    }
    frameCount++;

    // 🔎 Detectar nota actual más fuerte
    const indexMax = chroma.indexOf(Math.max(...chroma));
    const notaActual = notas[indexMax];

    // 🎹 Siempre activar la tecla del piano
    activarTecla(notaActual);

    // 📝 Agregar a la lista si es nueva
    if (!notasDetectadas.has(notaActual)) {
      notasDetectadas.add(notaActual);
      document.getElementById("notas").innerText =
        `Notas encontradas: ${Array.from(notasDetectadas).join(", ")}`;
    }

    // 📊 Actualizar barra de progreso
    document.getElementById("progressBar").value =
      (context.currentTime / duracion) * 100;

    // 📈 Dibujar espectro
    analyzer.getByteFrequencyData(dataArray);
    drawSpectrum(dataArray);
  }
});


  meyda.start();
  source.start();
  source.onended = () => {
    meyda.stop();
    const promedio = chromaAcumulada.map(c => c / frameCount);
    mostrarTonalidades(promedio);
  };
});

function mostrarTonalidades(chroma) {
  const tonalidades = [];

  for (let i = 0; i < 12; i++) {
    tonalidades.push({
      tonalidad: `${notas[i]} Mayor`,
      correlacion: correlacionPearson(rotar(perfilMayor, i), chroma)
    });
    tonalidades.push({
      tonalidad: `${notas[i]} menor`,
      correlacion: correlacionPearson(rotar(perfilMenor, i), chroma)
    });
  }

  const top3 = tonalidades.sort((a, b) => b.correlacion - a.correlacion).slice(0, 3);
  const lista = top3.map(t => `🎵 ${t.tonalidad} (${(t.correlacion * 100).toFixed(1)}%)`);
  document.getElementById("tonalidades").innerText = `Tonalidades posibles:\n${lista.join("\n")}`;
}

function rotar(arr, n) {
  return arr.slice(n).concat(arr.slice(0, n));
}

function correlacionPearson(x, y) {
  const n = x.length;
  const mediaX = x.reduce((a, b) => a + b, 0) / n;
  const mediaY = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mediaX) * (y[i] - mediaY);
    denX += (x[i] - mediaX) ** 2;
    denY += (y[i] - mediaY) ** 2;
  }
  return num / Math.sqrt(denX * denY);
}

function drawSpectrum(dataArray) {
  const width = spectrumCanvas.width;
  const height = spectrumCanvas.height;
  const barWidth = (width / dataArray.length) * 2.5;

  canvasCtx.clearRect(0, 0, width, height);
  canvasCtx.fillStyle = "#111";
  canvasCtx.fillRect(0, 0, width, height);

  for (let i = 0; i < dataArray.length; i++) {
    const barHeight = dataArray[i];
    canvasCtx.fillStyle = "lime";
    canvasCtx.fillRect(i * barWidth, height - barHeight, barWidth, barHeight);
  }
    // Frecuencia más alta
    let maxIndex = dataArray.indexOf(Math.max(...dataArray));
    let maxFreq = Math.round((maxIndex * context.sampleRate) / analyzer.fftSize);
  
    canvasCtx.fillStyle = "#fff";
    canvasCtx.font = "16px Arial";
    canvasCtx.fillText(`Frecuencia dominante: ${maxFreq} Hz`, 10, 20);
  
}

function activarTecla(nota) {
  document.querySelectorAll(".key").forEach(el => el.classList.remove("active"));
  const tecla = document.querySelector(`.key[data-note="${nota}"]`);
  if (tecla) tecla.classList.add("active");
}
