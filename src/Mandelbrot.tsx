import React, { useRef, useEffect, useState } from 'react';

const vertexShaderSource = `
  attribute vec2 a_position;
  varying vec2 v_uv;

  void main() {
    v_uv = a_position;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform vec2 u_pan;
  uniform float u_zoom;

  uniform int u_max_iterations;
  uniform vec3 u_color_multipliers;

  varying vec2 v_uv;

  void main() {
    vec2 c = (v_uv * u_resolution) / min(u_resolution.x, u_resolution.y);
    c = c / u_zoom + u_pan;

    vec2 z = vec2(0.0, 0.0);
    int iterations = 0;
    const int MAX_LOOP = 1000;

    for (int i = 0; i < MAX_LOOP; i++) {
      if (i >= u_max_iterations) {
        break;
      }

      float x = (z.x * z.x - z.y * z.y) + c.x;
      float y = (2.0 * z.x * z.y) + c.y;

      if ((x * x + y * y) > 4.0) {
        break;
      }

      z.x = x;
      z.y = y;
      iterations++;
    }

    if (iterations == u_max_iterations) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
      float t = float(iterations) / float(u_max_iterations);
      float r = u_color_multipliers.r * (1.0 - t) * t * t * t;
      float g = u_color_multipliers.g * (1.0 - t) * (1.0 - t) * t * t;
      float b = u_color_multipliers.b * (1.0 - t) * (1.0 - t) * (1.0 - t) * t;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  }
`;

const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
};

const Mandelbrot: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderRef = useRef<(() => void) | null>(null);

  const [maxIterations, setMaxIterations] = useState(256);
  const [colorR, setColorR] = useState(9.0);
  const [colorG, setColorG] = useState(15.0);
  const [colorB, setColorB] = useState(8.5);

  const maxIterationsRef = useRef(maxIterations);
  const colorRRef = useRef(colorR);
  const colorGRef = useRef(colorG);
  const colorBRef = useRef(colorB);

  useEffect(() => {
    maxIterationsRef.current = maxIterations;
    colorRRef.current = colorR;
    colorGRef.current = colorG;
    colorBRef.current = colorB;
    if (renderRef.current) {
      requestAnimationFrame(renderRef.current);
    }
  }, [maxIterations, colorR, colorG, colorB]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl');
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      return;
    }

    gl.useProgram(program);

    // Set up geometry (a simple full-screen quad)
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
      -1.0,  1.0,
       1.0, -1.0,
       1.0,  1.0,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    const panLocation = gl.getUniformLocation(program, 'u_pan');
    const zoomLocation = gl.getUniformLocation(program, 'u_zoom');

    const maxIterationsLocation = gl.getUniformLocation(program, 'u_max_iterations');
    const colorMultipliersLocation = gl.getUniformLocation(program, 'u_color_multipliers');

    // Initial state
    let panX = -0.5;
    let panY = 0.0;
    let zoom = 1.0;
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    const render = () => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform2f(panLocation, panX, panY);
      gl.uniform1f(zoomLocation, zoom);

      gl.uniform1i(maxIterationsLocation, maxIterationsRef.current);
      gl.uniform3f(colorMultipliersLocation, colorRRef.current, colorGRef.current, colorBRef.current);

      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    renderRef.current = render;

    // Event handlers
    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = e.clientX - lastMouseX;
      const deltaY = e.clientY - lastMouseY;

      lastMouseX = e.clientX;
      lastMouseY = e.clientY;

      // Adjust panning relative to current zoom and canvas dimensions
      const minDim = Math.min(canvas.width, canvas.height);
      panX -= (deltaX / minDim) * 2.0 / zoom;
      panY += (deltaY / minDim) * 2.0 / zoom;

      requestAnimationFrame(render);
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const zoomFactor = 1.1;
      const oldZoom = zoom;

      if (e.deltaY < 0) {
        zoom *= zoomFactor;
      } else {
        zoom /= zoomFactor;
      }

      // Keep zoom centered on the mouse position
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Convert mouse coordinates to normalized device coordinates (-1 to 1)
      const ndcX = (mouseX / canvas.width) * 2 - 1;
      const ndcY = 1 - (mouseY / canvas.height) * 2;

      // Adjust normalized coordinates by aspect ratio to get UV coordinates matching shader logic
      const aspectX = canvas.width / Math.min(canvas.width, canvas.height);
      const aspectY = canvas.height / Math.min(canvas.width, canvas.height);
      const uvX = ndcX * aspectX;
      const uvY = ndcY * aspectY;

      // Adjust pan to zoom towards mouse position
      panX += uvX * (1 / oldZoom - 1 / zoom);
      panY += uvY * (1 / oldZoom - 1 / zoom);

      requestAnimationFrame(render);
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === canvas) {
          canvas.width = entry.contentRect.width;
          canvas.height = entry.contentRect.height;
          requestAnimationFrame(render);
        }
      }
    });

    observer.observe(canvas);

    // Initial size
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    requestAnimationFrame(render);

    // Cleanup
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('wheel', handleWheel);
      observer.disconnect();
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteBuffer(positionBuffer);
    };
  }, []);

  const handleReset = () => {
    setMaxIterations(256);
    setColorR(9.0);
    setColorG(15.0);
    setColorB(8.5);
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
      />
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        background: 'rgba(0,0,0,0.7)',
        color: 'white',
        padding: '15px',
        borderRadius: '8px',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        fontFamily: 'sans-serif',
        minWidth: '200px'
      }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>Controls</h3>

        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '12px' }}>
          Max Iterations: {maxIterations}
          <input type="range" min="10" max="1000" step="10" value={maxIterations} onChange={(e) => setMaxIterations(Number(e.target.value))} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '12px' }}>
          Color Red: {colorR.toFixed(1)}
          <input type="range" min="0" max="20" step="0.1" value={colorR} onChange={(e) => setColorR(Number(e.target.value))} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '12px' }}>
          Color Green: {colorG.toFixed(1)}
          <input type="range" min="0" max="20" step="0.1" value={colorG} onChange={(e) => setColorG(Number(e.target.value))} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '12px' }}>
          Color Blue: {colorB.toFixed(1)}
          <input type="range" min="0" max="20" step="0.1" value={colorB} onChange={(e) => setColorB(Number(e.target.value))} />
        </label>

        <button
          onClick={handleReset}
          style={{
            marginTop: '10px',
            padding: '8px',
            cursor: 'pointer',
            background: '#444',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
};

export default Mandelbrot;
