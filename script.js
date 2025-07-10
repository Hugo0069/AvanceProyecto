// Configuración inicial
const notas = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const perfilMayor = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const perfilMenor = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Variables globales
let context, buffer, source, analyzer, meyda;
let chromaAcumulada = Array(12).fill(0);
let frameCount = 0;
let notasDetectadas = new Set();
let duracion = 0;
let canvasCtx, spectrumCanvas;

// Colores para las notas
const noteColors = {
  'C': '#FF3E4D', 'C#': '#FF8A4B', 'D': '#FFD166', 
  'D#': '#06D6A0', 'E': '#118AB2', 'F': '#073B4C',
  'F#': '#EF476F', 'G': '#7B2CBF', 'G#': '#3A0CA3', 
  'A': '#4361EE', 'A#': '#4CC9F0', 'B': '#F72585'
};

// Inicialización al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  spectrumCanvas = document.getElementById('spectrumCanvas');
  canvasCtx = spectrumCanvas.getContext('2d');
  setupPianoInteractivity();
});

// Configurar interactividad del piano
function setupPianoInteractivity() {
  document.querySelectorAll('.key').forEach(key => {
    key.addEventListener('click', () => {
      const note = key.getAttribute('data-note');
      playNote(note);
    });
  });
}

// Reproducir nota con Tone.js
function playNote(note) {
  const synth = new Tone.Synth().toDestination();
  synth.triggerAttackRelease(`${note}4`, "8n");
}

// Manejo de archivo de audio
document.getElementById("audioFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const arrayBuffer = await file.arrayBuffer();
    context = new (window.AudioContext || window.webkitAudioContext)();
    buffer = await context.decodeAudioData(arrayBuffer);
    duracion = buffer.duration;
    document.getElementById("startBtn").disabled = false;
  } catch (error) {
    alert("Error al cargar el archivo: " + error.message);
  }
});

// Análisis de audio
document.getElementById("startBtn").addEventListener("click", () => {
  if (!buffer) return;

  // Resetear variables
  chromaAcumulada.fill(0);
  frameCount = 0;
  notasDetectadas.clear();
  document.getElementById("progressBar").value = 0;
  document.getElementById("notas").innerText = "Notas encontradas: --";
  document.getElementById("tonalidades").innerText = "Tonalidad más probable: --";
  document.getElementById("progresiones-container").style.display = "none";

  // Configurar gráfico de espectro
  source = context.createBufferSource();
  source.buffer = buffer;
  analyzer = context.createAnalyser();
  analyzer.fftSize = 2048;
  source.connect(analyzer);
  analyzer.connect(context.destination);

  // Configurar Meyda para análisis cromático
  meyda = Meyda.createMeydaAnalyzer({
    audioContext: context,
    source: analyzer,
    bufferSize: 2048,
    featureExtractors: ['chroma'],
    callback: (features) => {
      if (!features.chroma) return;

      // Acumular datos cromáticos
      for (let i = 0; i < 12; i++) {
        chromaAcumulada[i] += features.chroma[i];
      }
      frameCount++;

      // Detectar nota predominante
      const indexMax = features.chroma.indexOf(Math.max(...features.chroma));
      const notaActual = notas[indexMax];
      activarTecla(notaActual);

      // Actualizar lista de notas
      if (!notasDetectadas.has(notaActual)) {
        notasDetectadas.add(notaActual);
        document.getElementById("notas").innerText = `Notas encontradas: ${Array.from(notasDetectadas).join(", ")}`;
      }

      // Actualizar barra de progreso
      document.getElementById("progressBar").value = (context.currentTime / duracion) * 100;

      // Dibujar espectro
      const dataArray = new Uint8Array(analyzer.frequencyBinCount);
      analyzer.getByteFrequencyData(dataArray);
      drawSpectrum(dataArray);
    }
  });

  meyda.start();
  source.start(0);
  source.onended = () => {
    meyda.stop();
    const chromaPromedio = chromaAcumulada.map(c => c / frameCount);
    mostrarTonalidades(chromaPromedio);
  };
});

// Visualización del espectro mejorada
function drawSpectrum(dataArray) {
  const width = spectrumCanvas.width;
  const height = spectrumCanvas.height;
  const barWidth = (width / dataArray.length) * 2.5;

  canvasCtx.clearRect(0, 0, width, height);
  canvasCtx.fillStyle = "#111";
  canvasCtx.fillRect(0, 0, width, height);

  // Dibujar barras de frecuencia con colores por nota
  for (let i = 0; i < dataArray.length; i++) {
    const barHeight = dataArray[i] / 2;
    const freq = (i * context.sampleRate) / analyzer.fftSize;
    const note = frecuenciaANota(freq);
    canvasCtx.fillStyle = noteColors[note] || "#00b894";
    canvasCtx.fillRect(i * barWidth, height - barHeight, barWidth, barHeight);
  }

  // Mostrar frecuencia dominante
  const maxIndex = dataArray.indexOf(Math.max(...dataArray));
  const maxFreq = Math.round((maxIndex * context.sampleRate) / analyzer.fftSize);
  canvasCtx.fillStyle = "white";
  canvasCtx.font = "16px Arial";
  canvasCtx.fillText(`Frecuencia dominante: ${maxFreq} Hz (${frecuenciaANota(maxFreq)})`, 10, 20);
}

// Convertir frecuencia a nota musical
function frecuenciaANota(freq) {
  if (freq < 20) return "N/A";
  const A4 = 440;
  const semitones = Math.round(12 * Math.log2(freq / A4));
  return notas[(semitones + 69) % 12];
}

function notaTonicaCoincide(tonalidad, notasUsadas) {
  const nota = tonalidad.split(' ')[0];
  return notasUsadas.has(nota);
}


