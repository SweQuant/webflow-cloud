(function () {
  const DATASTEP_TARGET_FRAMES = 90;

  function normalisePoint(point) {
    if (Array.isArray(point)) {
      const [frequency, value] = point;
      return { frequency: Number(frequency), value: Number(value) };
    }

    if (typeof point === 'object' && point !== null) {
      const frequency = 'frequency' in point ? point.frequency : point.x;
      const value = 'value' in point ? point.value : point.y;
      return { frequency: Number(frequency), value: Number(value) };
    }

    return null;
  }

  function parseCsv(text) {
    return text
      .trim()
      .split(/\r?\n/)
      .map((row) =>
        row
          .trim()
          .split(/[\,\t]\s*|\s+/)
          .filter((cell) => cell.length > 0)
          .map((cell) => cell.trim())
      )
      .map(normalisePoint)
      .filter((point) => point && !Number.isNaN(point.frequency) && !Number.isNaN(point.value));
  }

  if (typeof window !== 'undefined' && !window.__ANIMATED_SPECTRUM_PLOT_SPACE_CHECK__) {
    window.__ANIMATED_SPECTRUM_PLOT_SPACE_CHECK__ = true;
    const sampleSpaceDelimited = '100 0.5\n200 0.6';
    const parsedSample = parseCsv(sampleSpaceDelimited);
    const hasNumericValues =
      parsedSample.length > 0 &&
      parsedSample.every(
        (point) =>
          typeof point.frequency === 'number' &&
          typeof point.value === 'number' &&
          !Number.isNaN(point.frequency) &&
          !Number.isNaN(point.value)
      );
    if (!hasNumericValues) {
      console.warn('[animated-spectrum-plot] Space-delimited sample failed to parse via loadData pipeline.', parsedSample);
    } else {
      console.debug('[animated-spectrum-plot] Space-delimited sample parsed for loadData check.', parsedSample);
    }
  }

  function parseJson(text) {
    const raw = JSON.parse(text);
    const rows = Array.isArray(raw) ? raw : raw.data || raw.points || [];
    return rows
      .map(normalisePoint)
      .filter((point) => point && !Number.isNaN(point.frequency) && !Number.isNaN(point.value));
  }

  async function loadData(root) {
    const inline = root.querySelector('script[type="application/json"]');
    if (inline) {
      try {
        return parseJson(inline.textContent);
      } catch (error) {
        console.error('[animated-spectrum-plot] Failed to parse inline JSON data.', error);
        return [];
      }
    }

    const sourceUrl = root.dataset.source;
    if (!sourceUrl) {
      if (Array.isArray(window.webflowSpectrumData)) {
        return window.webflowSpectrumData
          .map(normalisePoint)
          .filter((point) => point && !Number.isNaN(point.frequency) && !Number.isNaN(point.value));
      }
      console.error('[animated-spectrum-plot] No data found. Provide a data-source via <script type="application/json">, data-source attribute, or window.webflowSpectrumData.');
      return [];
    }

    try {
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(`Network error: ${response.status}`);
      }
      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();
      if (contentType.includes('json')) {
        return parseJson(text);
      }
      return parseCsv(text);
    } catch (error) {
      console.error('[animated-spectrum-plot] Failed to load remote data.', error);
      return [];
    }
  }

  function makeFrames(points) {
    if (points.length === 0) {
      return [];
    }

    const frequencies = points.map((point) => point.frequency);
    const values = points.map((point) => point.value);

    const step = Math.max(1, Math.ceil(points.length / DATASTEP_TARGET_FRAMES));
    const frames = [];

      for (let i = step; i <= points.length; i += step) {
        frames.push({
          name: `frame-${i}`,
          data: [
            {
              x: frequencies.slice(0, i),
              y: values.slice(0, i),
            },
          ],
          traces: [0],
        });
      }

      const lastFrame = frames[frames.length - 1];
      if (!lastFrame || lastFrame.data[0].x.length < points.length) {
        frames.push({
          name: 'frame-final',
          data: [
            {
              x: frequencies,
              y: values,
            },
          ],
          traces: [0],
        });
      }

    return { frames, frequencies, values };
  }

  function buildLayout(root, points) {
    const bandTokens = (root.dataset.bandHighlights || '')
      .split('|')
      .map((band) => band.trim())
      .filter(Boolean);

    const shapes = [];
    const annotations = [];

    bandTokens.forEach((band) => {
      const [start, end, label] = band.split(':').map((token) => token.trim());
      const startValue = Number(start);
      const endValue = Number(end);

      if (Number.isNaN(startValue) || Number.isNaN(endValue)) {
        return;
      }

      shapes.push({
        type: 'rect',
        xref: 'x',
        yref: 'paper',
        x0: startValue,
        x1: endValue,
        y0: 0,
        y1: 1,
        fillcolor: 'rgba(14, 165, 233, 0.08)',
        line: { width: 0 },
        layer: 'below',
      });

      if (label) {
        annotations.push({
          text: label,
          x: (startValue + endValue) / 2,
          y: 1.02,
          xref: 'x',
          yref: 'paper',
          showarrow: false,
          font: { size: 12, color: '#0F172A' },
        });
      }
    });

    return {
      title: {
        text: root.dataset.chartTitle || 'Spectrum overview',
        font: { family: 'Inter, sans-serif', size: 20 },
      },
      xaxis: {
        title: root.dataset.xLabel || 'Frequency (GHz)',
        rangeslider: { visible: true },
        zeroline: false,
        gridcolor: '#E2E8F0',
      },
      yaxis: {
        title: root.dataset.yLabel || 'Amplitude (dB)',
        zeroline: false,
        gridcolor: '#E2E8F0',
      },
      margin: { t: 60, r: 40, b: 60, l: 70 },
      plot_bgcolor: '#FFFFFF',
      paper_bgcolor: 'rgba(0,0,0,0)',
      hovermode: 'x unified',
      hoverlabel: {
        bgcolor: '#0F172A',
        font: { color: '#F8FAFC' },
      },
      updatemenus: [
        {
          type: 'buttons',
          direction: 'right',
          x: 0.5,
          y: 1.2,
          xanchor: 'center',
          buttons: [
            {
              label: 'Full range',
              method: 'relayout',
              args: [
                {
                  'xaxis.autorange': true,
                },
              ],
            },
            {
              label: '0 – 23 GHz',
              method: 'relayout',
              args: [
                {
                  'xaxis.range': [0, 23],
                },
              ],
            },
            {
              label: '30 – 80 GHz',
              method: 'relayout',
              args: [
                {
                  'xaxis.range': [30, 80],
                },
              ],
            },
          ],
        },
      ],
      shapes,
      annotations,
    };
  }

  function buildTrace(root, points) {
    const frequencies = points.map((point) => point.frequency);
    const values = points.map((point) => point.value);
    const initialFrequency = frequencies.length ? frequencies[0] : null;
    const initialValue = values.length ? values[0] : null;

    return {
      type: 'scatter',
      mode: 'lines',
      line: {
        width: 3,
        color: root.dataset.lineColor || '#0284C7',
      },
      hovertemplate:
        '<b>%{x:.2f} GHz</b><br>' +
        `${root.dataset.yLabel || 'Amplitude'}: %{y:.2f}<extra></extra>`,
      x: initialFrequency !== null ? [initialFrequency] : [],
      y: initialValue !== null ? [initialValue] : [],
    };
  }

  async function init() {
    const root = document.querySelector('[data-plotly-spectrum]');
    if (!root) {
      console.warn('[animated-spectrum-plot] Missing root element with data-plotly-spectrum attribute.');
      return;
    }

    if (typeof Plotly === 'undefined') {
      console.warn('[animated-spectrum-plot] Plotly library not loaded.');
      return;
    }

    const points = (await loadData(root)).slice().sort((a, b) => a.frequency - b.frequency);
    if (!points.length) {
      return;
    }

    const { frames, frequencies, values } = makeFrames(points);
    const trace = buildTrace(root, points);

    const layout = buildLayout(root, points);
    const config = {
      responsive: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
    };

    Plotly.newPlot(root, [trace], layout, config).then(() => {
      if (frames.length) {
        Plotly.addFrames(root, frames);
        const frameSequence = frames.map((frame) => frame.name);
        Plotly.animate(root, frameSequence, {
          frame: { duration: Number(root.dataset.animationDuration) || 30, redraw: true },
          transition: { duration: 0 },
          mode: 'immediate',
        });
      } else {
        Plotly.extendTraces(root, { x: [frequencies], y: [values] }, [0]);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
