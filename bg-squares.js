(() => {
  const canvas = document.getElementById("bg-squares");
  if (!canvas || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return;

  let width = 0;
  let height = 0;
  let devicePixelRatio = 1;
  let particles = [];
  let animationFrame = 0;
  let visible = true;

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * devicePixelRatio);
    canvas.height = Math.floor(height * devicePixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    const count = Math.max(14, Math.min(30, Math.round(width / 55)));
    particles = Array.from({ length: count }, createParticle);
  }

  function createParticle() {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      size: 8 + Math.random() * 20,
      vx: 0.08 + Math.random() * 0.2,
      vy: -0.05 - Math.random() * 0.14,
      rotation: Math.random() * Math.PI,
      rotationSpeed: (Math.random() - 0.5) * 0.006,
      alpha: 0.025 + Math.random() * 0.055
    };
  }

  function draw() {
    if (!visible) return;
    context.clearRect(0, 0, width, height);

    for (const particle of particles) {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.rotation += particle.rotationSpeed;

      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      context.strokeStyle = `rgba(139, 92, 246, ${particle.alpha})`;
      context.lineWidth = 1;
      context.strokeRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
      context.restore();

      if (particle.x > width + 50 || particle.y < -50) {
        particle.x = -30;
        particle.y = height + 30;
      }
    }

    animationFrame = requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    if (visible) draw();
    else cancelAnimationFrame(animationFrame);
  });

  resize();
  draw();
})();
