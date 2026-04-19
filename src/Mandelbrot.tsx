import React, { useRef, useEffect } from 'react';

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

  varying vec2 v_uv;

  void main() {
    vec2 c = (v_uv * u_resolution) / min(u_resolution.x, u_resolution.y);
    c = c / u_zoom + u_pan;

    vec2 z = vec2(0.0, 0.0);
    int iterations = 0;
    const int max_iterations = 256;

    for (int i = 0; i < max_iterations; i++) {
      float x = (z.x * z.x - z.y * z.y) + c.x;
      float y = (2.0 * z.x * z.y) + c.y;

      if ((x * x + y * y) > 4.0) {
        break;
      }

      z.x = x;
      z.y = y;
      iterations++;
    }

    if (iterations == max_iterations) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
      float t = float(iterations) / float(max_iterations);
      float r = 9.0 * (1.0 - t) * t * t * t;
      float g = 15.0 * (1.0 - t) * (1.0 - t) * t * t;
      float b = 8.5 * (1.0 - t) * (1.0 - t) * (1.0 - t) * t;
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

      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

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

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100vw', height: '100vh', touchAction: 'none' }}
    />
  );
};

export default Mandelbrot;