// Mostrar resultados de tonalidades y progresiones
function mostrarTonalidades(chroma) {
  const tonalidades = [];

  // Calcular correlación para todas las tonalidades
  for (let i = 0; i < 12; i++) {
    tonalidades.push({
      tonalidad: `${notas[i]} Mayor`,
      correlacion: correlacionPearson(rotar(perfilMayor, i), chroma),
      tipo: 'mayor'
    });
    tonalidades.push({
      tonalidad: `${notas[i]} menor`,
      correlacion: correlacionPearson(rotar(perfilMenor, i), chroma),
      tipo: 'menor'
    });
  }

  // Ordenar y obtener la tonalidad principal
  tonalidades.sort((a, b) => b.correlacion - a.correlacion);

// Preferir tonalidades cuya tónica está presente en las notas encontradas
let tonalidadPrincipal = tonalidades.find(t => notaTonicaCoincide(t.tonalidad, notasDetectadas)) || tonalidades[0];

  // Mostrar resultados
  document.getElementById("tonalidades").innerHTML = `
    Tonalidad más probable: <strong>${tonalidadPrincipal.tonalidad}</strong><br>
    Correlación: ${(tonalidadPrincipal.correlacion * 100).toFixed(1)}%
  `;

  // Generar progresiones para la tonalidad principal
  mostrarProgresiones(tonalidadPrincipal.tonalidad, tonalidadPrincipal.tipo);
}

// Base de datos de progresiones comunes
const progresionesComunes = {
  'mayor': [
    ['I', 'V', 'vi', 'IV'],
    ['I', 'IV', 'V', 'IV'],
    ['vi', 'IV', 'I', 'V'],
    ['I', 'vi', 'IV', 'V']
  ],
  'menor': [
    ['i', 'iv', 'v', 'i'],
    ['i', 'VI', 'III', 'VII'],
    ['i', 'VII', 'VI', 'V'],
    ['i', 'iv', 'VII', 'III']
  ]
};

// Mostrar progresiones sugeridas
function mostrarProgresiones(tonalidad, tipo) {
  const container = document.getElementById("progresiones-container");
  const tonalidadElement = document.getElementById("tonalidad-principal");
  const listElement = document.getElementById("progresiones-list");

  // Mostrar sección
  container.style.display = "block";
  tonalidadElement.textContent = tonalidad;

  // Obtener progresiones según el tipo
  const progresiones = progresionesComunes[tipo];
  const notaBase = tonalidad.split(' ')[0];
  const acordes = generarAcordes(notaBase, tipo);

  // Mostrar cada progresión
  listElement.innerHTML = progresiones.map((progresion, i) => {
  const acordesProgresion = progresion.map(grado => {
    const acorde = acordes[grado.replace('°', '')];
    const esDisminuido = grado.includes('°');
    return `<span class="acorde ${esDisminuido ? 'disminuido' : ''}">${acorde}${esDisminuido ? '°' : ''}</span>`;
  }).join(' → ');

  const nombreArchivo = `progresion_${i + 1}.mid`;
  const progresionJSON = JSON.stringify(progresion);

  return `
    <div class="progresion">
      <p>${progresion.join(' - ')}:</p>
      <div class="acordes">${acordesProgresion}</div>
      <button onclick='generarMIDI(${progresionJSON}, ${JSON.stringify(acordes)}, "${nombreArchivo}")'>
        🎵 Descargar MIDI
      </button>
    </div>
  `;
}).join('');

}

// Generar acordes para una tonalidad
function generarAcordes(notaBase, tipo) {
  const escalas = {
    'mayor': [0, 2, 4, 5, 7, 9, 11],
    'menor': [0, 2, 3, 5, 7, 8, 10]
  };

  const indices = escalas[tipo];
  const acordes = {};
  const inicio = notas.indexOf(notaBase);

  // Grados romanos según el tipo
  const gradosRomanos = tipo === 'mayor' ? 
    ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'] : 
    ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];

  indices.forEach((offset, i) => {
    const nota = notas[(inicio + offset) % 12];
    acordes[gradosRomanos[i].replace('°', '')] = nota;
  });

  return acordes;
}

// Funciones auxiliares
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

function activarTecla(nota) {
  document.querySelectorAll(".key").forEach(el => el.classList.remove("active"));
  const tecla = document.querySelector(`.key[data-note="${nota}"]`);
  if (tecla) {
    tecla.classList.add("active");
    setTimeout(() => tecla.classList.remove("active"), 300);
  }
}

function generarMIDI(progresion, acordes, nombreArchivo = 'progresion.mid') {
  const midi = new Midi();
  const track = midi.addTrack();

  progresion.forEach((grado, index) => {
    const gradoLimpio = grado.replace('°', '');
    const nota = acordes[gradoLimpio];
    if (!nota) return;

    const rootMidi = Tone.Frequency(`${nota}4`).toMidi();

    let intervalo3, intervalo5;

    // Determinar tipo de acorde
    if (grado === grado.toUpperCase()) {
      // Mayor
      intervalo3 = 4;
      intervalo5 = 7;
    } else if (grado.includes('°')) {
      // Disminuido
      intervalo3 = 3;
      intervalo5 = 6;
    } else {
      // Menor
      intervalo3 = 3;
      intervalo5 = 7;
    }

    const duracion = 0.8;
    const tiempo = index * duracion;

    // Añadir las 3 notas del acorde
    track.addNote({ midi: rootMidi, time: tiempo, duration: duracion });
    track.addNote({ midi: rootMidi + intervalo3, time: tiempo, duration: duracion });
    track.addNote({ midi: rootMidi + intervalo5, time: tiempo, duration: duracion });
  });

  const bytes = midi.toArray();
  const blob = new Blob([new Uint8Array(bytes)], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

